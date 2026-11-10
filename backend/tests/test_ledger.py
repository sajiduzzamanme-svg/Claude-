"""The ledger itself: balance, immutability, manual journal rules."""
from decimal import Decimal

from django.db import connection, transaction
from django.db.utils import DatabaseError, IntegrityError

from accounts.models import Account, JournalEntry, JournalLine
from accounts.services import K, acct, balance, cr, dr, ensure_funds, post_journal, reverse_journal
from core.exceptions import BusinessError
from core.money import money, prorate, split_amount

from .base import TODAY, SpaceUpTestCase, lakh

D = Decimal


class MoneyMathTests(SpaceUpTestCase):
    def test_split_never_loses_a_paisa(self):
        for total, parts in ((D("100.00"), 3), (D("2999999.99"), 24), (D("0.05"), 7), (D("1000000"), 36)):
            amounts = split_amount(total, parts)
            self.assertEqual(sum(amounts), total)
            self.assertEqual(len(amounts), parts)

    def test_prorate_sums_exactly(self):
        shares = prorate(D("1000000.00"), [D("1450"), D("1280"), D("1450"), D("999.5")])
        self.assertEqual(sum(shares), D("1000000.00"))

    def test_money_rounds_half_up_and_rejects_float_drift(self):
        self.assertEqual(money("2.675"), D("2.68"))
        self.assertEqual(money(0.1) + money(0.2), D("0.30"))


class JournalTests(SpaceUpTestCase):
    def setUp(self):
        self.build()

    def test_unbalanced_entry_is_rejected_and_nothing_is_written(self):
        before = JournalEntry.objects.count()
        with self.assertRaises(BusinessError):
            post_journal(date=TODAY, memo="bad", lines=[dr(self.cash, 100), cr(K.CAPITAL, 99)])
        self.assertEqual(JournalEntry.objects.count(), before)

    def test_line_must_be_one_sided_and_positive(self):
        with self.assertRaises(BusinessError):
            post_journal(date=TODAY, memo="bad", lines=[dr(self.cash, -5), cr(K.CAPITAL, -5)])

    def test_reversal_nets_to_zero_and_can_happen_only_once(self):
        entry = post_journal(date=TODAY, memo="loan", lines=[dr(self.bank, 5000), cr("LOAN", 5000)])
        self.assertEqual(balance("LOAN"), D("5000.00"))
        reverse_journal(entry, date=TODAY, memo="undo")
        self.assertEqual(balance("LOAN"), D("0.00"))
        with self.assertRaises(BusinessError):
            reverse_journal(entry, date=TODAY, memo="undo again")

    def test_posted_rows_cannot_be_edited_through_the_orm(self):
        entry = post_journal(date=TODAY, memo="x", lines=[dr(self.cash, 10), cr(K.CAPITAL, 10)])
        entry.memo = "changed"
        with self.assertRaises(RuntimeError):
            entry.save()
        with self.assertRaises(RuntimeError):
            entry.lines.first().delete()

    def test_database_blocks_updates_even_with_raw_sql(self):
        post_journal(date=TODAY, memo="x", lines=[dr(self.cash, 10), cr(K.CAPITAL, 10)])
        with self.assertRaises(DatabaseError), transaction.atomic():
            JournalLine.objects.filter(debit=10).update(debit=999)
        with self.assertRaises(DatabaseError), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("DELETE FROM accounts_journalline")

    def test_database_rejects_an_unbalanced_voucher_inserted_behind_the_app(self):
        entry = post_journal(date=TODAY, memo="x", lines=[dr(self.cash, 10), cr(K.CAPITAL, 10)])
        with self.assertRaises(DatabaseError), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute(
                    "INSERT INTO accounts_journalline (entry_id, account_id, debit, credit, description) "
                    "VALUES (%s, %s, 500, 0, 'sneaky')", [entry.id, self.cash.id],
                )
                cur.execute("SET CONSTRAINTS ALL IMMEDIATE")

    def test_database_rejects_two_sided_line(self):
        entry = post_journal(date=TODAY, memo="x", lines=[dr(self.cash, 10), cr(K.CAPITAL, 10)])
        with self.assertRaises(IntegrityError), transaction.atomic():
            with connection.cursor() as cur:
                cur.execute(
                    "INSERT INTO accounts_journalline (entry_id, account_id, debit, credit, description) "
                    "VALUES (%s, %s, 5, 5, '')", [entry.id, self.cash.id],
                )

    def test_cannot_pay_out_more_than_the_account_holds(self):
        self.assertEqual(balance(self.cash), D("0.00"))
        with self.assertRaises(BusinessError) as ctx:
            ensure_funds(self.cash, 1)
        self.assertEqual(ctx.exception.code, "insufficient_funds")
        ensure_funds(self.bank, lakh(1000))  # exactly the balance is fine
