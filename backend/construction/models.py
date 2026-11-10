from decimal import Decimal

from django.db import models
from django.db.models import F, Q

from core.models import TimeStamped
from core.money import MoneyField


class Vendor(TimeStamped):
    class Kind(models.TextChoices):
        SUPPLIER = "SUPPLIER", "Material supplier"
        CONTRACTOR = "CONTRACTOR", "Contractor / builder"
        LABOUR = "LABOUR", "Labour sardar"
        CONSULTANT = "CONSULTANT", "Consultant / architect"

    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.SUPPLIER)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    trade_license = models.CharField(max_length=60, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class WorkPackage(TimeStamped):
    """A slice of the build (piling, structure, finishing…) done in-house or by a contractor."""

    class Execution(models.TextChoices):
        OWN = "OWN", "Own team"
        CONTRACTOR = "CONTRACTOR", "Contractor"

    class Status(models.TextChoices):
        PLANNED = "PLANNED", "Planned"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        DONE = "DONE", "Done"

    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="work_packages")
    name = models.CharField(max_length=120)
    cost_head = models.ForeignKey("accounts.CostHead", on_delete=models.PROTECT, related_name="+")
    execution = models.CharField(max_length=12, choices=Execution.choices, default=Execution.OWN)
    vendor = models.ForeignKey(Vendor, null=True, blank=True, on_delete=models.PROTECT, related_name="work_packages")
    budget = MoneyField(help_text="Contract value (contractor) or planned budget (own team)")
    retention_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    progress = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANNED)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["project_id", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(progress__lte=100), name="wp_progress_max_100"),
            models.CheckConstraint(
                condition=Q(retention_percent__gte=0) & Q(retention_percent__lte=100), name="wp_retention_percent_range"
            ),
            models.CheckConstraint(
                condition=Q(execution="OWN") | Q(vendor__isnull=False), name="wp_contractor_needs_vendor"
            ),
        ]

    def __str__(self):
        return f"{self.project.code}: {self.name}"


class PurchaseOrder(TimeStamped):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"
        RECEIVED = "RECEIVED", "Received & billed"
        CANCELLED = "CANCELLED", "Cancelled"

    number = models.CharField(max_length=24, unique=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="purchase_orders")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="purchase_orders")
    work_package = models.ForeignKey(WorkPackage, null=True, blank=True, on_delete=models.PROTECT, related_name="purchase_orders")
    date = models.DateField()
    expected_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return self.number

    @property
    def total(self):
        return self.lines.aggregate(t=models.Sum("amount"))["t"] or Decimal("0.00")


class PurchaseOrderLine(models.Model):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    cost_head = models.ForeignKey("accounts.CostHead", on_delete=models.PROTECT, related_name="+")
    item = models.CharField(max_length=160)
    unit = models.CharField(max_length=20, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    rate = MoneyField()
    amount = MoneyField()

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0) & Q(quantity__gt=0), name="po_line_positive")]


class VendorBill(TimeStamped):
    class Kind(models.TextChoices):
        MATERIAL = "MATERIAL", "Material"
        CONTRACTOR = "CONTRACTOR", "Contractor running bill"
        LABOUR = "LABOUR", "Labour"
        SERVICE = "SERVICE", "Service / fee"

    class Status(models.TextChoices):
        POSTED = "POSTED", "Posted"
        VOIDED = "VOIDED", "Voided"

    number = models.CharField(max_length=24, unique=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="vendor_bills")
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="bills")
    work_package = models.ForeignKey(WorkPackage, null=True, blank=True, on_delete=models.PROTECT, related_name="bills")
    purchase_order = models.OneToOneField(PurchaseOrder, null=True, blank=True, on_delete=models.PROTECT, related_name="bill")
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.MATERIAL)
    bill_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=80, blank=True, help_text="Vendor's invoice / challan number")
    gross_amount = MoneyField()
    retention_amount = MoneyField(help_text="Held back until the work is accepted")
    net_payable = MoneyField()
    paid_amount = MoneyField()
    retention_released = MoneyField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.POSTED)
    void_reason = models.CharField(max_length=255, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", on_delete=models.PROTECT, related_name="+")
    void_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-bill_date", "-id"]
        constraints = [
            models.CheckConstraint(condition=Q(gross_amount__gt=0), name="bill_gross_positive"),
            models.CheckConstraint(condition=Q(net_payable=F("gross_amount") - F("retention_amount")), name="bill_net_matches"),
            models.CheckConstraint(
                condition=Q(retention_amount__gte=0) & Q(retention_amount__lt=F("gross_amount")), name="bill_retention_range"
            ),
            models.CheckConstraint(condition=Q(paid_amount__gte=0) & Q(paid_amount__lte=F("net_payable")), name="bill_paid_within_net"),
            models.CheckConstraint(
                condition=Q(retention_released__gte=0) & Q(retention_released__lte=F("retention_amount")),
                name="bill_retention_released_within",
            ),
        ]

    def __str__(self):
        return self.number

    @property
    def outstanding(self):
        return self.net_payable - self.paid_amount

    @property
    def retention_outstanding(self):
        return self.retention_amount - self.retention_released


class VendorBillLine(models.Model):
    bill = models.ForeignKey(VendorBill, on_delete=models.PROTECT, related_name="lines")
    cost_head = models.ForeignKey("accounts.CostHead", on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=160)
    unit = models.CharField(max_length=20, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("1"))
    rate = MoneyField()
    amount = MoneyField()

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="bill_line_positive")]


class VendorPayment(TimeStamped):
    class Kind(models.TextChoices):
        BILL = "BILL", "Bill payment"
        RETENTION = "RETENTION", "Retention release"

    class Status(models.TextChoices):
        POSTED = "POSTED", "Posted"
        VOIDED = "VOIDED", "Voided"

    number = models.CharField(max_length=24, unique=True)
    bill = models.ForeignKey(VendorBill, on_delete=models.PROTECT, related_name="payments")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.BILL)
    date = models.DateField()
    amount = MoneyField()
    paid_from = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+")
    reference = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.POSTED)
    void_reason = models.CharField(max_length=255, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", on_delete=models.PROTECT, related_name="+")
    void_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="vendor_payment_positive")]


class Expense(TimeStamped):
    """Money paid out directly (no vendor bill): site petty cash, fees, office costs."""

    class Status(models.TextChoices):
        POSTED = "POSTED", "Posted"
        VOIDED = "VOIDED", "Voided"

    number = models.CharField(max_length=24, unique=True)
    project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.PROTECT, related_name="expenses")
    cost_head = models.ForeignKey("accounts.CostHead", on_delete=models.PROTECT, related_name="+")
    date = models.DateField()
    amount = MoneyField()
    paid_from = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+")
    payee = models.CharField(max_length=120, blank=True)
    description = models.CharField(max_length=255)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.POSTED)
    void_reason = models.CharField(max_length=255, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", on_delete=models.PROTECT, related_name="+")
    void_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="expense_positive")]
