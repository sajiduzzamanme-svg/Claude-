from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStamped
from core.money import MoneyField


class Customer(TimeStamped):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    nid = models.CharField(max_length=30, blank=True)
    father_name = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=255, blank=True)
    occupation = models.CharField(max_length=80, blank=True)
    nominee_name = models.CharField(max_length=120, blank=True)
    nominee_relation = models.CharField(max_length=40, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Lead(TimeStamped):
    class Stage(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        SITE_VISIT = "SITE_VISIT", "Site visit"
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        WON = "WON", "Won"
        LOST = "LOST", "Lost"

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    source = models.CharField(max_length=40, blank=True)
    project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.NEW)
    budget = MoneyField()
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    next_follow_up = models.DateField(null=True, blank=True)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.name} ({self.stage})"


class Booking(TimeStamped):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        HANDED_OVER = "HANDED_OVER", "Handed over"
        CANCELLED = "CANCELLED", "Cancelled"

    number = models.CharField(max_length=24, unique=True)
    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="bookings")
    flat = models.ForeignKey("projects.Flat", on_delete=models.PROTECT, related_name="bookings")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="bookings")
    booking_date = models.DateField()
    land_price = MoneyField()
    construction_price = MoneyField()
    other_charges = MoneyField()
    discount = MoneyField()
    total_price = MoneyField(help_text="Contract price at signing. Never changes after booking.")
    revision_amount = MoneyField(help_text="Sum of approved price revisions agreed by all owners")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    sales_person = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="bookings")
    expected_handover = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    handover_date = models.DateField(null=True, blank=True)
    handover_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    cogs_land = MoneyField()
    cogs_dev = MoneyField()

    class Meta:
        ordering = ["-id"]
        constraints = [
            # A flat can be under at most one live booking.
            models.UniqueConstraint(
                fields=["flat"], condition=Q(status__in=["ACTIVE", "HANDED_OVER"]), name="booking_one_live_per_flat"
            ),
            models.CheckConstraint(
                condition=Q(total_price=F("land_price") + F("construction_price") + F("other_charges") - F("discount")),
                name="booking_total_matches_components",
            ),
            models.CheckConstraint(
                condition=Q(land_price__gte=0) & Q(construction_price__gte=0) & Q(other_charges__gte=0)
                & Q(discount__gte=0) & Q(total_price__gt=0) & Q(revision_amount__gte=0),
                name="booking_amounts_valid",
            ),
        ]

    def __str__(self):
        return self.number

    @property
    def contract_value(self):
        return self.total_price + self.revision_amount


class Installment(models.Model):
    class Kind(models.TextChoices):
        BOOKING = "BOOKING", "Booking money"
        DOWN_PAYMENT = "DOWN_PAYMENT", "Down payment"
        INSTALLMENT = "INSTALLMENT", "Installment"
        HANDOVER = "HANDOVER", "On handover"
        REVISION = "REVISION", "Price revision"

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="installments")
    sequence = models.PositiveSmallIntegerField()
    kind = models.CharField(max_length=14, choices=Kind.choices, default=Kind.INSTALLMENT)
    title = models.CharField(max_length=80)
    due_date = models.DateField(db_index=True)
    amount = MoneyField()
    paid_amount = MoneyField()

    class Meta:
        ordering = ["booking_id", "sequence"]
        constraints = [
            models.UniqueConstraint(fields=["booking", "sequence"], name="installment_unique_sequence"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="installment_amount_positive"),
            models.CheckConstraint(
                condition=Q(paid_amount__gte=0) & Q(paid_amount__lte=F("amount")), name="installment_paid_within_amount"
            ),
        ]

    def __str__(self):
        return f"{self.booking.number} #{self.sequence}"

    @property
    def outstanding(self):
        return self.amount - self.paid_amount


class Receipt(TimeStamped):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK = "BANK", "Bank transfer / deposit"
        CHEQUE = "CHEQUE", "Cheque"
        MOBILE = "MOBILE", "Mobile banking"

    class Status(models.TextChoices):
        POSTED = "POSTED", "Posted"
        VOIDED = "VOIDED", "Voided"

    number = models.CharField(max_length=24, unique=True)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="receipts")
    date = models.DateField(db_index=True)
    amount = MoneyField()
    method = models.CharField(max_length=8, choices=Method.choices, default=Method.CASH)
    deposit_account = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+")
    reference = models.CharField(max_length=80, blank=True, help_text="Cheque no. / transaction id")
    bank_name = models.CharField(max_length=80, blank=True)
    note = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.POSTED)
    void_reason = models.CharField(max_length=255, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", on_delete=models.PROTECT, related_name="+")
    void_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="receipt_amount_positive")]

    def __str__(self):
        return self.number


class ReceiptAllocation(models.Model):
    receipt = models.ForeignKey(Receipt, on_delete=models.PROTECT, related_name="allocations")
    installment = models.ForeignKey(Installment, on_delete=models.PROTECT, related_name="allocations")
    amount = MoneyField()

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="allocation_amount_positive")]


class PriceRevision(TimeStamped):
    """Extra amount all flat owners of a project agreed to share (e.g. a cost overrun).

    The original contract price is untouched; an approved revision adds a new
    installment to every affected booking.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"

    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="price_revisions")
    title = models.CharField(max_length=120)
    reason = models.TextField(blank=True)
    meeting_date = models.DateField()
    resolution_ref = models.CharField(max_length=80, blank=True, help_text="Meeting minutes / resolution number")
    document = models.FileField(upload_to="resolutions/%Y/", null=True, blank=True)
    due_date = models.DateField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]


class PriceRevisionLine(models.Model):
    revision = models.ForeignKey(PriceRevision, on_delete=models.CASCADE, related_name="lines")
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="revision_lines")
    amount = MoneyField()
    installment = models.OneToOneField(Installment, null=True, blank=True, on_delete=models.PROTECT, related_name="revision_line")

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["revision", "booking"], name="revision_line_unique_booking"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="revision_line_positive"),
        ]


class Cancellation(TimeStamped):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="cancellation")
    date = models.DateField()
    reason = models.CharField(max_length=255)
    paid_total = MoneyField(help_text="Amount the customer had paid when the booking was cancelled")
    deduction = MoneyField(help_text="Amount kept by the company")
    refund_amount = MoneyField()
    refunded_amount = MoneyField()
    journal_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.CheckConstraint(condition=Q(paid_total=F("deduction") + F("refund_amount")), name="cancellation_split_matches_paid"),
            models.CheckConstraint(
                condition=Q(deduction__gte=0) & Q(refund_amount__gte=0) & Q(refunded_amount__gte=0)
                & Q(refunded_amount__lte=F("refund_amount")),
                name="cancellation_amounts_valid",
            ),
        ]


class RefundPayment(TimeStamped):
    number = models.CharField(max_length=24, unique=True)
    cancellation = models.ForeignKey(Cancellation, on_delete=models.PROTECT, related_name="refunds")
    date = models.DateField()
    amount = MoneyField()
    paid_from = models.ForeignKey("accounts.Account", on_delete=models.PROTECT, related_name="+")
    reference = models.CharField(max_length=80, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="refund_amount_positive")]


class BookingTransfer(TimeStamped):
    """Change of owner on a live booking (name transfer)."""

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="transfers")
    from_customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="+")
    to_customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="+")
    date = models.DateField()
    fee = MoneyField()
    fee_account = models.ForeignKey("accounts.Account", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=255, blank=True)
    journal_entry = models.OneToOneField("accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-id"]
        constraints = [models.CheckConstraint(condition=Q(fee__gte=0), name="transfer_fee_non_negative")]
