"""Sales rules: bookings, payment schedules, receipts, revisions, cancellation, handover.

Every function that moves money locks the rows it touches, validates against
the current state, posts the journal entry, and updates the sub-ledger — all
in one database transaction.
"""
import calendar
from datetime import date as date_cls
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Max, Sum
from django.utils import timezone

from accounts.models import JournalLine
from accounts.services import K, acct, balance, cr, dr, ensure_funds, post_journal, require_cash_account
from core.exceptions import BusinessError
from core.models import audit, next_number
from core.money import ZERO, money, prorate, split_amount
from projects.models import Flat, Project

from .models import (
    Booking, BookingTransfer, Cancellation, Installment, PriceRevision, PriceRevisionLine, Receipt,
    ReceiptAllocation, RefundPayment,
)

LIVE = (Booking.Status.ACTIVE, Booking.Status.HANDED_OVER)


def add_months(d: date_cls, months: int) -> date_cls:
    month_index = d.month - 1 + months
    year, month = d.year + month_index // 12, month_index % 12 + 1
    return date_cls(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def build_schedule(*, total, booking_date, booking_money=ZERO, down_payment=ZERO, down_payment_date=None,
                   installment_count=0, first_installment_date=None, interval_months=1,
                   handover_amount=ZERO, handover_date=None, round_to=ZERO):
    """Return a payment schedule whose amounts add up to exactly ``total``.

    ``round_to`` (e.g. 1000) makes regular installments round figures; the
    last installment absorbs the difference.
    """
    total, booking_money = money(total), money(booking_money)
    down_payment, handover_amount = money(down_payment), money(handover_amount)
    round_to = money(round_to)
    if min(booking_money, down_payment, handover_amount) < 0:
        raise BusinessError("Schedule amounts cannot be negative.")
    rest = total - booking_money - down_payment - handover_amount
    if rest < 0:
        raise BusinessError("Booking money, down payment and handover amount together exceed the price.")
    if rest > 0 and installment_count <= 0:
        raise BusinessError(f"{rest} is left unscheduled. Add installments or adjust the amounts.")

    rows = []
    if booking_money > 0:
        rows.append(dict(kind=Installment.Kind.BOOKING, title="Booking money", due_date=booking_date, amount=booking_money))
    if down_payment > 0:
        rows.append(dict(
            kind=Installment.Kind.DOWN_PAYMENT, title="Down payment",
            due_date=down_payment_date or booking_date, amount=down_payment,
        ))
    if rest > 0:
        first = first_installment_date or add_months(booking_date, 1)
        if round_to > 0 and installment_count > 1:
            each = (rest / installment_count // round_to) * round_to
            amounts = [each] * (installment_count - 1) + [rest - each * (installment_count - 1)]
            if each <= 0:
                amounts = split_amount(rest, installment_count)
        else:
            amounts = split_amount(rest, installment_count)
        for i, amount in enumerate(amounts):
            rows.append(dict(
                kind=Installment.Kind.INSTALLMENT, title=f"Installment {i + 1}",
                due_date=add_months(first, i * interval_months), amount=amount,
            ))
    if handover_amount > 0:
        last_due = rows[-1]["due_date"] if rows else booking_date
        rows.append(dict(
            kind=Installment.Kind.HANDOVER, title="On handover",
            due_date=handover_date or add_months(last_due, 1), amount=handover_amount,
        ))
    assert sum((r["amount"] for r in rows), ZERO) == total
    return rows


def paid_total(booking: Booking) -> Decimal:
    return booking.installments.aggregate(t=Sum("paid_amount"))["t"] or ZERO


def outstanding_total(booking: Booking) -> Decimal:
    agg = booking.installments.aggregate(a=Sum("amount"), p=Sum("paid_amount"))
    return (agg["a"] or ZERO) - (agg["p"] or ZERO)


@transaction.atomic
def create_booking(*, flat, customer, booking_date, schedule, user, land_price=None, construction_price=None,
                   other_charges=None, discount=ZERO, sales_person=None, expected_handover=None, notes=""):
    """Sell a flat. The schedule must add up to the contract price to the paisa."""
    flat = Flat.objects.select_for_update(of=("self",)).select_related("project").get(pk=flat.pk)
    project = flat.project
    if not project.sales_open:
        raise BusinessError("Sales are not open for this project. Complete the document checklist first.", code="sales_closed")
    if flat.status != Flat.Status.AVAILABLE:
        raise BusinessError(f"Flat {flat.code} is not available (currently {flat.get_status_display()}).")

    land_price = money(flat.land_price if land_price is None else land_price)
    construction_price = money(flat.construction_price if construction_price is None else construction_price)
    other_charges = money(flat.other_charges if other_charges is None else other_charges)
    discount = money(discount)
    subtotal = land_price + construction_price + other_charges
    if min(land_price, construction_price, other_charges, discount) < 0:
        raise BusinessError("Prices and discount cannot be negative.")
    if discount >= subtotal:
        raise BusinessError("Discount must be less than the price.")
    total = subtotal - discount

    if not schedule:
        raise BusinessError("A payment schedule is required.")
    scheduled = ZERO
    for row in schedule:
        row["amount"] = money(row["amount"])
        if row["amount"] <= 0:
            raise BusinessError("Every schedule line needs an amount greater than zero.")
        scheduled += row["amount"]
    if scheduled != total:
        raise BusinessError(
            f"The payment schedule adds up to {scheduled} but the contract price is {total}. "
            f"Difference: {total - scheduled}.", code="schedule_mismatch",
        )

    booking = Booking.objects.create(
        number=next_number("BK", booking_date.year), project=project, flat=flat, customer=customer,
        booking_date=booking_date, land_price=land_price, construction_price=construction_price,
        other_charges=other_charges, discount=discount, total_price=total,
        sales_person=sales_person, expected_handover=expected_handover or project.expected_handover,
        notes=notes, created_by=user,
    )
    Installment.objects.bulk_create([
        Installment(
            booking=booking, sequence=i, kind=row.get("kind") or Installment.Kind.INSTALLMENT,
            title=row.get("title") or f"Installment {i}", due_date=row["due_date"], amount=row["amount"],
        )
        for i, row in enumerate(schedule, start=1)
    ])
    flat.status = Flat.Status.BOOKED
    flat.save(update_fields=["status"])
    audit(user, "create_booking", booking, f"{booking.number}: flat {flat} sold to {customer.name}", total=total)
    return booking


@transaction.atomic
def record_receipt(*, booking, date, amount, deposit_account, user, method=Receipt.Method.CASH,
                   reference="", bank_name="", note=""):
    """Receive money from a flat owner and apply it to the oldest unpaid installments."""
    booking = Booking.objects.select_for_update(of=("self",)).select_related("customer", "project").get(pk=booking.pk)
    if booking.status not in LIVE:
        raise BusinessError("Money cannot be received against a cancelled booking.")
    amount = money(amount)
    if amount <= 0:
        raise BusinessError("Receipt amount must be greater than zero.")
    require_cash_account(deposit_account)

    installments = list(
        Installment.objects.select_for_update(of=("self",)).filter(booking=booking, paid_amount__lt=F("amount"))
        .order_by("due_date", "sequence")
    )
    due = sum((i.outstanding for i in installments), ZERO)
    if amount > due:
        raise BusinessError(
            f"This is more than the customer owes. Outstanding on {booking.number} is {due}.", code="over_collection"
        )

    number = next_number("MR", date.year)
    control = K.AR if booking.status == Booking.Status.HANDED_OVER else K.CUSTOMER_ADVANCE
    entry = post_journal(
        date=date,
        memo=f"Received from {booking.customer.name} for {booking.flat} ({booking.number})",
        lines=[dr(deposit_account, amount, customer=booking.customer), cr(control, amount, customer=booking.customer)],
        user=user, project=booking.project, source_type="Receipt", source_ref=number,
    )
    receipt = Receipt.objects.create(
        number=number, booking=booking, date=date, amount=amount, method=method,
        deposit_account=deposit_account, reference=reference, bank_name=bank_name, note=note,
        journal_entry=entry, created_by=user,
    )
    left = amount
    for inst in installments:
        if left <= 0:
            break
        part = min(left, inst.outstanding)
        ReceiptAllocation.objects.create(receipt=receipt, installment=inst, amount=part)
        inst.paid_amount += part
        inst.save(update_fields=["paid_amount"])
        left -= part
    assert left == ZERO
    audit(user, "receipt", receipt, f"{number}: {amount} from {booking.customer.name}", amount=amount, booking=booking.number)
    return receipt


@transaction.atomic
def void_receipt(receipt: Receipt, *, reason, user, date=None):
    """Cancel a receipt (bounced cheque, entry mistake). The books keep both entries."""
    receipt = Receipt.objects.select_for_update(of=("self",)).get(pk=receipt.pk)
    if receipt.status != Receipt.Status.POSTED:
        raise BusinessError("This receipt is already voided.")
    booking = Booking.objects.select_for_update(of=("self",)).select_related("customer", "project").get(pk=receipt.booking_id)
    if booking.status == Booking.Status.CANCELLED:
        raise BusinessError("The booking was cancelled and settled; this receipt can no longer be voided.")
    if not reason.strip():
        raise BusinessError("A reason is required to void a receipt.")

    for alloc in receipt.allocations.select_related("installment"):
        inst = Installment.objects.select_for_update(of=("self",)).get(pk=alloc.installment_id)
        inst.paid_amount -= alloc.amount
        inst.save(update_fields=["paid_amount"])

    # Unwind against the account that carries this customer's money today.
    control = K.AR if booking.status == Booking.Status.HANDED_OVER else K.CUSTOMER_ADVANCE
    entry = post_journal(
        date=date or receipt.date,
        memo=f"VOID {receipt.number}: {reason}",
        lines=[
            dr(control, receipt.amount, customer=booking.customer),
            cr(receipt.deposit_account, receipt.amount, customer=booking.customer),
        ],
        user=user, project=booking.project, source_type="Receipt", source_ref=receipt.number,
    )
    receipt.status = Receipt.Status.VOIDED
    receipt.void_reason = reason
    receipt.void_entry = entry
    receipt.save(update_fields=["status", "void_reason", "void_entry", "updated_at"])
    audit(user, "void_receipt", receipt, f"{receipt.number} voided: {reason}", amount=receipt.amount)
    return receipt


def distribute_revision(project: Project, total_amount, basis="SQFT"):
    """Suggest how an agreed extra amount is shared among current flat owners."""
    bookings = list(Booking.objects.filter(project=project, status=Booking.Status.ACTIVE).select_related("flat", "customer"))
    if not bookings:
        raise BusinessError("This project has no active bookings to share the amount.")
    weights = [b.flat.size_sqft if basis == "SQFT" else Decimal("1") for b in bookings]
    return list(zip(bookings, prorate(money(total_amount), weights)))


@transaction.atomic
def create_price_revision(*, project, title, meeting_date, due_date, lines, user, reason="", resolution_ref=""):
    if not lines:
        raise BusinessError("A price revision needs at least one flat owner.")
    revision = PriceRevision.objects.create(
        project=project, title=title, reason=reason, meeting_date=meeting_date, due_date=due_date,
        resolution_ref=resolution_ref, created_by=user,
    )
    for booking, amount in lines:
        amount = money(amount)
        if amount <= 0:
            raise BusinessError("Each owner's share must be greater than zero.")
        if booking.project_id != project.id or booking.status != Booking.Status.ACTIVE:
            raise BusinessError(f"{booking.number} is not an active booking of this project.")
        PriceRevisionLine.objects.create(revision=revision, booking=booking, amount=amount)
    return revision


@transaction.atomic
def approve_price_revision(revision: PriceRevision, user):
    """Make the agreed extra amount payable: one new installment per booking."""
    revision = PriceRevision.objects.select_for_update(of=("self",)).get(pk=revision.pk)
    if revision.status != PriceRevision.Status.DRAFT:
        raise BusinessError("This revision is already approved.")
    if not revision.resolution_ref.strip():
        raise BusinessError("Record the meeting resolution reference before approving.")
    lines = list(revision.lines.select_related("booking"))
    if not lines:
        raise BusinessError("This revision has no lines.")
    for line in lines:
        booking = Booking.objects.select_for_update(of=("self",)).get(pk=line.booking_id)
        if booking.status != Booking.Status.ACTIVE:
            raise BusinessError(f"{booking.number} is no longer active; remove it from the revision.")
        seq = (booking.installments.aggregate(m=Max("sequence"))["m"] or 0) + 1
        inst = Installment.objects.create(
            booking=booking, sequence=seq, kind=Installment.Kind.REVISION, title=revision.title[:80],
            due_date=revision.due_date, amount=line.amount,
        )
        line.installment = inst
        line.save(update_fields=["installment"])
        booking.revision_amount += line.amount
        booking.save(update_fields=["revision_amount", "updated_at"])
    revision.status = PriceRevision.Status.APPROVED
    revision.approved_by = user
    revision.approved_at = timezone.now()
    revision.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    total = sum((l.amount for l in lines), ZERO)
    audit(user, "approve_price_revision", revision, f"{revision.title}: {total} across {len(lines)} bookings", total=total)
    return revision


@transaction.atomic
def cancel_booking(*, booking, date, reason, deduction, user):
    """Cancel a sale. What was paid is split into the company's deduction and a refund owed."""
    booking = Booking.objects.select_for_update(of=("self",)).select_related("customer", "project", "flat").get(pk=booking.pk)
    if booking.status != Booking.Status.ACTIVE:
        raise BusinessError("Only an active booking can be cancelled.")
    if not reason.strip():
        raise BusinessError("A reason is required to cancel a booking.")
    list(Installment.objects.select_for_update(of=("self",)).filter(booking=booking))
    paid = paid_total(booking)
    deduction = money(deduction)
    if deduction < 0 or deduction > paid:
        raise BusinessError(f"Deduction must be between 0 and the amount paid ({paid}).")
    refund = paid - deduction

    entry = None
    if paid > 0:
        entry = post_journal(
            date=date,
            memo=f"Booking {booking.number} cancelled: {reason}",
            lines=[
                dr(K.CUSTOMER_ADVANCE, paid, customer=booking.customer),
                cr(K.FORFEIT_INCOME, deduction, customer=booking.customer),
                cr(K.REFUND_PAYABLE, refund, customer=booking.customer),
            ],
            user=user, project=booking.project, source_type="Cancellation", source_ref=booking.number,
        )
    cancellation = Cancellation.objects.create(
        booking=booking, date=date, reason=reason, paid_total=paid, deduction=deduction,
        refund_amount=refund, journal_entry=entry, created_by=user,
    )
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status", "updated_at"])
    flat = Flat.objects.select_for_update(of=("self",)).get(pk=booking.flat_id)
    flat.status = Flat.Status.AVAILABLE
    flat.save(update_fields=["status"])
    audit(user, "cancel_booking", booking, f"{booking.number} cancelled", paid=paid, deduction=deduction, refund=refund)
    return cancellation


@transaction.atomic
def pay_refund(*, cancellation, date, amount, paid_from, user, reference=""):
    cancellation = Cancellation.objects.select_for_update(of=("self",)).select_related("booking__customer", "booking__project").get(
        pk=cancellation.pk
    )
    amount = money(amount)
    owed = cancellation.refund_amount - cancellation.refunded_amount
    if amount <= 0:
        raise BusinessError("Refund amount must be greater than zero.")
    if amount > owed:
        raise BusinessError(f"Only {owed} remains to be refunded.")
    ensure_funds(paid_from, amount)
    booking = cancellation.booking
    number = next_number("RF", date.year)
    entry = post_journal(
        date=date,
        memo=f"Refund to {booking.customer.name} for cancelled {booking.number}",
        lines=[dr(K.REFUND_PAYABLE, amount, customer=booking.customer), cr(paid_from, amount, customer=booking.customer)],
        user=user, project=booking.project, source_type="RefundPayment", source_ref=number,
    )
    refund = RefundPayment.objects.create(
        number=number, cancellation=cancellation, date=date, amount=amount, paid_from=paid_from,
        reference=reference, journal_entry=entry, created_by=user,
    )
    cancellation.refunded_amount += amount
    cancellation.save(update_fields=["refunded_amount", "updated_at"])
    audit(user, "refund", refund, f"{number}: {amount} refunded to {booking.customer.name}", amount=amount)
    return refund


def capitalised_cost(project, account_key: str) -> Decimal:
    """Total cost ever capitalised to a WIP account for the project (ignores releases to cost of sales)."""
    agg = JournalLine.objects.filter(
        account=acct(account_key), project=project, cost_head__isnull=False
    ).aggregate(d=Sum("debit"), c=Sum("credit"))
    return (agg["d"] or ZERO) - (agg["c"] or ZERO)


@transaction.atomic
def handover_booking(*, booking, date, user, allow_dues=False):
    """Hand the flat over: recognise the sale as revenue and release its share of project cost.

    Until this moment the customer's payments are a liability (advance) and
    the project's costs an asset (work in progress).
    """
    booking = Booking.objects.select_for_update(of=("self",)).select_related("customer", "project", "flat").get(pk=booking.pk)
    if booking.status != Booking.Status.ACTIVE:
        raise BusinessError("Only an active booking can be handed over.")
    project = Project.objects.select_for_update(of=("self",)).get(pk=booking.project_id)
    list(Installment.objects.select_for_update(of=("self",)).filter(booking=booking))
    agg = booking.installments.aggregate(a=Sum("amount"), p=Sum("paid_amount"))
    contract, paid = agg["a"] or ZERO, agg["p"] or ZERO
    outstanding = contract - paid
    if outstanding > 0 and not allow_dues:
        raise BusinessError(
            f"{outstanding} is still unpaid. Collect it first, or confirm handover with dues.", code="dues_pending"
        )

    flats = list(project.flats.values_list("id", "size_sqft", "status"))
    total_sqft = sum((s for _, s, _ in flats), Decimal("0"))
    share = booking.flat.size_sqft / total_sqft
    is_last = all(st == Flat.Status.HANDED_OVER for fid, _, st in flats if fid != booking.flat_id)
    cogs = {}
    for key in (K.WIP_LAND, K.WIP_DEV):
        remaining = balance(key, project=project)
        portion = remaining if is_last else min(money(capitalised_cost(project, key) * share), remaining)
        cogs[key] = max(portion, ZERO)

    customer = booking.customer
    entry = post_journal(
        date=date,
        memo=f"Handover of {booking.flat} to {customer.name} ({booking.number})",
        lines=[
            dr(K.CUSTOMER_ADVANCE, paid, customer=customer),
            dr(K.AR, outstanding, customer=customer),
            cr(K.REVENUE, contract, customer=customer),
            dr(K.COGS_LAND, cogs[K.WIP_LAND]),
            cr(K.WIP_LAND, cogs[K.WIP_LAND]),
            dr(K.COGS_DEV, cogs[K.WIP_DEV]),
            cr(K.WIP_DEV, cogs[K.WIP_DEV]),
        ],
        user=user, project=project, source_type="Handover", source_ref=booking.number,
    )
    booking.status = Booking.Status.HANDED_OVER
    booking.handover_date = date
    booking.handover_entry = entry
    booking.cogs_land, booking.cogs_dev = cogs[K.WIP_LAND], cogs[K.WIP_DEV]
    booking.save(update_fields=["status", "handover_date", "handover_entry", "cogs_land", "cogs_dev", "updated_at"])
    flat = Flat.objects.select_for_update(of=("self",)).get(pk=booking.flat_id)
    flat.status = Flat.Status.HANDED_OVER
    flat.save(update_fields=["status"])
    audit(user, "handover", booking, f"{booking.number} handed over", revenue=contract, outstanding=outstanding)
    return booking


@transaction.atomic
def transfer_booking(*, booking, to_customer, date, user, fee=ZERO, fee_account=None, note=""):
    """Change the owner of a live booking, optionally charging a transfer fee."""
    booking = Booking.objects.select_for_update(of=("self",)).select_related("customer", "project").get(pk=booking.pk)
    if booking.status != Booking.Status.ACTIVE:
        raise BusinessError("Only an active booking can be transferred.")
    if to_customer.pk == booking.customer_id:
        raise BusinessError("The booking already belongs to this customer.")
    fee = money(fee)
    if fee < 0:
        raise BusinessError("Transfer fee cannot be negative.")
    entry = None
    if fee > 0:
        if fee_account is None:
            raise BusinessError("Choose the account the transfer fee was received into.")
        require_cash_account(fee_account)
        entry = post_journal(
            date=date,
            memo=f"Transfer fee: {booking.number} from {booking.customer.name} to {to_customer.name}",
            lines=[dr(fee_account, fee, customer=to_customer), cr("TRANSFER_FEE", fee, customer=to_customer)],
            user=user, project=booking.project, source_type="BookingTransfer", source_ref=booking.number,
        )
    transfer = BookingTransfer.objects.create(
        booking=booking, from_customer=booking.customer, to_customer=to_customer, date=date, fee=fee,
        fee_account=fee_account if fee > 0 else None, note=note, journal_entry=entry, created_by=user,
    )
    old = booking.customer.name
    booking.customer = to_customer
    booking.save(update_fields=["customer", "updated_at"])
    audit(user, "transfer_booking", booking, f"{booking.number}: {old} → {to_customer.name}", fee=fee)
    return transfer
