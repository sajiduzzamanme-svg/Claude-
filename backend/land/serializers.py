from decimal import Decimal

from rest_framework import serializers

from accounts.models import Account
from core.money import ZERO

from .models import LandParcel, LandPayment


class LandPaymentSerializer(serializers.ModelSerializer):
    paid_from_name = serializers.CharField(source="paid_from.name", read_only=True)
    parcel_title = serializers.CharField(source="parcel.title", read_only=True)
    project_code = serializers.CharField(source="parcel.project.code", read_only=True)
    journal_number = serializers.CharField(source="journal_entry.number", read_only=True)

    class Meta:
        model = LandPayment
        fields = [
            "id", "number", "parcel", "parcel_title", "project_code", "date", "amount", "paid_from",
            "paid_from_name", "reference", "note", "status", "void_reason", "journal_number", "created_at",
        ]


class LandParcelSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source="project.code", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    paid = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = LandParcel
        fields = [
            "id", "project", "project_code", "project_name", "title", "mouza", "khatian_no", "dag_no", "area_katha",
            "owner_name", "owner_phone", "agreed_price", "stage", "bayna_date", "bayna_deed_no",
            "registration_deadline", "registration_date", "deed_no", "mutation_date", "notes",
            "paid", "remaining", "payments", "created_at",
        ]
        read_only_fields = ["stage", "registration_date", "deed_no", "mutation_date"]

    def _paid(self, obj):
        return sum((p.amount for p in obj.payments.all() if p.status == LandPayment.Status.POSTED), ZERO)

    def get_paid(self, obj):
        return str(self._paid(obj))

    def get_remaining(self, obj):
        return str(obj.agreed_price - self._paid(obj))

    def get_payments(self, obj):
        return LandPaymentSerializer(obj.payments.all(), many=True).data

    def validate(self, attrs):
        inst = self.instance
        if inst:
            if "project" in attrs and attrs["project"] != inst.project and inst.payments.exists():
                raise serializers.ValidationError({"project": "This parcel has payments and cannot move to another project."})
            if "agreed_price" in attrs and attrs["agreed_price"] != inst.agreed_price:
                if inst.is_registered:
                    raise serializers.ValidationError({"agreed_price": "The price is locked once the land is registered."})
                if attrs["agreed_price"] < self._paid(inst):
                    raise serializers.ValidationError({"agreed_price": "The price cannot be below what has already been paid."})
        return attrs


class LandPaymentInput(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    paid_from = serializers.PrimaryKeyRelatedField(queryset=Account.objects.filter(is_cash_bank=True, is_active=True))
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class RegisterInput(serializers.Serializer):
    date = serializers.DateField()
    deed_no = serializers.CharField(max_length=60)


class DateInput(serializers.Serializer):
    date = serializers.DateField()


class VoidInput(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    date = serializers.DateField(required=False, allow_null=True)
