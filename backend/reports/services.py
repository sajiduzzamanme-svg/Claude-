"""Read-only management figures. Nothing here writes to the database."""
from collections import defaultdict
from datetime import date as date_cls, timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from accounts.models import Account, CostCategory, CostHead, JournalLine
from accounts.services import balance
from construction.models import Expense, VendorBill, VendorPayment
from core.money import ZERO, money
from land.models import LandParcel, LandPayment
from projects.models import Estimate, EstimateLine, Flat, Project
from projects.services import project_progress
from sales.models import Booking, Cancellation, Installment, Receipt, RefundPayment
from sales.services import add_months

LIVE = (Booking.Status.ACTIVE, Booking.Status.HANDED_OVER)
UNREGISTERED = (LandParcel.Stage.NEGOTIATION, LandParcel.Stage.BAYNA)
BUILD_CATEGORIES = [c for c in CostCategory.values if c != CostCategory.LAND]


def today():
    return timezone.localdate()


def pct(part, whole) -> Decimal:
    if not whole:
        return Decimal("0.0")
    return (Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("0.1"))


def _sum(qs, expr):
    return qs.aggregate(t=Sum(expr))["t"] or ZERO


def active_estimate(project):
    """The approved estimate, or failing that the newest draft."""
    return (
        project.estimates.filter(status=Estimate.Status.APPROVED).first()
        or project.estimates.exclude(status=Estimate.Status.SUPERSEDED).order_by("-version").first()
    )


def estimate_by_category(estimate) -> dict:
    out = {c: ZERO for c in CostCategory.values}
    if estimate:
        for cat, total in estimate.lines.values_list("cost_head__category").annotate(t=Sum("amount")):
            out[cat] = total or ZERO
    return out


def actual_by_category(project) -> dict:
    """Cost recognised in the ledger so far, by category (voids net out)."""
    out = {c: ZERO for c in CostCategory.values}
    rows = (
        JournalLine.objects.filter(project=project, cost_head__isnull=False)
        .values_list("cost_head__category").annotate(d=Sum("debit"), c=Sum("credit"))
    )
    for cat, d, c in rows:
        out[cat] = (d or ZERO) - (c or ZERO)
    return out


def sale_split(land_price, construction_price, other_charges, discount, total_price, revision_amount):
    """Split a contract into its land part and its building part.

    A discount reduces both parts in proportion; price revisions (cost
    overruns shared by owners) belong to the building part.
    """
    gross = land_price + construction_price + other_charges
    land_net = money(land_price - (discount * land_price / gross)) if gross else ZERO
    return land_net, total_price - land_net + revision_amount


def project_financials(project: Project, as_of=None) -> dict:
    as_of = as_of or today()
    flats = list(project.flats.values("id", "size_sqft", "status", "land_price", "construction_price", "other_charges"))
    total_sqft = sum((f["size_sqft"] for f in flats), Decimal("0"))
    counts = defaultdict(int)
    for f in flats:
        counts[f["status"]] += 1
    unsold = [f for f in flats if f["status"] in (Flat.Status.AVAILABLE, Flat.Status.HOLD)]
    unsold_value = sum((f["land_price"] + f["construction_price"] + f["other_charges"] for f in unsold), ZERO)

    bookings = list(
        Booking.objects.filter(project=project, status__in=LIVE).values(
            "id", "flat__size_sqft", "land_price", "construction_price", "other_charges", "discount",
            "total_price", "revision_amount",
        )
    )
    sold_sqft = sum((b["flat__size_sqft"] for b in bookings), Decimal("0"))
    sold_land = sold_building = ZERO
    for b in bookings:
        land_part, building_part = sale_split(
            b["land_price"], b["construction_price"], b["other_charges"], b["discount"], b["total_price"], b["revision_amount"]
        )
        sold_land += land_part
        sold_building += building_part
    sold_value = sold_land + sold_building

    inst = Installment.objects.filter(booking__project=project, booking__status__in=LIVE)
    collected = _sum(inst, "paid_amount")
    receivable = sold_value - collected
    open_inst = inst.filter(paid_amount__lt=F("amount"))
    overdue = _sum(open_inst.filter(due_date__lt=as_of), F("amount") - F("paid_amount"))
    due_30 = _sum(
        open_inst.filter(due_date__gte=as_of, due_date__lte=as_of + timedelta(days=30)), F("amount") - F("paid_amount")
    )

    # --- land -----------------------------------------------------------
    parcels = list(project.land_parcels.all())
    land_paid = _sum(LandPayment.objects.filter(parcel__project=project, status=LandPayment.Status.POSTED), "amount")
    land_agreed = sum((p.agreed_price for p in parcels), ZERO)
    paid_by_parcel = dict(
        LandPayment.objects.filter(parcel__project=project, status=LandPayment.Status.POSTED)
        .values_list("parcel").annotate(t=Sum("amount"))
    )
    bayna_remaining, next_deadline = ZERO, None
    unregistered_agreed = ZERO
    for p in parcels:
        if not p.is_registered:
            unregistered_agreed += p.agreed_price
            left = p.agreed_price - (paid_by_parcel.get(p.id) or ZERO)
            bayna_remaining += left
            if left > 0 and p.registration_deadline and (next_deadline is None or p.registration_deadline < next_deadline):
                next_deadline = p.registration_deadline

    # --- cost -----------------------------------------------------------
    estimate = active_estimate(project)
    est = estimate_by_category(estimate)
    act = actual_by_category(project)
    est_land, act_land = est[CostCategory.LAND], act[CostCategory.LAND]
    est_build = sum((est[c] for c in BUILD_CATEGORIES), ZERO)
    act_build = sum((act[c] for c in BUILD_CATEGORIES), ZERO)
    land_committed = act_land + unregistered_agreed  # unregistered land is agreed but not yet in the ledger as cost
    land_basis = max(est_land, land_committed)
    build_basis = max(est_build, act_build)
    cost_basis = land_basis + build_basis

    # --- profit ---------------------------------------------------------
    sold_ratio = (sold_sqft / total_sqft) if total_sqft else Decimal("0")
    land_profit = sold_land - money(land_basis * sold_ratio)
    build_profit = sold_building - money(build_basis * sold_ratio)
    booked_profit = land_profit + build_profit
    realised_profit = money(booked_profit * collected / sold_value) if sold_value else ZERO
    projected_revenue = sold_value + unsold_value
    projected_profit = projected_revenue - cost_basis

    # --- cash & payables --------------------------------------------------
    cash_ids = list(Account.objects.filter(is_cash_bank=True).values_list("id", flat=True))
    cash = JournalLine.objects.filter(project=project, account_id__in=cash_ids).aggregate(d=Sum("debit"), c=Sum("credit"))
    net_cash = (cash["d"] or ZERO) - (cash["c"] or ZERO)
    bills = VendorBill.objects.filter(project=project, status=VendorBill.Status.POSTED)
    vendor_payable = _sum(bills, F("net_payable") - F("paid_amount"))
    retention_held = _sum(bills, F("retention_amount") - F("retention_released"))
    actual_total = act_land + act_build

    return {
        "project": {
            "id": project.id, "code": project.code, "name": project.name, "location": project.location,
            "status": project.status, "sales_open": project.sales_open, "storeys": project.storeys,
            "expected_handover": project.expected_handover, "land_area_katha": str(project.land_area_katha),
        },
        "flats": {
            "total": len(flats), "available": counts[Flat.Status.AVAILABLE], "hold": counts[Flat.Status.HOLD],
            "booked": counts[Flat.Status.BOOKED], "handed_over": counts[Flat.Status.HANDED_OVER],
            "sold": counts[Flat.Status.BOOKED] + counts[Flat.Status.HANDED_OVER],
            "total_sqft": str(total_sqft), "sold_sqft": str(sold_sqft), "unsold_value": str(unsold_value),
        },
        "sales": {
            "sold_value": str(sold_value), "sold_land_value": str(sold_land), "sold_building_value": str(sold_building),
            "collected": str(collected), "receivable": str(receivable), "overdue": str(overdue),
            "due_next_30_days": str(due_30), "not_yet_due": str(receivable - overdue),
        },
        "land": {
            "parcels": len(parcels), "agreed": str(land_agreed), "paid": str(land_paid),
            "remaining": str(land_agreed - land_paid), "bayna_remaining": str(bayna_remaining),
            "next_deadline": next_deadline,
        },
        "cost": {
            "estimate_version": estimate.version if estimate else None,
            "estimate_status": estimate.status if estimate else None,
            "estimate_land": str(est_land), "estimate_building": str(est_build), "estimate_total": str(est_land + est_build),
            "actual_land": str(act_land), "actual_building": str(act_build), "actual_total": str(actual_total),
            "land_committed": str(land_committed), "land_basis": str(land_basis), "building_basis": str(build_basis),
            "cost_basis": str(cost_basis),
            "overrun": str(max(act_build - est_build, ZERO) + max(land_committed - est_land, ZERO)) if estimate else "0.00",
        },
        "profit": {
            "land": str(land_profit), "building": str(build_profit), "booked": str(booked_profit),
            "realised": str(realised_profit), "margin_percent": str(pct(booked_profit, sold_value)),
            "projected_revenue": str(projected_revenue), "projected": str(projected_profit),
            "projected_margin_percent": str(pct(projected_profit, projected_revenue)),
        },
        "cash": {"net": str(net_cash), "vendor_payable": str(vendor_payable), "retention_held": str(retention_held)},
        "progress": {
            "work": str(project_progress(project)),
            "cost": str(min(pct(actual_total, cost_basis), Decimal("100.0"))),
            "collection": str(pct(collected, sold_value)),
            "sales": str(pct(counts[Flat.Status.BOOKED] + counts[Flat.Status.HANDED_OVER], len(flats))),
        },
    }


def estimate_vs_actual(project: Project) -> dict:
    estimate = active_estimate(project)
    est = defaultdict(lambda: ZERO)
    if estimate:
        for head, total in estimate.lines.values_list("cost_head").annotate(t=Sum("amount")):
            est[head] = total or ZERO
    act = defaultdict(lambda: ZERO)
    for head, d, c in (
        JournalLine.objects.filter(project=project, cost_head__isnull=False)
        .values_list("cost_head").annotate(d=Sum("debit"), c=Sum("credit"))
    ):
        act[head] = (d or ZERO) - (c or ZERO)
    rows = []
    for head in CostHead.objects.filter(id__in=set(est) | set(act)).order_by("code"):
        e, a = est[head.id], act[head.id]
        rows.append({
            "cost_head": head.id, "code": head.code, "name": head.name, "name_bn": head.name_bn,
            "category": head.category, "estimate": str(e), "actual": str(a), "variance": str(e - a),
            "used_percent": str(pct(a, e)) if e else None, "over_budget": a > e,
        })
    cats = []
    for cat in CostCategory.values:
        e = sum((Decimal(r["estimate"]) for r in rows if r["category"] == cat), ZERO)
        a = sum((Decimal(r["actual"]) for r in rows if r["category"] == cat), ZERO)
        if e or a:
            cats.append({"category": cat, "estimate": str(e), "actual": str(a), "variance": str(e - a), "over_budget": a > e})
    te = sum((Decimal(r["estimate"]) for r in rows), ZERO)
    ta = sum((Decimal(r["actual"]) for r in rows), ZERO)
    return {
        "project": project.id,
        "estimate": {"id": estimate.id, "version": estimate.version, "status": estimate.status, "title": estimate.title} if estimate else None,
        "rows": rows, "categories": cats,
        "totals": {"estimate": str(te), "actual": str(ta), "variance": str(te - ta), "used_percent": str(pct(ta, te))},
    }


def receivables(project=None, as_of=None) -> dict:
    as_of = as_of or today()
    qs = Installment.objects.filter(booking__status__in=LIVE, paid_amount__lt=F("amount")).select_related(
        "booking__customer", "booking__flat", "booking__project"
    )
    if project:
        qs = qs.filter(booking__project=project)
    buckets = {"not_due": ZERO, "d1_30": ZERO, "d31_60": ZERO, "d61_90": ZERO, "d90_plus": ZERO}
    by_booking = {}
    for inst in qs:
        left = inst.outstanding
        days = (as_of - inst.due_date).days
        key = "not_due" if days <= 0 else "d1_30" if days <= 30 else "d31_60" if days <= 60 else "d61_90" if days <= 90 else "d90_plus"
        buckets[key] += left
        b = inst.booking
        row = by_booking.setdefault(b.id, {
            "booking": b.id, "number": b.number, "customer": b.customer.name, "customer_id": b.customer_id,
            "phone": b.customer.phone, "project": b.project.code, "flat": b.flat.code,
            "not_due": ZERO, "overdue": ZERO, "oldest_due": None, "max_days_overdue": 0,
        })
        if days > 0:
            row["overdue"] += left
            row["max_days_overdue"] = max(row["max_days_overdue"], days)
            if row["oldest_due"] is None or inst.due_date < row["oldest_due"]:
                row["oldest_due"] = inst.due_date
        else:
            row["not_due"] += left
    rows = sorted(by_booking.values(), key=lambda r: (-r["overdue"], -r["not_due"]))
    for r in rows:
        r["total"] = str(r["overdue"] + r["not_due"])
        r["overdue"], r["not_due"] = str(r["overdue"]), str(r["not_due"])
    total = sum(buckets.values(), ZERO)
    return {
        "as_of": as_of, "total": str(total), "overdue": str(total - buckets["not_due"]),
        "buckets": {k: str(v) for k, v in buckets.items()}, "rows": rows,
    }


def cash_position() -> list:
    return [
        {"id": a.id, "code": a.code, "name": a.name, "name_bn": a.name_bn, "balance": str(balance(a))}
        for a in Account.objects.filter(is_cash_bank=True, is_active=True)
    ]


def cashflow_forecast(months=6, project=None, as_of=None) -> dict:
    """Money expected in (unpaid installments) and out (land balance, vendor bills, refunds) per month."""
    as_of = as_of or today()
    first = as_of.replace(day=1)
    keys = [add_months(first, i) for i in range(months)]
    last = add_months(first, months)
    rows = {k: {"month": k, "inflow": ZERO, "land": ZERO, "vendors": ZERO, "refunds": ZERO} for k in keys}

    def slot(d):
        if d is None or d < first:
            return first  # overdue / undated items are due now
        k = d.replace(day=1)
        return k if k in rows else None

    inst = Installment.objects.filter(booking__status__in=LIVE, paid_amount__lt=F("amount"))
    bills = VendorBill.objects.filter(status=VendorBill.Status.POSTED)
    parcels = LandParcel.objects.all()
    cancels = Cancellation.objects.filter(refunded_amount__lt=F("refund_amount"))
    if project:
        inst, bills = inst.filter(booking__project=project), bills.filter(project=project)
        parcels, cancels = parcels.filter(project=project), cancels.filter(booking__project=project)

    overdue_in = beyond_in = beyond_out = ZERO
    for due, amount, paid in inst.values_list("due_date", "amount", "paid_amount"):
        left = amount - paid
        if due < as_of:
            overdue_in += left
        k = slot(due)
        if k:
            rows[k]["inflow"] += left
        else:
            beyond_in += left

    paid_by_parcel = dict(
        LandPayment.objects.filter(status=LandPayment.Status.POSTED).values_list("parcel").annotate(t=Sum("amount"))
    )
    for p in parcels:
        left = p.agreed_price - (paid_by_parcel.get(p.id) or ZERO)
        if left <= 0:
            continue
        k = slot(None if p.is_registered else p.registration_deadline)
        if k:
            rows[k]["land"] += left
        else:
            beyond_out += left

    for due, bill_date, net, paid, ret, rel in bills.values_list(
        "due_date", "bill_date", "net_payable", "paid_amount", "retention_amount", "retention_released"
    ):
        left = net - paid
        if left > 0:
            k = slot(due or bill_date)
            if k:
                rows[k]["vendors"] += left
            else:
                beyond_out += left
        beyond_out += ret - rel  # retention is released on completion, not on a fixed date

    for c in cancels:
        rows[first]["refunds"] += c.refund_amount - c.refunded_amount

    opening = sum((Decimal(a["balance"]) for a in cash_position()), ZERO)
    running, out = opening, []
    for k in keys:
        r = rows[k]
        outflow = r["land"] + r["vendors"] + r["refunds"]
        running += r["inflow"] - outflow
        out.append({
            "month": k, "inflow": str(r["inflow"]), "outflow": str(outflow), "land": str(r["land"]),
            "vendors": str(r["vendors"]), "refunds": str(r["refunds"]), "net": str(r["inflow"] - outflow),
            "closing_cash": str(running),
        })
    return {
        "as_of": as_of, "opening_cash": str(opening), "overdue_included": str(overdue_in), "months": out,
        "beyond": {"inflow": str(beyond_in), "outflow": str(beyond_out)},
        "lowest_cash": min((m["closing_cash"] for m in out), key=Decimal, default=str(opening)),
    }


def monthly_trend(months=12, as_of=None) -> list:
    """Actual money in and out per month, from posted documents."""
    as_of = as_of or today()
    start = add_months(as_of.replace(day=1), -(months - 1))
    data = {add_months(start, i): {"in": ZERO, "out": ZERO} for i in range(months)}

    def add(qs, field, key, date_field="date"):
        for m, total in (
            qs.filter(**{f"{date_field}__gte": start}).annotate(m=TruncMonth(date_field)).values_list("m").annotate(t=Sum(field))
        ):
            if m in data:
                data[m][key] += total or ZERO

    add(Receipt.objects.filter(status=Receipt.Status.POSTED), "amount", "in")
    add(LandPayment.objects.filter(status=LandPayment.Status.POSTED), "amount", "out")
    add(VendorPayment.objects.filter(status=VendorPayment.Status.POSTED), "amount", "out")
    add(Expense.objects.filter(status=Expense.Status.POSTED), "amount", "out")
    add(RefundPayment.objects.all(), "amount", "out")
    return [{"month": m, "inflow": str(v["in"]), "outflow": str(v["out"])} for m, v in data.items()]


def alerts(as_of=None) -> list:
    as_of = as_of or today()
    out = []
    cash_total = sum((Decimal(a["balance"]) for a in cash_position()), ZERO)
    paid_by_parcel = dict(
        LandPayment.objects.filter(status=LandPayment.Status.POSTED).values_list("parcel").annotate(t=Sum("amount"))
    )
    for p in LandParcel.objects.filter(stage__in=UNREGISTERED, registration_deadline__isnull=False).select_related("project"):
        left = p.agreed_price - (paid_by_parcel.get(p.id) or ZERO)
        if left <= 0:
            continue
        days = (p.registration_deadline - as_of).days
        expected = _sum(
            Installment.objects.filter(
                booking__project=p.project, booking__status__in=LIVE, paid_amount__lt=F("amount"),
                due_date__lte=p.registration_deadline,
            ),
            F("amount") - F("paid_amount"),
        )
        shortfall = left - cash_total - expected
        if days <= 90 or shortfall > 0:
            out.append({
                "kind": "land_deadline", "severity": "danger" if days <= 30 or shortfall > 0 else "warning",
                "project": p.project.code, "title": p.title, "amount": str(left), "date": p.registration_deadline,
                "days": days, "shortfall": str(max(shortfall, ZERO)), "link": "/land",
            })
    overdue = Installment.objects.filter(booking__status__in=LIVE, paid_amount__lt=F("amount"), due_date__lt=as_of)
    agg = overdue.aggregate(n=Count("booking", distinct=True), t=Sum(F("amount") - F("paid_amount")))
    if agg["t"]:
        out.append({
            "kind": "overdue", "severity": "warning", "count": agg["n"], "amount": str(agg["t"]), "link": "/collections",
        })
    bills = VendorBill.objects.filter(
        status=VendorBill.Status.POSTED, paid_amount__lt=F("net_payable"), due_date__lte=as_of + timedelta(days=14)
    )
    agg = bills.aggregate(n=Count("id"), t=Sum(F("net_payable") - F("paid_amount")))
    if agg["t"]:
        out.append({"kind": "bills_due", "severity": "info", "count": agg["n"], "amount": str(agg["t"]), "link": "/procurement"})
    return out


def dashboard() -> dict:
    as_of = today()
    projects = [project_financials(p, as_of) for p in Project.objects.exclude(status=Project.Status.CLOSED).order_by("id")]

    def total(section, key):
        return str(sum((Decimal(p[section][key]) for p in projects), ZERO))

    upcoming = []
    qs = (
        Installment.objects.filter(booking__status__in=LIVE, paid_amount__lt=F("amount"), due_date__lte=as_of + timedelta(days=30))
        .select_related("booking__customer", "booking__flat", "booking__project").order_by("due_date")[:12]
    )
    for i in qs:
        upcoming.append({
            "booking": i.booking_id, "number": i.booking.number, "customer": i.booking.customer.name,
            "phone": i.booking.customer.phone, "project": i.booking.project.code, "flat": i.booking.flat.code,
            "title": i.title, "due_date": i.due_date, "amount": str(i.outstanding), "days": (i.due_date - as_of).days,
        })
    return {
        "as_of": as_of,
        "totals": {
            "flats": sum(p["flats"]["total"] for p in projects),
            "flats_sold": sum(p["flats"]["sold"] for p in projects),
            "sold_value": total("sales", "sold_value"), "collected": total("sales", "collected"),
            "receivable": total("sales", "receivable"), "overdue": total("sales", "overdue"),
            "due_next_30_days": total("sales", "due_next_30_days"),
            "booked_profit": total("profit", "booked"), "realised_profit": total("profit", "realised"),
            "land_profit": total("profit", "land"), "building_profit": total("profit", "building"),
            "land_remaining": total("land", "remaining"), "vendor_payable": total("cash", "vendor_payable"),
            "unsold_value": total("flats", "unsold_value"),
            "cash": str(sum((Decimal(a["balance"]) for a in cash_position()), ZERO)),
        },
        "cash_accounts": cash_position(),
        "projects": projects,
        "trend": monthly_trend(12, as_of),
        "upcoming": upcoming,
        "alerts": alerts(as_of),
    }
