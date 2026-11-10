from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.money import MoneyField


class AccountType(models.TextChoices):
    ASSET = "ASSET", "Asset"
    LIABILITY = "LIABILITY", "Liability"
    EQUITY = "EQUITY", "Equity"
    INCOME = "INCOME", "Income"
    EXPENSE = "EXPENSE", "Expense"


DEBIT_NORMAL = {AccountType.ASSET, AccountType.EXPENSE}


class Account(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=120)
    name_bn = models.CharField(max_length=120, blank=True)
    type = models.CharField(max_length=10, choices=AccountType.choices)
    is_cash_bank = models.BooleanField(default=False, help_text="Money can be received into / paid from this account")
    is_control = models.BooleanField(
        default=False, help_text="Maintained only by the system from source documents; manual journals are blocked"
    )
    system_key = models.CharField(max_length=30, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"

    @property
    def is_debit_normal(self):
        return self.type in DEBIT_NORMAL


class CostCategory(models.TextChoices):
    LAND = "LAND", "Land"
    DESIGN = "DESIGN", "Design & Approval"
    CONSTRUCTION = "CONSTRUCTION", "Construction"
    MARKETING = "MARKETING", "Sales & Marketing"
    OVERHEAD = "OVERHEAD", "Office & Overhead"
    CONTINGENCY = "CONTINGENCY", "Contingency"


class CostHead(models.Model):
    """What money was spent on. Every project cost is tagged with one."""

    code = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=120)
    name_bn = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=14, choices=CostCategory.choices)
    system_key = models.CharField(max_length=30, unique=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"


class JournalEntry(models.Model):
    """A posted, balanced, immutable double-entry voucher.

    Corrections are made with a reversing entry, never by editing.
    """

    number = models.CharField(max_length=24, unique=True)
    date = models.DateField(db_index=True)
    memo = models.CharField(max_length=255)
    project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.PROTECT, related_name="journal_entries")
    source_type = models.CharField(max_length=40, db_index=True, help_text="Kind of document that produced this entry")
    source_ref = models.CharField(max_length=40, blank=True, db_index=True, help_text="Number of that document")
    reverses = models.OneToOneField("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        if self.pk and not kwargs.get("force_insert"):
            raise RuntimeError("Posted journal entries are immutable; post a reversal instead.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Posted journal entries cannot be deleted; post a reversal instead.")


class JournalLine(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.PROTECT, related_name="lines")
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="lines")
    project = models.ForeignKey("projects.Project", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    cost_head = models.ForeignKey(CostHead, null=True, blank=True, on_delete=models.PROTECT, related_name="lines")
    customer = models.ForeignKey("sales.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    vendor = models.ForeignKey("construction.Vendor", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    debit = MoneyField()
    credit = MoneyField()
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=Q(debit__gte=0) & Q(credit__gte=0), name="jl_non_negative"),
            models.CheckConstraint(
                condition=(Q(debit__gt=0) & Q(credit=0)) | (Q(credit__gt=0) & Q(debit=0)),
                name="jl_one_sided",
            ),
        ]
        indexes = [
            models.Index(fields=["account", "project"]),
            models.Index(fields=["project", "cost_head"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk and not kwargs.get("force_insert"):
            raise RuntimeError("Posted journal lines are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Posted journal lines cannot be deleted.")
