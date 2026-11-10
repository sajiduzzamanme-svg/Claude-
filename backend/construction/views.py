from django.db.models import F, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.exceptions import BusinessError
from core.models import Role
from core.money import MoneyField, ZERO
from core.permissions import BUYING, FINANCE, MANAGERS, SITE_TEAM
from core.views import AuditedModelViewSet

from . import services
from .models import Expense, PurchaseOrder, Vendor, VendorBill, VendorPayment, WorkPackage
from .serializers import (
    ExpenseInput, ExpenseSerializer, PayBillInput, PurchaseOrderInput, PurchaseOrderSerializer, ReceiveInput,
    VendorBillInput, VendorBillSerializer, VendorPaymentSerializer, VendorSerializer, VoidInput, WorkPackageSerializer,
)

SITE_AND_FINANCE = SITE_TEAM | FINANCE
POSTED = Q(bills__status="POSTED")


class VendorViewSet(AuditedModelViewSet):
    serializer_class = VendorSerializer
    pagination_class = None
    read_roles = SITE_AND_FINANCE
    write_roles = BUYING | {Role.ENGINEER}
    filterset_fields = ["kind", "is_active"]
    search_fields = ["name", "phone"]

    def get_queryset(self):
        return Vendor.objects.annotate(
            billed=Coalesce(Sum("bills__gross_amount", filter=POSTED), ZERO, output_field=MoneyField()),
            payable=Coalesce(Sum(F("bills__net_payable") - F("bills__paid_amount"), filter=POSTED), ZERO, output_field=MoneyField()),
            retention=Coalesce(
                Sum(F("bills__retention_amount") - F("bills__retention_released"), filter=POSTED), ZERO, output_field=MoneyField()
            ),
        )

    def perform_destroy(self, instance):
        if instance.bills.exists() or instance.purchase_orders.exists():
            raise BusinessError("This vendor has bills or orders. Mark it inactive instead of deleting.")
        instance.delete()


class WorkPackageViewSet(AuditedModelViewSet):
    serializer_class = WorkPackageSerializer
    pagination_class = None
    read_roles = SITE_AND_FINANCE
    write_roles = MANAGERS | {Role.ENGINEER}
    filterset_fields = ["project", "execution", "status", "vendor"]

    def get_queryset(self):
        return WorkPackage.objects.select_related("project", "cost_head", "vendor").annotate(
            billed=Coalesce(Sum("bills__gross_amount", filter=POSTED), ZERO, output_field=MoneyField()),
            paid=Coalesce(
                Sum(F("bills__paid_amount") + F("bills__retention_released"), filter=POSTED), ZERO, output_field=MoneyField()
            ),
        )

    def perform_destroy(self, instance):
        if instance.bills.exists() or instance.purchase_orders.exists():
            raise BusinessError("This work package has bills or orders and cannot be deleted.")
        instance.delete()


class PurchaseOrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = PurchaseOrder.objects.select_related("project", "vendor", "work_package", "bill").prefetch_related("lines__cost_head")
    serializer_class = PurchaseOrderSerializer
    read_roles = SITE_AND_FINANCE
    write_roles = BUYING | {Role.ENGINEER}
    action_roles = {"approve": MANAGERS, "receive": BUYING}
    filterset_fields = ["project", "vendor", "status"]
    search_fields = ["number", "vendor__name"]

    def _fresh(self, order, code=status.HTTP_200_OK):
        return Response(PurchaseOrderSerializer(self.get_queryset().get(pk=order.pk)).data, status=code)

    def create(self, request):
        data = PurchaseOrderInput(data=request.data)
        data.is_valid(raise_exception=True)
        return self._fresh(services.create_purchase_order(user=request.user, **data.validated_data), status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._fresh(services.approve_purchase_order(self.get_object(), request.user))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._fresh(services.cancel_purchase_order(self.get_object(), request.user))

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        data = ReceiveInput(data=request.data)
        data.is_valid(raise_exception=True)
        order = self.get_object()
        services.receive_purchase_order(order, user=request.user, **data.validated_data)
        return self._fresh(order)


class VendorBillViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = VendorBill.objects.select_related(
        "project", "vendor", "work_package", "purchase_order", "journal_entry"
    ).prefetch_related("lines__cost_head", "payments__paid_from", "payments__journal_entry", "payments__bill__vendor", "payments__bill__project")
    serializer_class = VendorBillSerializer
    read_roles = SITE_AND_FINANCE
    write_roles = BUYING
    action_roles = {"pay": FINANCE, "void": FINANCE}
    filterset_fields = {"project": ["exact"], "vendor": ["exact"], "status": ["exact"], "kind": ["exact"], "work_package": ["exact"], "bill_date": ["gte", "lte"]}
    search_fields = ["number", "vendor__name", "reference"]

    def _fresh(self, bill, code=status.HTTP_200_OK):
        return Response(VendorBillSerializer(self.get_queryset().get(pk=bill.pk)).data, status=code)

    def create(self, request):
        data = VendorBillInput(data=request.data)
        data.is_valid(raise_exception=True)
        return self._fresh(services.create_bill(user=request.user, **data.validated_data), status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        data = PayBillInput(data=request.data)
        data.is_valid(raise_exception=True)
        bill = self.get_object()
        services.pay_bill(bill=bill, user=request.user, **data.validated_data)
        return self._fresh(bill, status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = VoidInput(data=request.data)
        data.is_valid(raise_exception=True)
        return self._fresh(services.void_bill(self.get_object(), user=request.user, **data.validated_data))


class VendorPaymentViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = VendorPayment.objects.select_related("bill__vendor", "bill__project", "paid_from", "journal_entry")
    serializer_class = VendorPaymentSerializer
    read_roles = SITE_AND_FINANCE
    write_roles = FINANCE
    filterset_fields = {"bill": ["exact"], "bill__project": ["exact"], "bill__vendor": ["exact"], "status": ["exact"], "date": ["gte", "lte"]}

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = VoidInput(data=request.data)
        data.is_valid(raise_exception=True)
        payment = services.void_vendor_payment(self.get_object(), user=request.user, **data.validated_data)
        return Response(VendorPaymentSerializer(payment).data)


class ExpenseViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Expense.objects.select_related("project", "cost_head", "paid_from", "journal_entry")
    serializer_class = ExpenseSerializer
    read_roles = FINANCE
    write_roles = FINANCE
    filterset_fields = {"project": ["exact", "isnull"], "cost_head": ["exact"], "cost_head__category": ["exact"], "status": ["exact"], "date": ["gte", "lte"]}
    search_fields = ["number", "description", "payee"]

    def create(self, request):
        data = ExpenseInput(data=request.data)
        data.is_valid(raise_exception=True)
        expense = services.record_expense(user=request.user, **data.validated_data)
        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = VoidInput(data=request.data)
        data.is_valid(raise_exception=True)
        expense = services.void_expense(self.get_object(), user=request.user, **data.validated_data)
        return Response(ExpenseSerializer(expense).data)
