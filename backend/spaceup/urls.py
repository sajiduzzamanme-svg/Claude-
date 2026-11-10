from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts import views as accounts
from construction import views as construction
from core import views as core
from land import views as land
from projects import views as projects
from reports import views as reports
from sales import views as sales

class Router(DefaultRouter):
    """Accept URLs with or without the trailing slash, so the app works behind any proxy."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = "/?"


router = Router()
router.register("users", core.UserViewSet, basename="user")
router.register("audit-log", core.AuditLogViewSet, basename="audit-log")
router.register("accounts", accounts.AccountViewSet, basename="account")
router.register("cost-heads", accounts.CostHeadViewSet, basename="cost-head")
router.register("journal", accounts.JournalViewSet, basename="journal")
router.register("projects", projects.ProjectViewSet, basename="project")
router.register("flats", projects.FlatViewSet, basename="flat")
router.register("documents", projects.ProjectDocumentViewSet, basename="document")
router.register("estimates", projects.EstimateViewSet, basename="estimate")
router.register("milestones", projects.MilestoneViewSet, basename="milestone")
router.register("land-parcels", land.LandParcelViewSet, basename="land-parcel")
router.register("land-payments", land.LandPaymentViewSet, basename="land-payment")
router.register("customers", sales.CustomerViewSet, basename="customer")
router.register("leads", sales.LeadViewSet, basename="lead")
router.register("bookings", sales.BookingViewSet, basename="booking")
router.register("receipts", sales.ReceiptViewSet, basename="receipt")
router.register("price-revisions", sales.PriceRevisionViewSet, basename="price-revision")
router.register("cancellations", sales.CancellationViewSet, basename="cancellation")
router.register("vendors", construction.VendorViewSet, basename="vendor")
router.register("work-packages", construction.WorkPackageViewSet, basename="work-package")
router.register("purchase-orders", construction.PurchaseOrderViewSet, basename="purchase-order")
router.register("vendor-bills", construction.VendorBillViewSet, basename="vendor-bill")
router.register("vendor-payments", construction.VendorPaymentViewSet, basename="vendor-payment")
router.register("expenses", construction.ExpenseViewSet, basename="expense")


def health(request):
    return JsonResponse({"status": "ok", "app": "Space Up ERP"})


api = [
    re_path(r"^health/?$", health),
    re_path(r"^auth/login/?$", TokenObtainPairView.as_view()),
    re_path(r"^auth/refresh/?$", TokenRefreshView.as_view()),
    re_path(r"^auth/me/?$", core.me),
    re_path(r"^staff/?$", core.staff_directory),
    re_path(r"^dashboard/?$", reports.DashboardView.as_view()),
    re_path(r"^reports/receivables/?$", reports.ReceivablesView.as_view()),
    re_path(r"^reports/cashflow/?$", reports.CashflowView.as_view()),
    re_path(r"^reports/profit/?$", reports.ProfitView.as_view()),
    re_path(r"^reports/integrity/?$", reports.IntegrityView.as_view()),
    re_path(r"^reports/trial-balance/?$", accounts.TrialBalanceView.as_view()),
    re_path(r"^reports/ledger/?$", accounts.LedgerView.as_view()),
    path("", include(router.urls)),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(api)),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
