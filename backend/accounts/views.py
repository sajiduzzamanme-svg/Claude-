from datetime import date as date_cls
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils.dateparse import parse_date
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import BusinessError
from core.models import audit
from core.money import ZERO
from core.permissions import ALL_ROLES, FINANCE, MANAGERS

from .models import Account, AccountType, CostHead, JournalEntry, JournalLine
from .serializers import AccountSerializer, CostHeadSerializer, JournalEntrySerializer, ManualJournalInput
from .services import Line, post_journal, reverse_journal


def balances_map(**filters):
    rows = JournalLine.objects.filter(**filters).values_list("account").annotate(d=Sum("debit"), c=Sum("credit"))
    return {a: (d or ZERO, c or ZERO) for a, d, c in rows}


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    pagination_class = None
    read_roles = FINANCE
    write_roles = FINANCE
    filterset_fields = ["type", "is_cash_bank", "is_active"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["balances"] = balances_map()
        return ctx

    @action(detail=False, methods=["get"], url_path="cash")
    def cash(self, request):
        """Cash and bank accounts with balances — used by every payment form."""
        qs = Account.objects.filter(is_cash_bank=True, is_active=True)
        return Response(AccountSerializer(qs, many=True, context=self.get_serializer_context()).data)

    action_roles = {"cash": ALL_ROLES}


class CostHeadViewSet(viewsets.ModelViewSet):
    queryset = CostHead.objects.all()
    serializer_class = CostHeadSerializer
    pagination_class = None
    write_roles = FINANCE
    filterset_fields = ["category", "is_active"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class JournalViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = JournalEntry.objects.select_related("project", "created_by", "reverses", "reversed_by").prefetch_related(
        "lines__account", "lines__project", "lines__cost_head"
    )
    serializer_class = JournalEntrySerializer
    read_roles = FINANCE
    write_roles = FINANCE
    filterset_fields = {"project": ["exact"], "source_type": ["exact"], "date": ["gte", "lte"]}
    search_fields = ["number", "memo", "source_ref"]

    def create(self, request):
        data = ManualJournalInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        entry = post_journal(
            date=v["date"], memo=v["memo"], project=v.get("project"), user=request.user,
            lines=[Line(account=l["account"], debit=l["debit"], credit=l["credit"], description=l["description"]) for l in v["lines"]],
        )
        audit(request.user, "manual_journal", entry, f"{entry.number}: {entry.memo}")
        return Response(JournalEntrySerializer(self.get_queryset().get(pk=entry.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        entry = self.get_object()
        if entry.source_type != "manual":
            raise BusinessError(
                "This entry was created by a document. Void that document instead so the records stay in step."
            )
        rev = reverse_journal(
            entry, date=parse_date(request.data.get("date") or "") or date_cls.today(),
            memo=f"Reversal of {entry.number}: {request.data.get('reason', '')}".strip(), user=request.user,
        )
        audit(request.user, "reverse_journal", entry, f"{entry.number} reversed by {rev.number}")
        return Response(JournalEntrySerializer(self.get_queryset().get(pk=rev.pk)).data, status=status.HTTP_201_CREATED)


class TrialBalanceView(APIView):
    read_roles = FINANCE

    def get(self, request):
        filters = {}
        as_of = parse_date(request.query_params.get("as_of") or "")
        if as_of:
            filters["entry__date__lte"] = as_of
        if request.query_params.get("project"):
            filters["project_id"] = request.query_params["project"]
        totals = balances_map(**filters)
        rows, sums = [], {t: ZERO for t in AccountType.values}
        total_dr = total_cr = ZERO
        for a in Account.objects.all():
            d, c = totals.get(a.id, (ZERO, ZERO))
            net = d - c
            if d == 0 and c == 0:
                continue
            bal = net if a.is_debit_normal else -net
            sums[a.type] += bal
            total_dr += max(net, ZERO)
            total_cr += max(-net, ZERO)
            rows.append({
                "id": a.id, "code": a.code, "name": a.name, "name_bn": a.name_bn, "type": a.type,
                "debit": str(max(net, ZERO)), "credit": str(max(-net, ZERO)), "balance": str(bal),
            })
        profit = sums[AccountType.INCOME] - sums[AccountType.EXPENSE]
        return Response({
            "as_of": as_of, "rows": rows, "total_debit": str(total_dr), "total_credit": str(total_cr),
            "balanced": total_dr == total_cr,
            "summary": {
                "assets": str(sums[AccountType.ASSET]), "liabilities": str(sums[AccountType.LIABILITY]),
                "equity": str(sums[AccountType.EQUITY]), "income": str(sums[AccountType.INCOME]),
                "expenses": str(sums[AccountType.EXPENSE]), "net_profit": str(profit),
            },
        })


class LedgerView(APIView):
    read_roles = FINANCE

    def get(self, request):
        try:
            account = Account.objects.get(pk=request.query_params.get("account"))
        except (Account.DoesNotExist, ValueError, TypeError):
            raise BusinessError("Choose an account to see its ledger.")
        qs = JournalLine.objects.filter(account=account).select_related("entry", "project", "cost_head")
        if request.query_params.get("project"):
            qs = qs.filter(project_id=request.query_params["project"])
        start = parse_date(request.query_params.get("from") or "")
        end = parse_date(request.query_params.get("to") or "")
        sign = 1 if account.is_debit_normal else -1
        opening = ZERO
        if start:
            agg = qs.filter(entry__date__lt=start).aggregate(d=Sum("debit"), c=Sum("credit"))
            opening = sign * ((agg["d"] or ZERO) - (agg["c"] or ZERO))
            qs = qs.filter(entry__date__gte=start)
        if end:
            qs = qs.filter(entry__date__lte=end)
        running, rows = opening, []
        for l in qs.order_by("entry__date", "entry_id", "id")[:2000]:
            running += sign * (l.debit - l.credit)
            rows.append({
                "id": l.id, "date": l.entry.date, "number": l.entry.number, "memo": l.entry.memo,
                "source_type": l.entry.source_type, "source_ref": l.entry.source_ref,
                "project_code": l.project.code if l.project else None,
                "debit": str(l.debit), "credit": str(l.credit), "balance": str(running),
            })
        return Response({
            "account": AccountSerializer(account, context={"balances": balances_map(account=account)}).data,
            "opening": str(opening), "closing": str(running), "rows": rows,
        })
