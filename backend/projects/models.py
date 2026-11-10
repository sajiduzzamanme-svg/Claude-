from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import TimeStamped
from core.money import ZERO, MoneyField


class Project(TimeStamped):
    class Status(models.TextChoices):
        PLANNING = "PLANNING", "Planning"
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        CLOSED = "CLOSED", "Closed"

    code = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=120)
    location = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNING)
    sales_open = models.BooleanField(default=False)
    sales_opened_at = models.DateTimeField(null=True, blank=True)
    land_area_katha = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal("0"))
    storeys = models.PositiveSmallIntegerField(default=0)
    start_date = models.DateField(null=True, blank=True)
    expected_handover = models.DateField(null=True, blank=True)
    render_url = models.URLField(blank=True, help_text="Link to 3D render / walkthrough animation")

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.code} {self.name}"


class Flat(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        HOLD = "HOLD", "On hold"
        BOOKED = "BOOKED", "Booked"
        HANDED_OVER = "HANDED_OVER", "Handed over"

    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name="flats")
    code = models.CharField(max_length=12)
    floor = models.PositiveSmallIntegerField()
    unit = models.CharField(max_length=6)
    flat_type = models.CharField(max_length=40, blank=True)
    bedrooms = models.PositiveSmallIntegerField(default=0)
    size_sqft = models.DecimalField(max_digits=10, decimal_places=2)
    land_share_katha = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0"))
    facing = models.CharField(max_length=30, blank=True)
    land_price = MoneyField()
    construction_price = MoneyField()
    other_charges = MoneyField(help_text="Parking, utility connection and similar")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE)

    class Meta:
        ordering = ["project_id", "floor", "unit"]
        constraints = [
            models.UniqueConstraint(fields=["project", "code"], name="flat_unique_code_per_project"),
            models.CheckConstraint(condition=Q(size_sqft__gt=0), name="flat_size_positive"),
            models.CheckConstraint(
                condition=Q(land_price__gte=0) & Q(construction_price__gte=0) & Q(other_charges__gte=0),
                name="flat_prices_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.project.code}-{self.code}"

    @property
    def list_price(self):
        return self.land_price + self.construction_price + self.other_charges


class ProjectDocument(models.Model):
    class DocType(models.TextChoices):
        LAND_DEED = "LAND_DEED", "Bayna / sale deed"
        KHATIAN = "KHATIAN", "Khatian (porcha)"
        MUTATION = "MUTATION", "Mutation (namjari)"
        LAND_TAX = "LAND_TAX", "Land tax receipt"
        APPROVED_PLAN = "APPROVED_PLAN", "Approved building plan"
        DEVELOPER_REG = "DEVELOPER_REG", "Developer registration"
        SOIL_TEST = "SOIL_TEST", "Soil test report"
        POWER_OF_ATTORNEY = "POWER_OF_ATTORNEY", "Power of attorney"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RECEIVED = "RECEIVED", "Received"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=20, choices=DocType.choices)
    title = models.CharField(max_length=120)
    is_required = models.BooleanField(default=True, help_text="Sales cannot open until every required document is received")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reference_no = models.CharField(max_length=80, blank=True)
    received_date = models.DateField(null=True, blank=True)
    file = models.FileField(upload_to="documents/%Y/", null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["project_id", "id"]

    def __str__(self):
        return f"{self.project.code}: {self.title}"


DEFAULT_DOCUMENTS = [
    # (doc_type, title, required)
    ("LAND_DEED", "Bayna deed / registered sale deed", True),
    ("KHATIAN", "Khatian (CS, SA, RS, BS porcha)", True),
    ("APPROVED_PLAN", "Approved building plan (RAJUK / authority)", True),
    ("DEVELOPER_REG", "Developer registration certificate", True),
    ("MUTATION", "Mutation (namjari) in company name", False),
    ("LAND_TAX", "Up-to-date land tax receipt", False),
    ("SOIL_TEST", "Soil test report", False),
]


class Estimate(TimeStamped):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"
        SUPERSEDED = "SUPERSEDED", "Superseded"

    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name="estimates")
    version = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=120)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["project_id", "-version"]
        constraints = [
            models.UniqueConstraint(fields=["project", "version"], name="estimate_unique_version"),
            models.UniqueConstraint(
                fields=["project"], condition=Q(status="APPROVED"), name="estimate_one_approved_per_project"
            ),
        ]

    def __str__(self):
        return f"{self.project.code} estimate v{self.version}"

    @property
    def total(self):
        return self.lines.aggregate(t=models.Sum("amount"))["t"] or ZERO


class EstimateLine(models.Model):
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE, related_name="lines")
    cost_head = models.ForeignKey("accounts.CostHead", on_delete=models.PROTECT, related_name="estimate_lines")
    description = models.CharField(max_length=200, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal("1"))
    unit = models.CharField(max_length=20, blank=True)
    rate = MoneyField()
    amount = MoneyField()

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(condition=Q(amount__gte=0), name="estimate_line_non_negative")]


class Milestone(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    sequence = models.PositiveSmallIntegerField(default=1)
    name = models.CharField(max_length=120)
    weight = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("1"), help_text="Share of total work")
    planned_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    progress = models.PositiveSmallIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["project_id", "sequence", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(progress__lte=100), name="milestone_progress_max_100"),
            models.CheckConstraint(condition=Q(weight__gt=0), name="milestone_weight_positive"),
        ]

    def __str__(self):
        return f"{self.project.code}: {self.name}"
