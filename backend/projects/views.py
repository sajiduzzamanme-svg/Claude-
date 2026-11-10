from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.exceptions import BusinessError
from core.models import Role, audit
from core.permissions import ALL_ROLES, FINANCE, MANAGERS
from core.views import AuditedModelViewSet
from sales.models import Booking

from . import services
from .models import Estimate, Flat, Milestone, Project, ProjectDocument
from .serializers import (
    EstimateInput, EstimateSerializer, FlatSerializer, GenerateFlatsInput, MilestoneSerializer,
    ProjectDocumentSerializer, ProjectSerializer,
)

LIVE_BOOKINGS = Prefetch(
    "bookings",
    queryset=Booking.objects.filter(status__in=["ACTIVE", "HANDED_OVER"]).select_related("customer"),
    to_attr="live_bookings",
)


class ProjectViewSet(AuditedModelViewSet):
    queryset = Project.objects.prefetch_related("flats", "documents", "milestones")
    serializer_class = ProjectSerializer
    pagination_class = None
    write_roles = MANAGERS
    action_roles = {"summary": FINANCE, "estimate_vs_actual": FINANCE | {Role.ENGINEER}}
    search_fields = ["code", "name", "location"]
    filterset_fields = ["status", "sales_open"]

    def perform_create(self, serializer):
        project = serializer.save(created_by=self.request.user)
        services.add_default_documents(project)
        audit(self.request.user, "create_project", project, f"Project {project.code} created")

    def _fresh(self, project):
        return Response(ProjectSerializer(self.get_queryset().get(pk=project.pk)).data)

    @action(detail=True, methods=["post"], url_path="open-sales")
    def open_sales(self, request, pk=None):
        return self._fresh(services.open_sales(self.get_object(), request.user))

    @action(detail=True, methods=["post"], url_path="close-sales")
    def close_sales(self, request, pk=None):
        return self._fresh(services.close_sales(self.get_object(), request.user))

    @action(detail=True, methods=["post"], url_path="generate-flats")
    def generate_flats(self, request, pk=None):
        data = GenerateFlatsInput(data=request.data)
        data.is_valid(raise_exception=True)
        flats = services.generate_flats(project=self.get_object(), **data.validated_data)
        return Response({"created": len(flats)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        from reports.services import project_financials
        return Response(project_financials(self.get_object()))

    @action(detail=True, methods=["get"], url_path="estimate-vs-actual")
    def estimate_vs_actual(self, request, pk=None):
        from reports.services import estimate_vs_actual
        return Response(estimate_vs_actual(self.get_object()))


class FlatViewSet(viewsets.ModelViewSet):
    queryset = Flat.objects.select_related("project").prefetch_related(LIVE_BOOKINGS)
    serializer_class = FlatSerializer
    write_roles = MANAGERS
    filterset_fields = ["project", "status", "floor", "bedrooms"]
    search_fields = ["code", "flat_type"]
    ordering_fields = ["floor", "unit", "size_sqft"]

    def perform_destroy(self, instance):
        if instance.bookings.exists():
            raise BusinessError("This flat has booking history and cannot be deleted.")
        instance.delete()


class ProjectDocumentViewSet(viewsets.ModelViewSet):
    queryset = ProjectDocument.objects.all()
    serializer_class = ProjectDocumentSerializer
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    write_roles = MANAGERS | {Role.ACCOUNTS}
    filterset_fields = ["project", "status", "is_required"]


class EstimateViewSet(viewsets.ModelViewSet):
    queryset = Estimate.objects.select_related("project", "approved_by").prefetch_related("lines__cost_head")
    serializer_class = EstimateSerializer
    pagination_class = None
    read_roles = FINANCE | {Role.ENGINEER}
    write_roles = MANAGERS | {Role.ENGINEER, Role.ACCOUNTS}
    action_roles = {"approve": MANAGERS}
    filterset_fields = ["project", "status"]
    http_method_names = ["get", "post", "put", "delete", "head", "options"]

    def _save(self, request, estimate=None):
        data = EstimateInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if estimate is not None and v["project"] != estimate.project:
            raise BusinessError("An estimate cannot be moved to another project.")
        est = services.save_estimate(
            project=v["project"], title=v["title"], notes=v["notes"], lines=v["lines"], user=request.user, estimate=estimate
        )
        return EstimateSerializer(self.get_queryset().get(pk=est.pk)).data

    def create(self, request, *args, **kwargs):
        return Response(self._save(request), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(self._save(request, self.get_object()))

    def perform_destroy(self, instance):
        if instance.status != Estimate.Status.DRAFT:
            raise BusinessError("Only a draft estimate can be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        est = services.approve_estimate(self.get_object(), request.user)
        return Response(EstimateSerializer(self.get_queryset().get(pk=est.pk)).data)


class MilestoneViewSet(viewsets.ModelViewSet):
    queryset = Milestone.objects.all()
    serializer_class = MilestoneSerializer
    pagination_class = None
    write_roles = MANAGERS | {Role.ENGINEER}
    filterset_fields = ["project"]
