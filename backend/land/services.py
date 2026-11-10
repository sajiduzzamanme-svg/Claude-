from django.db import transaction
from django.db.models import Sum

from accounts.services import K, acct, cost_head, cr, dr, ensure_funds, post_journal
from core.exceptions import BusinessError
from core.models import audit, next_number
from core.money import ZERO, money

from .models import LandParcel, LandPayment


def paid_total(parcel: LandParcel):
    return parcel.payments.filter(status=LandPayment.Status.POSTED).aggregate(t=Sum("amount"))["t"] or ZERO


@transaction.atomic
def record_land_payment(*, parcel, date, amount, paid_from, user, reference="", note=""):
    """Pay the landowner.

    Before registration the money is an advance (bayna); after registration it
    settles the amount owed to the landowner.
    """
    parcel = LandParcel.objects.select_for_update(of=("self",)).get(pk=parcel.pk)
    amount = money(amount)
    if amount <= 0:
        raise BusinessError("Payment amount must be greater than zero.")
    remaining = parcel.agreed_price - paid_total(parcel)
    if amount > remaining:
        raise BusinessError(f"This exceeds the agreed land price. Remaining payable is {remaining}.")
    ensure_funds(paid_from, amount)

    number = next_number("LP", date.year)
    control = K.LAND_PAYABLE if parcel.is_registered else K.LAND_ADVANCE
    entry = post_journal(
        date=date,
        memo=f"Land payment to {parcel.owner_name} for {parcel.title}",
        lines=[dr(control, amount), cr(paid_from, amount)],
        user=user, project=parcel.project, source_type="LandPayment", source_ref=number,
    )
    payment = LandPayment.objects.create(
        number=number, parcel=parcel, date=date, amount=amount, paid_from=paid_from,
        reference=reference, note=note, journal_entry=entry, created_by=user,
    )
    if parcel.stage == LandParcel.Stage.NEGOTIATION:
        parcel.stage = LandParcel.Stage.BAYNA
        parcel.bayna_date = parcel.bayna_date or date
        parcel.save(update_fields=["stage", "bayna_date", "updated_at"])
    audit(user, "land_payment", payment, f"{number}: {amount} paid for {parcel.title}", amount=amount)
    return payment


@transaction.atomic
def void_land_payment(payment: LandPayment, *, reason, user, date=None):
    payment = LandPayment.objects.select_for_update(of=("self",)).get(pk=payment.pk)
    if payment.status != LandPayment.Status.POSTED:
        raise BusinessError("This payment is already voided.")
    parcel = LandParcel.objects.select_for_update(of=("self",)).get(pk=payment.parcel_id)
    # Unwind against whichever account currently carries this money.
    control = K.LAND_PAYABLE if parcel.is_registered else K.LAND_ADVANCE
    entry = post_journal(
        date=date or payment.date,
        memo=f"VOID {payment.number}: {reason}",
        lines=[dr(payment.paid_from, payment.amount), cr(control, payment.amount)],
        user=user, project=parcel.project, source_type="LandPayment", source_ref=payment.number,
    )
    payment.status = LandPayment.Status.VOIDED
    payment.void_reason = reason
    payment.void_entry = entry
    payment.save(update_fields=["status", "void_reason", "void_entry", "updated_at"])
    audit(user, "void_land_payment", payment, f"{payment.number} voided: {reason}", amount=payment.amount)
    return payment


@transaction.atomic
def register_parcel(*, parcel, date, deed_no, user):
    """The deed is registered: the land becomes project cost and the unpaid balance a liability."""
    parcel = LandParcel.objects.select_for_update(of=("self",)).get(pk=parcel.pk)
    if parcel.is_registered:
        raise BusinessError("This parcel is already registered.")
    paid = paid_total(parcel)
    remaining = parcel.agreed_price - paid
    entry = post_journal(
        date=date,
        memo=f"Land registered: {parcel.title} (deed {deed_no})",
        lines=[
            dr(K.WIP_LAND, parcel.agreed_price, cost_head=cost_head("LAND_PRICE")),
            cr(K.LAND_ADVANCE, paid),
            cr(K.LAND_PAYABLE, remaining),
        ],
        user=user, project=parcel.project, source_type="LandRegistration", source_ref=f"LAND-{parcel.pk}",
    )
    parcel.stage = LandParcel.Stage.REGISTERED
    parcel.registration_date = date
    parcel.deed_no = deed_no
    parcel.registration_entry = entry
    parcel.save(update_fields=["stage", "registration_date", "deed_no", "registration_entry", "updated_at"])
    audit(user, "register_land", parcel, f"{parcel.title} registered", price=parcel.agreed_price, paid=paid)
    return parcel


@transaction.atomic
def mark_mutated(*, parcel, date, user):
    parcel = LandParcel.objects.select_for_update(of=("self",)).get(pk=parcel.pk)
    if parcel.stage != LandParcel.Stage.REGISTERED:
        raise BusinessError("Mutation can be recorded only after registration.")
    parcel.stage = LandParcel.Stage.MUTATED
    parcel.mutation_date = date
    parcel.save(update_fields=["stage", "mutation_date", "updated_at"])
    audit(user, "land_mutation", parcel, f"{parcel.title} mutation recorded")
    return parcel
