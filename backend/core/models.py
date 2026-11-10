from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models, transaction


class Role(models.TextChoices):
    OWNER = "OWNER", "Owner / MD"
    ADMIN = "ADMIN", "Administrator"
    ACCOUNTS = "ACCOUNTS", "Accounts"
    SALES = "SALES", "Sales"
    ENGINEER = "ENGINEER", "Site Engineer"
    PURCHASE = "PURCHASE", "Purchase"


class User(AbstractUser):
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.SALES)
    phone = models.CharField(max_length=20, blank=True)
    designation = models.CharField(max_length=80, blank=True)

    @property
    def display_name(self):
        return self.get_full_name() or self.username

    def save(self, *args, **kwargs):
        if self.is_superuser and self.role == Role.SALES:
            self.role = Role.OWNER
        super().save(*args, **kwargs)


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        abstract = True


class Sequence(models.Model):
    """Gap-free document numbering. Rows are locked while a number is issued."""

    key = models.CharField(max_length=40, unique=True)
    last_value = models.PositiveBigIntegerField(default=0)

    def __str__(self):
        return f"{self.key}={self.last_value}"


def next_number(prefix: str, year: int | None = None, width: int = 5) -> str:
    """Return the next document number, e.g. ``MR-2026-00042``.

    Must run inside a transaction; the row lock makes concurrent callers queue.
    """
    key = f"{prefix}-{year}" if year else prefix
    with transaction.atomic():
        Sequence.objects.get_or_create(key=key)
        seq = Sequence.objects.select_for_update(of=("self",)).get(key=key)
        seq.last_value += 1
        seq.save(update_fields=["last_value"])
        return f"{key}-{seq.last_value:0{width}d}"


class AuditLog(models.Model):
    """Append-only trail of who did what."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=60)
    model = models.CharField(max_length=60)
    object_id = models.CharField(max_length=40, blank=True)
    summary = models.CharField(max_length=255, blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.action} {self.model}#{self.object_id}"


def audit(user, action: str, obj=None, summary: str = "", **data):
    AuditLog.objects.create(
        user=user if getattr(user, "pk", None) else None,
        action=action,
        model=obj.__class__.__name__ if obj is not None else "",
        object_id=str(getattr(obj, "pk", "") or ""),
        summary=summary[:255],
        data={k: str(v) for k, v in data.items()},
    )
