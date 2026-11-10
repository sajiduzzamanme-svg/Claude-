from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.exceptions import BusinessError
from core.permissions import FINANCE, MANAGERS
from core.views import AuditedModelViewSet

from . import services
from .models import LandParcel, LandPayment
from .serializers import (
    DateInput, LandParcelSerializer, LandPaymentInput, LandPaymentSerializer, RegisterInput, VoidInput,
)


class LandParcelViewSet(AuditedModelViewSet):
    queryset = LandParcel.objects.select_related("project").prefetch_related("payments__paid_from", "payments__journal_entry")
    serializer_class = LandParcelSerializer
    pagination_class = None
    read_roles = FINANCE
    write_roles = FINANCE
    action_roles = {"register": MANAGERS, "mutate": FINANCE}
    filterset_fields = ["project", "stage"]
    search_fields = ["title", "owner_name", "mouza", "dag_no"]

    def perform_destroy(self, instance):
        if instance.payments.exists():
            raise BusinessError("This parcel has payments and cannot be deleted.")
        instance.delete()

    def _fresh(self, parcel, code=status.HTTP_200_OK):
        return Response(LandParcelSerializer(self.get_queryset().get(pk=parcel.pk)).data, status=code)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        data = LandPaymentInput(data=request.data)
        data.is_valid(raise_exception=True)
        parcel = self.get_object()
        services.record_land_payment(parcel=parcel, user=request.user, **data.validated_data)
        return self._fresh(parcel, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def register(self, request, pk=None):
        data = RegisterInput(data=request.data)
        data.is_valid(raise_exception=True)
        return self._fresh(services.register_parcel(parcel=self.get_object(), user=request.user, **data.validated_data))

    @action(detail=True, methods=["post"])
    def mutate(self, request, pk=None):
        data = DateInput(data=request.data)
        data.is_valid(raise_exception=True)
        return self._fresh(services.mark_mutated(parcel=self.get_object(), user=request.user, **data.validated_data))


class LandPaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = LandPayment.objects.select_related("parcel__project", "paid_from", "journal_entry")
    serializer_class = LandPaymentSerializer
    read_roles = FINANCE
    write_roles = FINANCE
    filterset_fields = ["parcel", "parcel__project", "status"]

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = VoidInput(data=request.data)
        data.is_valid(raise_exception=True)
        payment = services.void_land_payment(self.get_object(), user=request.user, **data.validated_data)
        return Response(LandPaymentSerializer(payment).data)
