from django.db.models import Count, F, Prefetch, Q, Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.exceptions import BusinessError
from core.models import Role, audit
from core.permissions import FINANCE, MANAGERS, SALES_TEAM
from core.views import AuditedModelViewSet

from . import services
from .models import Booking, Cancellation, Customer, Installment, Lead, PriceRevision, Receipt
from .serializers import (
    BookingDetailSerializer, BookingInput, BookingListSerializer, CancelInput, CancellationSerializer,
    CustomerSerializer, HandoverInput, LeadSerializer, PriceRevisionInput, PriceRevisionSerializer, ReceiptInput,
    ReceiptSerializer, RefundInput, SchedulePreviewInput, TransferInput, VoidInput,
)

LIVE = ["ACTIVE", "HANDED_OVER"]


class CustomerViewSet(AuditedModelViewSet):
    serializer_class = CustomerSerializer
    read_roles = SALES_TEAM
    write_roles = SALES_TEAM
    search_fields = ["name", "phone", "nid", "email"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        live = Q(bookings__status__in=LIVE)
        return Customer.objects.annotate(
            bookings_count=Count("bookings", filter=live, distinct=True),
        )

    def _money_totals(self, customers):
        """Contract value and paid amount per customer (separate query avoids join fan-out)."""
        ids = [c.id for c in customers]
        rows = (
            Installment.objects.filter(booking__customer_id__in=ids, booking__status__in=LIVE)
            .values_list("booking__customer_id").annotate(a=Sum("amount"), p=Sum("paid_amount"))
        )
        totals = {cid: (a, p) for cid, a, p in rows}
        for c in customers:
            c.contract_value, c.paid = totals.get(c.id, (0, 0))
        return customers

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        data = self.get_serializer(self._money_totals(list(page)), many=True).data
        return self.get_paginated_response(data)

    def retrieve(self, request, *args, **kwargs):
        obj = self._money_totals([self.get_object()])[0]
        return Response(self.get_serializer(obj).data)

    def perform_destroy(self, instance):
        if instance.bookings.exists():
            raise BusinessError("This customer has bookings and cannot be deleted.")
        instance.delete()


class LeadViewSet(AuditedModelViewSet):
    queryset = Lead.objects.select_related("project", "assigned_to")
    serializer_class = LeadSerializer
    pagination_class = None
    read_roles = SALES_TEAM
    write_roles = SALES_TEAM
    filterset_fields = ["stage", "project", "assigned_to"]
    search_fields = ["name", "phone", "source"]

    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        """Turn a lead into a customer record (ready for a booking)."""
        lead = self.get_object()
        if lead.customer_id:
            return Response(CustomerSerializer(lead.customer).data)
        customer = Customer.objects.create(name=lead.name, phone=lead.phone, notes=lead.notes, created_by=request.user)
        lead.customer = customer
        lead.stage = Lead.Stage.WON
        lead.save(update_fields=["customer", "stage", "updated_at"])
        audit(request.user, "convert_lead", lead, f"Lead {lead.name} converted to customer")
        return Response(CustomerSerializer(customer).data, status=status.HTTP_201_CREATED)


class BookingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    read_roles = SALES_TEAM
    write_roles = SALES_TEAM
    action_roles = {
        "receive": FINANCE, "cancel": MANAGERS | {Role.ACCOUNTS}, "handover": MANAGERS | {Role.ACCOUNTS},
        "transfer": MANAGERS | {Role.ACCOUNTS},
    }
    filterset_fields = ["project", "status", "customer", "sales_person", "flat"]
    search_fields = ["number", "customer__name", "customer__phone", "flat__code"]
    ordering_fields = ["booking_date", "total_price", "id"]

    def get_queryset(self):
        today = timezone.localdate()
        qs = Booking.objects.select_related("project", "flat", "customer", "sales_person").annotate(
            paid_sum=Sum("installments__paid_amount"),
            overdue_sum=Sum(
                F("installments__amount") - F("installments__paid_amount"), filter=Q(installments__due_date__lt=today)
            ),
        )
        if self.action == "retrieve" or self.detail:
            qs = qs.prefetch_related(
                "installments",
                Prefetch("receipts", queryset=Receipt.objects.select_related(
                    "deposit_account", "created_by", "journal_entry", "booking__customer", "booking__project", "booking__flat"
                ).prefetch_related("allocations__installment")),
                "transfers__from_customer", "transfers__to_customer", "cancellation__refunds__paid_from",
            )
        return qs

    def get_serializer_class(self):
        return BookingListSerializer if self.action == "list" else BookingDetailSerializer

    def _detail(self, booking, code=status.HTTP_200_OK):
        self.action = "retrieve"
        return Response(BookingDetailSerializer(self.get_queryset().get(pk=booking.pk)).data, status=code)

    def create(self, request):
        data = BookingInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = services.create_booking(user=request.user, **data.validated_data)
        return self._detail(booking, status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="preview-schedule")
    def preview_schedule(self, request):
        data = SchedulePreviewInput(data=request.data)
        data.is_valid(raise_exception=True)
        rows = services.build_schedule(**data.validated_data)
        return Response([{**r, "amount": str(r["amount"])} for r in rows])

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        data = ReceiptInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = self.get_object()
        receipt = services.record_receipt(booking=booking, user=request.user, **data.validated_data)
        body = self._detail(booking, status.HTTP_201_CREATED)
        body.data["new_receipt_id"] = receipt.id
        return body

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        data = CancelInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = self.get_object()
        services.cancel_booking(booking=booking, user=request.user, **data.validated_data)
        return self._detail(booking)

    @action(detail=True, methods=["post"])
    def handover(self, request, pk=None):
        data = HandoverInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = self.get_object()
        services.handover_booking(booking=booking, user=request.user, **data.validated_data)
        return self._detail(booking)

    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        data = TransferInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = self.get_object()
        services.transfer_booking(booking=booking, user=request.user, **data.validated_data)
        return self._detail(booking)


class ReceiptViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Receipt.objects.select_related(
        "booking__customer", "booking__project", "booking__flat", "deposit_account", "created_by", "journal_entry"
    ).prefetch_related("allocations__installment")
    serializer_class = ReceiptSerializer
    read_roles = SALES_TEAM
    write_roles = FINANCE
    filterset_fields = {"booking": ["exact"], "booking__project": ["exact"], "status": ["exact"], "method": ["exact"], "date": ["gte", "lte"]}
    search_fields = ["number", "booking__number", "booking__customer__name", "reference"]

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = VoidInput(data=request.data)
        data.is_valid(raise_exception=True)
        receipt = services.void_receipt(self.get_object(), user=request.user, **data.validated_data)
        return Response(ReceiptSerializer(self.get_queryset().get(pk=receipt.pk)).data)


class PriceRevisionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = PriceRevision.objects.select_related("project", "approved_by").prefetch_related(
        "lines__booking__customer", "lines__booking__flat"
    )
    serializer_class = PriceRevisionSerializer
    pagination_class = None
    read_roles = SALES_TEAM
    write_roles = FINANCE
    action_roles = {"approve": MANAGERS}
    filterset_fields = ["project", "status"]

    def _lines(self, v):
        if v.get("lines"):
            return [(l["booking"], l["amount"]) for l in v["lines"]]
        return services.distribute_revision(v["project"], v["total_amount"], v["basis"])

    def create(self, request):
        data = PriceRevisionInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        revision = services.create_price_revision(
            project=v["project"], title=v["title"], reason=v["reason"], meeting_date=v["meeting_date"],
            due_date=v["due_date"], resolution_ref=v["resolution_ref"], lines=self._lines(v), user=request.user,
        )
        return Response(PriceRevisionSerializer(self.get_queryset().get(pk=revision.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def preview(self, request):
        """Show how a total would be shared, without saving anything."""
        data = PriceRevisionInput(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        rows = services.distribute_revision(v["project"], v["total_amount"], v.get("basis", "SQFT"))
        return Response([
            {"booking": b.id, "booking_number": b.number, "customer_name": b.customer.name, "flat_code": b.flat.code,
             "flat_size": str(b.flat.size_sqft), "amount": str(amount)}
            for b, amount in rows
        ])

    def perform_destroy(self, instance):
        if instance.status != PriceRevision.Status.DRAFT:
            raise BusinessError("An approved revision cannot be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        revision = services.approve_price_revision(self.get_object(), request.user)
        return Response(PriceRevisionSerializer(self.get_queryset().get(pk=revision.pk)).data)


class CancellationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Cancellation.objects.select_related("booking__customer", "booking__project", "booking__flat").prefetch_related(
        "refunds__paid_from"
    )
    serializer_class = CancellationSerializer
    pagination_class = None
    read_roles = FINANCE
    write_roles = FINANCE
    filterset_fields = ["booking__project"]

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        data = RefundInput(data=request.data)
        data.is_valid(raise_exception=True)
        cancellation = self.get_object()
        services.pay_refund(cancellation=cancellation, user=request.user, **data.validated_data)
        return Response(CancellationSerializer(self.get_queryset().get(pk=cancellation.pk)).data, status=status.HTTP_201_CREATED)
