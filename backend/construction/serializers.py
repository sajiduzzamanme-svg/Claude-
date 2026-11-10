from decimal import Decimal

from rest_framework import serializers

from accounts.models import Account, CostHead
from core.money import ZERO
from projects.models import Project

from .models import (
    Expense, PurchaseOrder, PurchaseOrderLine, Vendor, VendorBill, VendorBillLine, VendorPayment, WorkPackage,
)

CASH_ACCOUNTS = Account.objects.filter(is_cash_bank=True, is_active=True)
HEADS = CostHead.objects.filter(is_active=True)


class VendorSerializer(serializers.ModelSerializer):
    payable = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)
    retention = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)
    billed = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)

    class Meta:
        model = Vendor
        fields = ["id", "name", "kind", "phone", "address", "trade_license", "notes", "is_active", "payable", "retention", "billed"]


class WorkPackageSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source="project.code", read_only=True)
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True)
    cost_head_name_bn = serializers.CharField(source="cost_head.name_bn", read_only=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    billed = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)
    paid = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, default=ZERO)

    class Meta:
        model = WorkPackage
        fields = [
            "id", "project", "project_code", "name", "cost_head", "cost_head_name", "cost_head_name_bn", "execution",
            "vendor", "vendor_name", "budget", "retention_percent", "start_date", "end_date", "progress", "status",
            "notes", "billed", "paid",
        ]

    def validate(self, attrs):
        execution = attrs.get("execution", self.instance.execution if self.instance else WorkPackage.Execution.OWN)
        vendor = attrs.get("vendor", self.instance.vendor if self.instance else None)
        if execution == WorkPackage.Execution.CONTRACTOR and vendor is None:
            raise serializers.ValidationError({"vendor": "Choose the contractor for this work."})
        if execution == WorkPackage.Execution.OWN:
            attrs["vendor"] = None
            attrs["retention_percent"] = 0
        progress = attrs.get("progress")
        if progress is not None and "status" not in attrs:
            attrs["status"] = "DONE" if progress >= 100 else "IN_PROGRESS" if progress > 0 else "PLANNED"
        return attrs


class LineInput(serializers.Serializer):
    cost_head = serializers.PrimaryKeyRelatedField(queryset=HEADS)
    description = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    item = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, default=1, min_value=Decimal("0.001"))
    rate = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = ["id", "cost_head", "cost_head_name", "item", "unit", "quantity", "rate", "amount"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    work_package_name = serializers.CharField(source="work_package.name", read_only=True, default=None)
    total = serializers.SerializerMethodField()
    bill_number = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "number", "project", "project_code", "vendor", "vendor_name", "work_package", "work_package_name",
            "date", "expected_date", "status", "notes", "total", "bill_number", "lines", "created_at",
        ]

    def get_total(self, obj):
        return str(sum((l.amount for l in obj.lines.all()), ZERO))

    def get_bill_number(self, obj):
        bill = getattr(obj, "bill", None)
        return bill.number if bill else None


class PurchaseOrderInput(serializers.Serializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.filter(is_active=True))
    work_package = serializers.PrimaryKeyRelatedField(queryset=WorkPackage.objects.all(), required=False, allow_null=True)
    date = serializers.DateField()
    expected_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = LineInput(many=True, allow_empty=False)


class ReceiveInput(serializers.Serializer):
    date = serializers.DateField()
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    due_date = serializers.DateField(required=False, allow_null=True)


class VendorPaymentSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source="bill.number", read_only=True)
    vendor_name = serializers.CharField(source="bill.vendor.name", read_only=True)
    project_code = serializers.CharField(source="bill.project.code", read_only=True)
    paid_from_name = serializers.CharField(source="paid_from.name", read_only=True)
    journal_number = serializers.CharField(source="journal_entry.number", read_only=True)

    class Meta:
        model = VendorPayment
        fields = [
            "id", "number", "bill", "bill_number", "vendor_name", "project_code", "kind", "date", "amount",
            "paid_from", "paid_from_name", "reference", "note", "status", "void_reason", "journal_number", "created_at",
        ]


class VendorBillLineSerializer(serializers.ModelSerializer):
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True)
    cost_head_code = serializers.CharField(source="cost_head.code", read_only=True)

    class Meta:
        model = VendorBillLine
        fields = ["id", "cost_head", "cost_head_code", "cost_head_name", "description", "unit", "quantity", "rate", "amount"]


class VendorBillSerializer(serializers.ModelSerializer):
    lines = VendorBillLineSerializer(many=True, read_only=True)
    payments = VendorPaymentSerializer(many=True, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    vendor_name = serializers.CharField(source="vendor.name", read_only=True)
    work_package_name = serializers.CharField(source="work_package.name", read_only=True, default=None)
    po_number = serializers.CharField(source="purchase_order.number", read_only=True, default=None)
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    retention_outstanding = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    journal_number = serializers.CharField(source="journal_entry.number", read_only=True)

    class Meta:
        model = VendorBill
        fields = [
            "id", "number", "project", "project_code", "vendor", "vendor_name", "work_package", "work_package_name",
            "po_number", "kind", "bill_date", "due_date", "reference", "gross_amount", "retention_amount",
            "net_payable", "paid_amount", "retention_released", "outstanding", "retention_outstanding", "status",
            "void_reason", "notes", "journal_number", "lines", "payments", "created_at",
        ]


class VendorBillInput(serializers.Serializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.filter(is_active=True))
    work_package = serializers.PrimaryKeyRelatedField(queryset=WorkPackage.objects.all(), required=False, allow_null=True)
    kind = serializers.ChoiceField(choices=VendorBill.Kind.choices, required=False, default=VendorBill.Kind.MATERIAL)
    bill_date = serializers.DateField()
    due_date = serializers.DateField(required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    retention_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = LineInput(many=True, allow_empty=False)


class PayBillInput(serializers.Serializer):
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    paid_from = serializers.PrimaryKeyRelatedField(queryset=CASH_ACCOUNTS)
    kind = serializers.ChoiceField(choices=VendorPayment.Kind.choices, required=False, default=VendorPayment.Kind.BILL)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class VoidInput(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
    date = serializers.DateField(required=False, allow_null=True)


class ExpenseSerializer(serializers.ModelSerializer):
    project_code = serializers.CharField(source="project.code", read_only=True, default=None)
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True)
    cost_head_name_bn = serializers.CharField(source="cost_head.name_bn", read_only=True)
    category = serializers.CharField(source="cost_head.category", read_only=True)
    paid_from_name = serializers.CharField(source="paid_from.name", read_only=True)
    journal_number = serializers.CharField(source="journal_entry.number", read_only=True)

    class Meta:
        model = Expense
        fields = [
            "id", "number", "project", "project_code", "cost_head", "cost_head_name", "cost_head_name_bn", "category",
            "date", "amount", "paid_from", "paid_from_name", "payee", "description", "status", "void_reason",
            "journal_number", "created_at",
        ]


class ExpenseInput(serializers.Serializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    cost_head = serializers.PrimaryKeyRelatedField(queryset=HEADS)
    date = serializers.DateField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal("0.01"))
    paid_from = serializers.PrimaryKeyRelatedField(queryset=CASH_ACCOUNTS)
    payee = serializers.CharField(required=False, allow_blank=True, default="")
    description = serializers.CharField(max_length=255)
