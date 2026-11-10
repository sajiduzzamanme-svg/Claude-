from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounts.models import Account
from core.models import User
from core.money import ZERO
from projects.models import Flat, Project

from .models import (
    Booking, BookingTransfer, Cancellation, Customer, Installment, Lead, PriceRevision, PriceRevisionLine,
    Receipt, RefundPayment,
)

CASH_ACCOUNTS = Account.objects.filter(is_cash_bank=True, is_active=True)


class CustomerSerializer(serializers.ModelSerializer):
    bookings_count = serializers.IntegerField(read_only=True, default=0)
    contract_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)
    paid = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)

    class Meta:
        model = Customer
        fields = [
            "id", "name", "phone", "email", "nid", "father_name", "address", "occupation", "nominee_name",
            "nominee_relation", "notes", "bookings_count", "contract_value", "paid", "created_at",
        ]


class LeadSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source="project.code", read_only=True, default=None)
    assigned_to_name = serializers.CharField(source="assigned_to.display_name", read_only=True, default=None)

    class Meta:
        model = Lead
        fields = [
            "id", "name", "phone", "source", "project", "project_code", "stage", "budget", "assigned_to",
            "assigned_to_name", "next_follow_up", "customer", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["customer"]


class InstallmentSerializer(serializers.ModelSerializer):
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = Installment
        fields = ["id", "sequence", "kind", "title", "due_date", "amount", "paid_amount", "outstanding", "state"]

    def get_state(self, obj):
        if obj.paid_amount >= obj.amount:
            return "PAID"
        if obj.due_date < timezone.localdate():
            return "OVERDUE"
        return "PARTIAL" if obj.paid_amount > 0 else "DUE"


class ReceiptSerializer(serializers.ModelSerializer):
    booking_number = serializers.CharField(source="booking.number", read_only=True)
    customer_name = serializers.CharField(source="booking.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="booking.customer.phone", read_only=True)
    project_code = serializers.CharField(source="booking.project.code", read_only=True)
    project_name = serializers.CharField(source="booking.project.name", read_only=True)
    flat_code = serializers.CharField(source="booking.flat.code", read_only=True)
    deposit_account_name = serializers.CharField(source="deposit_account.name", read_only=True)
    received_by = serializers.CharField(source="created_by.display_name", read_only=True, default="")
    journal_number = serializers.CharField(source="journal_entry.number", read_only=True)
    allocations = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = [
            "id", "number", "booking", "booking_number", "customer_name", "customer_phone", "project_code",
            "project_name", "flat_code", "date", "amount", "method", "deposit_account", "deposit_account_name",
            "reference", "bank_name", "note", "status", "void_reason", "received_by", "journal_number",
            "allocations", "created_at",
        ]

    def get_allocations(self, obj):
        return [
            {"installment": a.installment_id, "title": a.installment.title, "sequence": a.installment.sequence, "amount": str(a.amount)}
            for a in obj.allocations.all()
        ]


class BookingListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    flat_code = serializers.CharField(source="flat.code", read_only=True)
    flat_size = serializers.DecimalField(source="flat.size_sqft", max_digits=10, decimal_places=2, read_only=True)
    sales_person_name = serializers.CharField(source="sales_person.display_name", read_only=True, default=None)
    contract_value = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    paid = serializers.SerializerMethodField()
    outstanding = serializers.SerializerMethodField()
    overdue = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "number", "project", "project_code", "project_name", "flat", "flat_code", "flat_size", "customer",
            "customer_name", "customer_phone", "booking_date", "land_price", "construction_price", "other_charges",
            "discount", "total_price", "revision_amount", "contract_value", "status", "sales_person",
            "sales_person_name", "expected_handover", "handover_date", "notes", "paid", "outstanding", "overdue",
        ]

    def get_paid(self, obj):
        return str(getattr(obj, "paid_sum", None) or ZERO)

    def get_outstanding(self, obj):
        if obj.status == Booking.Status.CANCELLED:
            return "0.00"
        return str(obj.contract_value - (getattr(obj, "paid_sum", None) or ZERO))

    def get_overdue(self, obj):
        if obj.status == Booking.Status.CANCELLED:
            return "0.00"
        return str(getattr(obj, "overdue_sum", None) or ZERO)


class CancellationSerializer(serializers.ModelSerializer):
    booking_number = serializers.CharField(source="booking.number", read_only=True)
    customer_name = serializers.CharField(source="booking.customer.name", read_only=True)
    project_code = serializers.CharField(source="booking.project.code", read_only=True)
    flat_code = serializers.CharField(source="booking.flat.code", read_only=True)
    refund_outstanding = serializers.SerializerMethodField()
    refunds = serializers.SerializerMethodField()

    class Meta:
        model = Cancellation
        fields = [
            "id", "booking", "booking_number", "customer_name", "project_code", "flat_code", "date", "reason",
            "paid_total", "deduction", "refund_amount", "refunded_amount", "refund_outstanding", "refunds",
        ]

    def get_refund_outstanding(self, obj):
        return str(obj.refund_amount - obj.refunded_amount)

    def get_refunds(self, obj):
        return [
            {"id": r.id, "number": r.number, "date": r.date, "amount": str(r.amount), "paid_from": r.paid_from.name, "reference": r.reference}
            for r in obj.refunds.all()
        ]


class BookingDetailSerializer(BookingListSerializer):
    installments = InstallmentSerializer(many=True, read_only=True)
    receipts = ReceiptSerializer(many=True, read_only=True)
    cancellation = serializers.SerializerMethodField()
    transfers = serializers.SerializerMethodField()
    customer_detail = CustomerSerializer(source="customer", read_only=True)
    flat_detail = serializers.SerializerMethodField()

    class Meta(BookingListSerializer.Meta):
        fields = BookingListSerializer.Meta.fields + [
            "installments", "receipts", "cancellation", "transfers", "customer_detail", "flat_detail",
            "cogs_land", "cogs_dev",
        ]

    def get_cancellation(self, obj):
        c = getattr(obj, "cancellation", None)
        return CancellationSerializer(c).data if c else None

    def get_transfers(self, obj):
        return [
            {"id": t.id, "date": t.date, "from": t.from_customer.name, "to": t.to_customer.name, "fee": str(t.fee), "note": t.note}
            for t in obj.transfers.all()
        ]

    def get_flat_detail(self, obj):
        f = obj.flat
        return {
            "code": f.code, "floor": f.floor, "unit": f.unit, "flat_type": f.flat_type, "bedrooms": f.bedrooms,
            "size_sqft": str(f.size_sqft), "land_share_katha": str(f.land_share_katha), "facing": f.facing,
        }


class ScheduleRowInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Installment.Kind.choices, required=False, default=Installment.Kind.INSTALLMENT)
    title = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    due_date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))


class BookingInput(serializers.Serializer):
    flat = serializers.PrimaryKeyRelatedField(queryset=Flat.objects.all())
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    booking_date = serializers.DateField()
    land_price = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)
    construction_price = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)
    other_charges = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)
    discount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    sales_person = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), required=False, allow_null=True)
    expected_handover = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    schedule = ScheduleRowInput(many=True, allow_empty=False)


class SchedulePreviewInput(serializers.Serializer):
    total = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    booking_date = serializers.DateField()
    booking_money = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    down_payment = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    down_payment_date = serializers.DateField(required=False, allow_null=True)
    installment_count = serializers.IntegerField(required=False, default=0, min_value=0, max_value=240)
    first_installment_date = serializers.DateField(required=False, allow_null=True)
    interval_months = serializers.IntegerField(required=False, default=1, min_value=1, max_value=12)
    handover_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    handover_date = serializers.DateField(required=False, allow_null=True)
    round_to = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)


class ReceiptInput(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Receipt.Method.choices, required=False, default=Receipt.Method.CASH)
    deposit_account = serializers.PrimaryKeyRelatedField(queryset=CASH_ACCOUNTS)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    bank_name = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class VoidInput(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    date = serializers.DateField(required=False, allow_null=True)


class CancelInput(serializers.Serializer):
    date = serializers.DateField()
    reason = serializers.CharField(max_length=255)
    deduction = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0)


class RefundInput(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    paid_from = serializers.PrimaryKeyRelatedField(queryset=CASH_ACCOUNTS)
    reference = serializers.CharField(required=False, allow_blank=True, default="")


class HandoverInput(serializers.Serializer):
    date = serializers.DateField()
    allow_dues = serializers.BooleanField(required=False, default=False)


class TransferInput(serializers.Serializer):
    to_customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    date = serializers.DateField()
    fee = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    fee_account = serializers.PrimaryKeyRelatedField(queryset=CASH_ACCOUNTS, required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class PriceRevisionLineSerializer(serializers.ModelSerializer):
    booking_number = serializers.CharField(source="booking.number", read_only=True)
    customer_name = serializers.CharField(source="booking.customer.name", read_only=True)
    flat_code = serializers.CharField(source="booking.flat.code", read_only=True)
    flat_size = serializers.DecimalField(source="booking.flat.size_sqft", max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = PriceRevisionLine
        fields = ["id", "booking", "booking_number", "customer_name", "flat_code", "flat_size", "amount"]


class PriceRevisionSerializer(serializers.ModelSerializer):
    lines = PriceRevisionLineSerializer(many=True, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.display_name", read_only=True, default=None)
    total = serializers.SerializerMethodField()

    class Meta:
        model = PriceRevision
        fields = [
            "id", "project", "project_code", "title", "reason", "meeting_date", "resolution_ref", "document",
            "due_date", "status", "approved_by_name", "approved_at", "total", "lines", "created_at",
        ]

    def get_total(self, obj):
        return str(sum((l.amount for l in obj.lines.all()), ZERO))


class RevisionLineInput(serializers.Serializer):
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all())
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))


class PriceRevisionInput(serializers.Serializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    title = serializers.CharField(max_length=120)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    meeting_date = serializers.DateField()
    due_date = serializers.DateField()
    resolution_ref = serializers.CharField(required=False, allow_blank=True, default="")
    # Either give explicit lines, or a total to be shared automatically.
    lines = RevisionLineInput(many=True, required=False)
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, min_value=Decimal("0.01"))
    basis = serializers.ChoiceField(choices=[("SQFT", "By flat size"), ("EQUAL", "Equally")], required=False, default="SQFT")

    def validate(self, attrs):
        if not attrs.get("lines") and not attrs.get("total_amount"):
            raise serializers.ValidationError("Give either the owners' shares or a total amount to distribute.")
        return attrs
