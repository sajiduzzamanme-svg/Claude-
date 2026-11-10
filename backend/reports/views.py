from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import ALL_ROLES, FINANCE
from projects.models import Project

from . import services
from .integrity import run_checks

SENSITIVE_PROJECT_KEYS = ("land", "cost", "profit", "cash")
SENSITIVE_TOTALS = (
    "booked_profit", "realised_profit", "land_profit", "building_profit", "land_remaining", "vendor_payable", "cash",
)


def _project(request):
    pk = request.query_params.get("project")
    return Project.objects.filter(pk=pk).first() if pk else None


class DashboardView(APIView):
    """Everyone gets the sales picture; only finance roles see cost, cash and profit."""

    read_roles = ALL_ROLES

    def get(self, request):
        data = services.dashboard()
        full = request.user.is_superuser or request.user.role in FINANCE
        data["restricted"] = not full
        if not full:
            for p in data["projects"]:
                for key in SENSITIVE_PROJECT_KEYS:
                    p.pop(key, None)
            for key in SENSITIVE_TOTALS:
                data["totals"].pop(key, None)
            data["cash_accounts"] = []
            data["alerts"] = [a for a in data["alerts"] if a["kind"] == "overdue"]
            for row in data["trend"]:
                row.pop("outflow", None)
        return Response(data)


class ReceivablesView(APIView):
    read_roles = FINANCE | {"SALES"}

    def get(self, request):
        return Response(services.receivables(project=_project(request)))


class CashflowView(APIView):
    read_roles = FINANCE

    def get(self, request):
        try:
            months = max(1, min(int(request.query_params.get("months", 6)), 24))
        except ValueError:
            months = 6
        return Response(services.cashflow_forecast(months=months, project=_project(request)))


class ProfitView(APIView):
    read_roles = FINANCE

    def get(self, request):
        rows = [services.project_financials(p) for p in Project.objects.order_by("id")]
        return Response(rows)


class IntegrityView(APIView):
    read_roles = FINANCE

    def get(self, request):
        return Response(run_checks())
