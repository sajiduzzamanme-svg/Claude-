from decimal import Decimal

from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone

from core.exceptions import BusinessError
from core.models import audit
from core.money import ZERO, money

from .models import DEFAULT_DOCUMENTS, Estimate, EstimateLine, Flat, Milestone, Project, ProjectDocument


def add_default_documents(project: Project):
    ProjectDocument.objects.bulk_create(
        [ProjectDocument(project=project, doc_type=t, title=title, is_required=req) for t, title, req in DEFAULT_DOCUMENTS]
    )


def missing_required_documents(project: Project):
    return list(project.documents.filter(is_required=True).exclude(status=ProjectDocument.Status.RECEIVED))


@transaction.atomic
def open_sales(project: Project, user):
    """Allow flats of this project to be booked — only once the paperwork is complete."""
    project = Project.objects.select_for_update(of=("self",)).get(pk=project.pk)
    missing = missing_required_documents(project)
    if missing:
        names = ", ".join(d.title for d in missing)
        raise BusinessError(f"Sales cannot open until these required documents are received: {names}.", code="documents_missing")
    if not project.flats.exists():
        raise BusinessError("Add the flats of this project before opening sales.")
    project.sales_open = True
    project.sales_opened_at = timezone.now()
    if project.status == Project.Status.PLANNING:
        project.status = Project.Status.ACTIVE
    project.save(update_fields=["sales_open", "sales_opened_at", "status", "updated_at"])
    audit(user, "open_sales", project, f"Sales opened for {project.code}")
    return project


@transaction.atomic
def close_sales(project: Project, user):
    project.sales_open = False
    project.save(update_fields=["sales_open", "updated_at"])
    audit(user, "close_sales", project, f"Sales closed for {project.code}")
    return project


@transaction.atomic
def generate_flats(*, project, floors_from, floors_to, units, size_sqft, flat_type="", bedrooms=0,
                   land_price=ZERO, construction_price=ZERO, other_charges=ZERO, land_share_katha=Decimal("0"), facing=""):
    """Create a grid of flats (every unit letter on every floor)."""
    if floors_to < floors_from:
        raise BusinessError("'Floor to' must not be below 'floor from'.")
    units = [u.strip().upper() for u in units if u.strip()]
    if not units:
        raise BusinessError("Give at least one unit letter, e.g. A, B, C.")
    existing = set(project.flats.values_list("code", flat=True))
    new = []
    for floor in range(floors_from, floors_to + 1):
        for unit in units:
            code = f"{floor}{unit}"
            if code in existing:
                raise BusinessError(f"Flat {code} already exists in this project.")
            new.append(Flat(
                project=project, code=code, floor=floor, unit=unit, flat_type=flat_type, bedrooms=bedrooms,
                size_sqft=size_sqft, land_share_katha=land_share_katha, facing=facing,
                land_price=money(land_price), construction_price=money(construction_price),
                other_charges=money(other_charges),
            ))
    return Flat.objects.bulk_create(new)


@transaction.atomic
def save_estimate(*, project, title, lines, user, notes="", estimate=None):
    """Create a new draft estimate version, or replace the lines of an existing draft."""
    if estimate is None:
        last = project.estimates.aggregate(m=Max("version"))["m"] or 0
        estimate = Estimate.objects.create(project=project, version=last + 1, title=title, notes=notes, created_by=user)
    else:
        if estimate.status != Estimate.Status.DRAFT:
            raise BusinessError("Only a draft estimate can be edited. Create a new version instead.")
        estimate.title, estimate.notes = title, notes
        estimate.save(update_fields=["title", "notes", "updated_at"])
        estimate.lines.all().delete()
    rows = []
    for l in lines:
        qty = Decimal(str(l.get("quantity") or "1"))
        rate = money(l.get("rate") or 0)
        amount = money(l["amount"]) if l.get("amount") not in (None, "") else money(qty * rate)
        if amount < 0:
            raise BusinessError("Estimate amounts cannot be negative.")
        rows.append(EstimateLine(
            estimate=estimate, cost_head=l["cost_head"], description=l.get("description", ""),
            quantity=qty, unit=l.get("unit", ""), rate=rate, amount=amount,
        ))
    EstimateLine.objects.bulk_create(rows)
    return estimate


@transaction.atomic
def approve_estimate(estimate: Estimate, user):
    estimate = Estimate.objects.select_for_update(of=("self",)).get(pk=estimate.pk)
    if estimate.status != Estimate.Status.DRAFT:
        raise BusinessError("Only a draft estimate can be approved.")
    if not estimate.lines.exists():
        raise BusinessError("An empty estimate cannot be approved.")
    Estimate.objects.filter(project=estimate.project, status=Estimate.Status.APPROVED).update(
        status=Estimate.Status.SUPERSEDED
    )
    estimate.status = Estimate.Status.APPROVED
    estimate.approved_by = user
    estimate.approved_at = timezone.now()
    estimate.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    audit(user, "approve_estimate", estimate, f"{estimate} approved", total=estimate.total)
    return estimate


def project_progress(project: Project) -> Decimal:
    """Weighted completion of the project's milestones, 0–100."""
    rows = list(project.milestones.values_list("weight", "progress"))
    total_weight = sum((w for w, _ in rows), Decimal("0"))
    if not total_weight:
        return Decimal("0.0")
    done = sum((w * p for w, p in rows), Decimal("0"))
    return (done / total_weight).quantize(Decimal("0.1"))
