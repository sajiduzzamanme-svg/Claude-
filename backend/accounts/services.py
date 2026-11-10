"""The only place journal entries are created.

Every money movement in Space Up ends up here, so the rules that keep the
books correct live in one function: ``post_journal``.
"""
from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from core.exceptions import BusinessError
from core.models import next_number
from core.money import ZERO, money

from .models import Account, CostCategory, CostHead, JournalEntry, JournalLine


class K:
    """System account keys (see the seed migration)."""

    CASH = "CASH"
    BANK = "BANK"
    MOBILE = "MOBILE"
    AR = "AR"
    LAND_ADVANCE = "LAND_ADVANCE"
    WIP_LAND = "WIP_LAND"
    WIP_DEV = "WIP_DEV"
    AP = "AP"
    RETENTION = "RETENTION"
    LAND_PAYABLE = "LAND_PAYABLE"
    CUSTOMER_ADVANCE = "CUSTOMER_ADVANCE"
    REFUND_PAYABLE = "REFUND_PAYABLE"
    CAPITAL = "CAPITAL"
    REVENUE = "REVENUE"
    FORFEIT_INCOME = "FORFEIT_INCOME"
    COGS_LAND = "COGS_LAND"
    COGS_DEV = "COGS_DEV"
    OVERHEAD = "OVERHEAD"
    MARKETING = "MARKETING"


def acct(key: str) -> Account:
    try:
        return Account.objects.get(system_key=key)
    except Account.DoesNotExist as exc:  # pragma: no cover - seed migration guarantees these
        raise BusinessError(f"System account '{key}' is missing. Run migrations.") from exc


def cost_head(key: str) -> CostHead:
    return CostHead.objects.get(system_key=key)


def cost_account(head: CostHead, project) -> Account:
    """Which ledger account a cost lands in.

    Land and build costs of a project are capitalised as work-in-progress and
    released to cost of sales at handover. Marketing and overhead are expensed.
    """
    if head.category == CostCategory.MARKETING:
        return acct(K.MARKETING)
    if head.category == CostCategory.OVERHEAD:
        return acct(K.OVERHEAD)
    if project is None:
        raise BusinessError(f"'{head.name}' is a project cost; choose the project it belongs to.")
    if head.category == CostCategory.LAND:
        return acct(K.WIP_LAND)
    return acct(K.WIP_DEV)


@dataclass
class Line:
    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    project: object = None
    cost_head: object = None
    customer: object = None
    vendor: object = None
    description: str = ""


def dr(account, amount, **kw) -> Line:
    return Line(account=account if isinstance(account, Account) else acct(account), debit=money(amount), **kw)


def cr(account, amount, **kw) -> Line:
    return Line(account=account if isinstance(account, Account) else acct(account), credit=money(amount), **kw)


def require_cash_account(account: Account) -> Account:
    if not account.is_cash_bank or not account.is_active:
        raise BusinessError(f"'{account.name}' is not an active cash or bank account.")
    return account


def ensure_funds(account: Account, amount) -> None:
    """Refuse to pay out more than the cash/bank account holds.

    Locks the account row so two simultaneous payments cannot both pass.
    """
    require_cash_account(account)
    Account.objects.select_for_update(of=("self",)).get(pk=account.pk)
    available = balance(account)
    if money(amount) > available:
        raise BusinessError(
            f"Insufficient balance in {account.name}: available {available}, needed {money(amount)}.",
            code="insufficient_funds",
        )


@transaction.atomic
def post_journal(*, date, memo, lines, user=None, project=None, source_type="manual", source_ref="", reverses=None):
    """Post a balanced journal entry and return it.

    Zero-amount lines are dropped. Raises ``BusinessError`` if the entry does
    not balance — nothing is written in that case.
    """
    lines = [l for l in lines if (l.debit or ZERO) != ZERO or (l.credit or ZERO) != ZERO]
    if len(lines) < 2:
        raise BusinessError("A journal entry needs at least one debit and one credit.")
    total_dr = total_cr = ZERO
    for l in lines:
        l.debit, l.credit = money(l.debit), money(l.credit)
        if l.debit < 0 or l.credit < 0:
            raise BusinessError("Journal amounts cannot be negative.")
        if (l.debit > 0) == (l.credit > 0):
            raise BusinessError("Each journal line must be either a debit or a credit.")
        if not l.account.is_active:
            raise BusinessError(f"Account {l.account} is inactive.")
        total_dr += l.debit
        total_cr += l.credit
    if total_dr != total_cr:
        raise BusinessError(f"Journal entry is not balanced: debit {total_dr} vs credit {total_cr}.")

    entry = JournalEntry.objects.create(
        number=next_number("JV", date.year, width=6),
        date=date,
        memo=memo[:255],
        project=project,
        source_type=source_type,
        source_ref=source_ref,
        reverses=reverses,
        created_by=user if getattr(user, "pk", None) else None,
    )
    JournalLine.objects.bulk_create(
        [
            JournalLine(
                entry=entry,
                account=l.account,
                project=l.project if l.project is not None else project,
                cost_head=l.cost_head,
                customer=l.customer,
                vendor=l.vendor,
                debit=l.debit,
                credit=l.credit,
                description=(l.description or "")[:255],
            )
            for l in lines
        ]
    )
    return entry


@transaction.atomic
def reverse_journal(entry: JournalEntry, *, date, memo, user=None):
    """Post the mirror image of ``entry``. An entry can be reversed only once."""
    entry = JournalEntry.objects.select_for_update(of=("self",)).get(pk=entry.pk)
    if JournalEntry.objects.filter(reverses=entry).exists():
        raise BusinessError(f"{entry.number} has already been reversed.")
    if entry.reverses_id:
        raise BusinessError("A reversal entry cannot itself be reversed.")
    lines = [
        Line(
            account=l.account, debit=l.credit, credit=l.debit, project=l.project, cost_head=l.cost_head,
            customer=l.customer, vendor=l.vendor, description=l.description,
        )
        for l in entry.lines.select_related("account", "project", "cost_head", "customer", "vendor")
    ]
    return post_journal(
        date=date, memo=memo, lines=lines, user=user, project=entry.project,
        source_type=entry.source_type, source_ref=entry.source_ref, reverses=entry,
    )


def balance(account, **filters) -> Decimal:
    """Balance in the account's natural direction (assets/expenses: debit − credit)."""
    account = account if isinstance(account, Account) else acct(account)
    agg = JournalLine.objects.filter(account=account, **filters).aggregate(d=Sum("debit"), c=Sum("credit"))
    d, c = agg["d"] or ZERO, agg["c"] or ZERO
    return d - c if account.is_debit_normal else c - d
