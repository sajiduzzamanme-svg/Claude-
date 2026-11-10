"""Buying and building: vendor bills (with retention), payments, purchase orders, direct expenses."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from accounts.services import K, cost_account, cr, dr, ensure_funds, post_journal, reverse_journal
from core.exceptions import BusinessError
from core.models import audit, next_number
from core.money import ZERO, money

from .models import Expense, PurchaseOrder, PurchaseOrderLine, VendorBill, VendorBillLine, VendorPayment, WorkPackage


def _line_amount(line) -> Decimal:
    qty = Decimal(str(line.get("quantity") or "1"))
    rate = money(line.get("rate") or 0)
    if line.get("amount") not in (None, ""):
        amount = money(line["amount"])
        if rate > 0 and amount != money(qty * rate):
            raise BusinessError(f"Line '{line.get('description') or line.get('item')}': quantity × rate does not equal the amount.")
        return amount
    return money(qty * rate)


@transaction.atomic
def create_bill(*, project, vendor, bill_date, lines, user, kind=VendorBill.Kind.MATERIAL, due_date=None,
                reference="", retention_amount=None, work_package=None, purchase_order=None, notes=""):
    """Record what a vendor has billed. Cost is recognised now; payment comes later."""
    if not lines:
        raise BusinessError("A bill needs at least one line.")
    if work_package is not None:
        work_package = WorkPackage.objects.select_for_update(of=("self",)).get(pk=work_package.pk)
        if work_package.project_id != project.id:
            raise BusinessError("The work package belongs to a different project.")

    prepared, gross = [], ZERO
    for l in lines:
        amount = _line_amount(l)
        if amount <= 0:
            raise BusinessError("Every bill line needs an amount greater than zero.")
        prepared.append((l, amount))
        gross += amount

    if retention_amount in (None, ""):
        pct = work_package.retention_percent if work_package else Decimal("0")
        retention = money(gross * pct / Decimal("100"))
    else:
        retention = money(retention_amount)
    if retention < 0 or retention >= gross:
        raise BusinessError("Retention must be zero or more, and less than the bill amount.")
    net = gross - retention

    if work_package is not None and work_package.execution == WorkPackage.Execution.CONTRACTOR:
        billed = work_package.bills.filter(status=VendorBill.Status.POSTED).aggregate(t=Sum("gross_amount"))["t"] or ZERO
        if billed + gross > work_package.budget:
            raise BusinessError(
                f"This would take billing on '{work_package.name}' to {billed + gross}, above its contract value "
                f"of {work_package.budget}. Revise the contract value first if the extra work is approved.",
                code="over_contract",
            )

    number = next_number("VB", bill_date.year)
    journal_lines = [
        dr(cost_account(l["cost_head"], project), amount, cost_head=l["cost_head"], vendor=vendor,
           description=l.get("description") or l.get("item") or "")
        for l, amount in prepared
    ]
    journal_lines += [cr(K.AP, net, vendor=vendor), cr(K.RETENTION, retention, vendor=vendor)]
    entry = post_journal(
        date=bill_date, memo=f"Bill from {vendor.name} ({reference or number})", lines=journal_lines,
        user=user, project=project, source_type="VendorBill", source_ref=number,
    )
    bill = VendorBill.objects.create(
        number=number, project=project, vendor=vendor, work_package=work_package, purchase_order=purchase_order,
        kind=kind, bill_date=bill_date, due_date=due_date, reference=reference, gross_amount=gross,
        retention_amount=retention, net_payable=net, notes=notes, journal_entry=entry, created_by=user,
    )
    VendorBillLine.objects.bulk_create([
        VendorBillLine(
            bill=bill, cost_head=l["cost_head"], description=l.get("description") or l.get("item") or "",
            unit=l.get("unit", ""), quantity=Decimal(str(l.get("quantity") or "1")), rate=money(l.get("rate") or 0),
            amount=amount,
        )
        for l, amount in prepared
    ])
    audit(user, "vendor_bill", bill, f"{number}: {gross} from {vendor.name}", gross=gross, retention=retention)
    return bill


@transaction.atomic
def void_bill(bill: VendorBill, *, reason, user, date=None):
    bill = VendorBill.objects.select_for_update(of=("self",)).get(pk=bill.pk)
    if bill.status != VendorBill.Status.POSTED:
        raise BusinessError("This bill is already voided.")
    if bill.paid_amount > 0 or bill.retention_released > 0:
        raise BusinessError("This bill has payments. Void the payments first.")
    if not reason.strip():
        raise BusinessError("A reason is required to void a bill.")
    entry = reverse_journal(bill.journal_entry, date=date or bill.bill_date, memo=f"VOID {bill.number}: {reason}", user=user)
    order = bill.purchase_order
    bill.status = VendorBill.Status.VOIDED
    bill.void_reason = reason
    bill.void_entry = entry
    bill.purchase_order = None
    bill.save(update_fields=["status", "void_reason", "void_entry", "purchase_order", "updated_at"])
    if order is not None:
        order.status = PurchaseOrder.Status.APPROVED
        order.save(update_fields=["status", "updated_at"])
    audit(user, "void_bill", bill, f"{bill.number} voided: {reason}", gross=bill.gross_amount)
    return bill


@transaction.atomic
def pay_bill(*, bill, date, amount, paid_from, user, kind=VendorPayment.Kind.BILL, reference="", note=""):
    """Pay a vendor, either against the bill or releasing held retention."""
    bill = VendorBill.objects.select_for_update(of=("self",)).select_related("vendor", "project").get(pk=bill.pk)
    if bill.status != VendorBill.Status.POSTED:
        raise BusinessError("A voided bill cannot be paid.")
    amount = money(amount)
    if amount <= 0:
        raise BusinessError("Payment amount must be greater than zero.")
    if kind == VendorPayment.Kind.RETENTION:
        owed, control, label = bill.retention_outstanding, K.RETENTION, "retention"
    else:
        owed, control, label = bill.outstanding, K.AP, "bill"
    if amount > owed:
        raise BusinessError(f"Only {owed} is outstanding on this {label}.", code="over_payment")
    ensure_funds(paid_from, amount)

    number = next_number("VP", date.year)
    entry = post_journal(
        date=date, memo=f"Paid {bill.vendor.name} against {bill.number} ({label})",
        lines=[dr(control, amount, vendor=bill.vendor), cr(paid_from, amount, vendor=bill.vendor)],
        user=user, project=bill.project, source_type="VendorPayment", source_ref=number,
    )
    payment = VendorPayment.objects.create(
        number=number, bill=bill, kind=kind, date=date, amount=amount, paid_from=paid_from,
        reference=reference, note=note, journal_entry=entry, created_by=user,
    )
    if kind == VendorPayment.Kind.RETENTION:
        bill.retention_released += amount
        bill.save(update_fields=["retention_released", "updated_at"])
    else:
        bill.paid_amount += amount
        bill.save(update_fields=["paid_amount", "updated_at"])
    audit(user, "vendor_payment", payment, f"{number}: {amount} to {bill.vendor.name}", amount=amount, bill=bill.number)
    return payment


@transaction.atomic
def void_vendor_payment(payment: VendorPayment, *, reason, user, date=None):
    payment = VendorPayment.objects.select_for_update(of=("self",)).get(pk=payment.pk)
    if payment.status != VendorPayment.Status.POSTED:
        raise BusinessError("This payment is already voided.")
    if not reason.strip():
        raise BusinessError("A reason is required to void a payment.")
    bill = VendorBill.objects.select_for_update(of=("self",)).get(pk=payment.bill_id)
    entry = reverse_journal(payment.journal_entry, date=date or payment.date, memo=f"VOID {payment.number}: {reason}", user=user)
    if payment.kind == VendorPayment.Kind.RETENTION:
        bill.retention_released -= payment.amount
        bill.save(update_fields=["retention_released", "updated_at"])
    else:
        bill.paid_amount -= payment.amount
        bill.save(update_fields=["paid_amount", "updated_at"])
    payment.status = VendorPayment.Status.VOIDED
    payment.void_reason = reason
    payment.void_entry = entry
    payment.save(update_fields=["status", "void_reason", "void_entry", "updated_at"])
    audit(user, "void_vendor_payment", payment, f"{payment.number} voided: {reason}", amount=payment.amount)
    return payment


@transaction.atomic
def create_purchase_order(*, project, vendor, date, lines, user, work_package=None, expected_date=None, notes=""):
    if not lines:
        raise BusinessError("A purchase order needs at least one item.")
    order = PurchaseOrder.objects.create(
        number=next_number("PO", date.year), project=project, vendor=vendor, work_package=work_package,
        date=date, expected_date=expected_date, notes=notes, created_by=user,
    )
    rows = []
    for l in lines:
        qty = Decimal(str(l.get("quantity") or "0"))
        rate = money(l.get("rate") or 0)
        amount = money(qty * rate)
        if qty <= 0 or amount <= 0:
            raise BusinessError(f"Item '{l.get('item')}': quantity and rate must be greater than zero.")
        rows.append(PurchaseOrderLine(
            order=order, cost_head=l["cost_head"], item=l["item"], unit=l.get("unit", ""),
            quantity=qty, rate=rate, amount=amount,
        ))
    PurchaseOrderLine.objects.bulk_create(rows)
    return order


@transaction.atomic
def approve_purchase_order(order: PurchaseOrder, user):
    order = PurchaseOrder.objects.select_for_update(of=("self",)).get(pk=order.pk)
    if order.status != PurchaseOrder.Status.DRAFT:
        raise BusinessError("Only a draft purchase order can be approved.")
    order.status = PurchaseOrder.Status.APPROVED
    order.save(update_fields=["status", "updated_at"])
    audit(user, "approve_po", order, f"{order.number} approved", total=order.total)
    return order


@transaction.atomic
def cancel_purchase_order(order: PurchaseOrder, user):
    order = PurchaseOrder.objects.select_for_update(of=("self",)).get(pk=order.pk)
    if order.status not in (PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.APPROVED):
        raise BusinessError("A received purchase order cannot be cancelled. Void its bill instead.")
    order.status = PurchaseOrder.Status.CANCELLED
    order.save(update_fields=["status", "updated_at"])
    audit(user, "cancel_po", order, f"{order.number} cancelled")
    return order


@transaction.atomic
def receive_purchase_order(order: PurchaseOrder, *, date, user, reference="", due_date=None):
    """Goods arrived as ordered: turn the purchase order into a vendor bill."""
    order = PurchaseOrder.objects.select_for_update(of=("self",)).select_related("project", "vendor", "work_package").get(pk=order.pk)
    if order.status != PurchaseOrder.Status.APPROVED:
        raise BusinessError("Only an approved purchase order can be received.")
    lines = [
        dict(cost_head=l.cost_head, description=l.item, unit=l.unit, quantity=l.quantity, rate=l.rate, amount=l.amount)
        for l in order.lines.select_related("cost_head")
    ]
    bill = create_bill(
        project=order.project, vendor=order.vendor, bill_date=date, lines=lines, user=user,
        kind=VendorBill.Kind.MATERIAL, due_date=due_date, reference=reference or order.number,
        retention_amount=ZERO, work_package=order.work_package, purchase_order=order,
        notes=f"Goods received against {order.number}",
    )
    order.status = PurchaseOrder.Status.RECEIVED
    order.save(update_fields=["status", "updated_at"])
    return bill


@transaction.atomic
def record_expense(*, cost_head, date, amount, paid_from, description, user, project=None, payee=""):
    """Money paid out directly, with no vendor bill."""
    amount = money(amount)
    if amount <= 0:
        raise BusinessError("Expense amount must be greater than zero.")
    account = cost_account(cost_head, project)
    ensure_funds(paid_from, amount)
    number = next_number("EX", date.year)
    entry = post_journal(
        date=date, memo=f"{description} ({payee})" if payee else description,
        lines=[dr(account, amount, cost_head=cost_head), cr(paid_from, amount)],
        user=user, project=project, source_type="Expense", source_ref=number,
    )
    expense = Expense.objects.create(
        number=number, project=project, cost_head=cost_head, date=date, amount=amount, paid_from=paid_from,
        payee=payee, description=description, journal_entry=entry, created_by=user,
    )
    audit(user, "expense", expense, f"{number}: {amount} — {description}", amount=amount)
    return expense


@transaction.atomic
def void_expense(expense: Expense, *, reason, user, date=None):
    expense = Expense.objects.select_for_update(of=("self",)).get(pk=expense.pk)
    if expense.status != Expense.Status.POSTED:
        raise BusinessError("This expense is already voided.")
    if not reason.strip():
        raise BusinessError("A reason is required to void an expense.")
    entry = reverse_journal(expense.journal_entry, date=date or expense.date, memo=f"VOID {expense.number}: {reason}", user=user)
    expense.status = Expense.Status.VOIDED
    expense.void_reason = reason
    expense.void_entry = entry
    expense.save(update_fields=["status", "void_reason", "void_entry", "updated_at"])
    audit(user, "void_expense", expense, f"{expense.number} voided: {reason}", amount=expense.amount)
    return expense
