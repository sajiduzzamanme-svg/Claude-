from django.db import models
from django.db.models import Q

from core.models import TimeStamped
from core.money import MoneyField


class LandParcel(TimeStamped):
    class Stage(models.TextChoices):
        NEGOTIATION = "NEGOTIATION", "Negotiation"
        BAYNA = "BAYNA", "Bayna (earnest money paid)"
        REGISTERED = "REGISTERED", "Registered"
        MUTATED = "MUTATED", "Mutation done"

    project = models.ForeignKey("projects.Project", on_delete=models.PROTECT, related_name="land_parcels")
    title = models.CharField(max_length=120)
    mouza = models.CharField(max_length=80, blank=True)
    khatian_no = models.CharField(max_length=60, blank=True)
    dag_no = models.CharField(max_length=60, blank=True)
    area_katha = models.DecimalField(max_digits=10, decimal_places=3)
    owner_name = models.CharField(max_length=120)
    owner_phone = models.CharField(max_length=20, blank=True)
    agreed_price = MoneyField()
    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.NEGOTIATION)
    bayna_date = models.DateField(null=True, blank=True)
    bayna_deed_no = models.CharField(max_length=60, blank=True)
    registration_deadline = models.DateField(null=True, blank=True, help_text="Date by which the balance must be paid and the deed registered")
    registration_date = models.DateField(null=True, blank=True)
    deed_no = models.CharField(max_length=60, blank=True)
    mutation_date = models.DateField(null=True, blank=True)
    registration_entry = models.OneToOneField(
        "accounts.JournalEntry", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-id"]
        constraints = [
            models.CheckConstraint(condition=Q(agreed_price__gt=0), name="land_price_positive"),
            models.CheckConstraint(condition=Q(area_katha__gt=0), name="land_area_positive"),
        ]

    def __str__(self):
        return f"{self.title} ({self.area_katha} katha)"

    @property
    def is_registered(self):
        return self.stage in (self.Stage.REGISTERED, self.Stage.MUTATED)


class LandPayment(TimeStamped):
    class Status(models.TextChoices):
        POSTED = "POSTED", "Posted"
        VOIDED = "VOIDED", "Voided"

    number = models.CharField(max_length=24, unique=True)
    parcel = models.ForeignKey(LandParcel, on_delete=models.PROTECT, related_name="payments")
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
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="land_payment_positive")]
