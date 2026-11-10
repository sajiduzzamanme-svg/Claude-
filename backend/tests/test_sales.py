"""Bookings, schedules, receipts, revisions, cancellation, handover."""
from datetime import timedelta
from decimal import Decimal

from django.db.utils import IntegrityError

from accounts.models import JournalEntry
from accounts.services import K
from core.exceptions import BusinessError
from projects import services as proj
from projects.models import Flat
from reports.integrity import run_checks
from sales import services as sales
from sales.models import Booking, Installment, Receipt

from .base import TODAY, SpaceUpTestCase, lakh

D = Decimal


class ScheduleTests(SpaceUpTestCase):
    def test_schedule_adds_up_exactly_with_awkward_numbers(self):
        rows = sales.build_schedule(
            total=D("3099999.99"), booking_date=TODAY, booking_money=lakh(1), down_payment=D("333333.33"),
            installment_count=37, handover_amount=D("100000.01"),
        )
        self.assertEqual(sum(r["amount"] for r in rows), D("3099999.99"))
        self.assertEqual(len(rows), 40)

    def test_round_figures_put_the_difference_in_the_last_installment(self):
        rows = sales.build_schedule(total=lakh(31), booking_date=TODAY, booking_money=lakh(1), installment_count=7, round_to=1000)
        inst = [r["amount"] for r in rows if r["kind"] == "INSTALLMENT"]
        self.assertTrue(all(a % 1000 == 0 for a in inst[:-1]))
        self.assertEqual(sum(r["amount"] for r in rows), lakh(31))

    def test_month_end_dates_do_not_overflow(self):
        from datetime import date
        self.assertEqual(sales.add_months(date(2026, 1, 31), 1), date(2026, 2, 28))
        self.assertEqual(sales.add_months(date(2026, 11, 30), 3), date(2027, 2, 28))

    def test_unscheduled_remainder_is_refused(self):
        with self.assertRaises(BusinessError):
            sales.build_schedule(total=lakh(31), booking_date=TODAY, booking_money=lakh(1))


class BookingTests(SpaceUpTestCase):
    def setUp(self):
        self.build()

    def test_booking_takes_the_flat_and_matches_the_price(self):
        b = self.book("1A")
        self.assertEqual(b.total_price, lakh(31))
        self.assertEqual(self.flat("1A").status, Flat.Status.BOOKED)
        self.assertEqual(sum(i.amount for i in b.installments.all()), lakh(31))

    def test_same_flat_cannot_be_sold_twice(self):
        self.book("1A")
        with self.assertRaises(BusinessError):
            self.book("1A", customer=self.customers[1])

    def test_database_itself_blocks_a_second_live_booking(self):
        b = self.book("1A")
        with self.assertRaises(IntegrityError):
            Booking.objects.create(
                number="BK-X", project=b.project, flat=b.flat, customer=self.customers[1], booking_date=TODAY,
                land_price=lakh(10), construction_price=lakh(20), other_charges=lakh(1), total_price=lakh(31),
            )

    def test_schedule_that_does_not_match_price_is_refused(self):
        flat = self.flat("2A")
        with self.assertRaises(BusinessError) as ctx:
            sales.create_booking(
                flat=flat, customer=self.customers[0], booking_date=TODAY, user=self.seller,
                schedule=[dict(due_date=TODAY, amount=lakh(30))],
            )
        self.assertEqual(ctx.exception.code, "schedule_mismatch")
        self.assertEqual(self.flat("2A").status, Flat.Status.AVAILABLE)

    def test_no_sale_until_documents_are_complete(self):
        proj.close_sales(self.project, self.owner)
        with self.assertRaises(BusinessError) as ctx:
            self.book("1A")
        self.assertEqual(ctx.exception.code, "sales_closed")
        self.project.documents.filter(doc_type="APPROVED_PLAN").update(status="PENDING")
        with self.assertRaises(BusinessError) as ctx:
            proj.open_sales(self.project, self.owner)
        self.assertEqual(ctx.exception.code, "documents_missing")

    def test_discount_reduces_the_contract_price(self):
        b = self.book("1A", discount=lakh(1))
        self.assertEqual(b.total_price, lakh(30))


class ReceiptTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.booking = self.book("1A")  # 1 lakh booking + 10 × 3 lakh

    def receive(self, amount, **kw):
        return sales.record_receipt(booking=self.booking, date=TODAY, amount=amount, deposit_account=self.bank, user=self.accountant, **kw)

    def test_money_goes_to_the_oldest_installments_first(self):
        self.receive(lakh(5.5))
        paid = list(self.booking.installments.order_by("sequence").values_list("paid_amount", flat=True)[:4])
        self.assertEqual(paid, [lakh(1), lakh(3), lakh(1.5), D("0.00")])

    def test_ledger_shows_an_advance_not_income(self):
        self.receive(lakh(4))
        self.assertEqual(self.bal(K.CUSTOMER_ADVANCE), lakh(4))
        self.assertEqual(self.bal(K.REVENUE), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(1004))

    def test_cannot_collect_more_than_is_owed(self):
        self.receive(lakh(30))
        with self.assertRaises(BusinessError) as ctx:
            self.receive(lakh(1) + D("0.01"))
        self.assertEqual(ctx.exception.code, "over_collection")
        self.receive(lakh(1))  # exactly the remainder is fine
        self.assertEqual(sales.outstanding_total(self.booking), D("0.00"))

    def test_void_puts_everything_back(self):
        r = self.receive(lakh(5.5))
        sales.void_receipt(r, reason="Cheque bounced", user=self.accountant)
        self.assertEqual(sales.paid_total(self.booking), D("0.00"))
        self.assertEqual(self.bal(K.CUSTOMER_ADVANCE), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(1000))
        with self.assertRaises(BusinessError):
            sales.void_receipt(r, reason="again", user=self.accountant)
        self.assertTrue(run_checks()["ok"])

    def test_receipt_numbers_are_sequential(self):
        a, b = self.receive(1000), self.receive(1000)
        self.assertEqual(int(b.number[-5:]) - int(a.number[-5:]), 1)

    def test_database_refuses_paid_above_amount(self):
        inst = self.booking.installments.first()
        inst.paid_amount = inst.amount + 1
        with self.assertRaises(IntegrityError):
            inst.save()


class PriceRevisionTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.b1 = self.book("1A")
        self.b2 = self.book("2A", customer=self.customers[1])
        Flat.objects.filter(pk=self.b2.flat_id).update(size_sqft=D("1500"))

    def test_shared_by_flat_size_and_original_price_untouched(self):
        lines = sales.distribute_revision(self.project, lakh(5), "SQFT")
        self.assertEqual(sum(a for _, a in lines), lakh(5))
        self.assertEqual(dict((b.id, a) for b, a in lines), {self.b1.id: lakh(2), self.b2.id: lakh(3)})
        rev = sales.create_price_revision(
            project=self.project, title="Rod price increase", meeting_date=TODAY, due_date=TODAY + timedelta(days=60),
            lines=lines, user=self.accountant, resolution_ref="",
        )
        with self.assertRaises(BusinessError):  # the meeting resolution is mandatory
            sales.approve_price_revision(rev, self.owner)
        rev.resolution_ref = "MoM-2026-04"
        rev.save()
        sales.approve_price_revision(rev, self.owner)
        self.b1.refresh_from_db()
        self.assertEqual(self.b1.total_price, lakh(31))
        self.assertEqual(self.b1.contract_value, lakh(33))
        self.assertEqual(sales.outstanding_total(self.b1), lakh(33))
        self.assertEqual(self.b1.installments.filter(kind=Installment.Kind.REVISION).count(), 1)
        with self.assertRaises(BusinessError):
            sales.approve_price_revision(rev, self.owner)
        self.assertTrue(run_checks()["ok"])


class CancellationTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.booking = self.book("1A")
        sales.record_receipt(booking=self.booking, date=TODAY, amount=lakh(5), deposit_account=self.bank, user=self.accountant)

    def test_paid_amount_splits_into_deduction_and_refund(self):
        c = sales.cancel_booking(booking=self.booking, date=TODAY, reason="Changed mind", deduction=lakh(1), user=self.owner)
        self.assertEqual((c.paid_total, c.deduction, c.refund_amount), (lakh(5), lakh(1), lakh(4)))
        self.assertEqual(self.bal(K.CUSTOMER_ADVANCE), D("0.00"))
        self.assertEqual(self.bal(K.FORFEIT_INCOME), lakh(1))
        self.assertEqual(self.bal(K.REFUND_PAYABLE), lakh(4))
        self.assertEqual(self.flat("1A").status, Flat.Status.AVAILABLE)

        sales.pay_refund(cancellation=c, date=TODAY, amount=lakh(3), paid_from=self.bank, user=self.accountant)
        with self.assertRaises(BusinessError):
            sales.pay_refund(cancellation=c, date=TODAY, amount=lakh(1.5), paid_from=self.bank, user=self.accountant)
        sales.pay_refund(cancellation=c, date=TODAY, amount=lakh(1), paid_from=self.bank, user=self.accountant)
        self.assertEqual(self.bal(K.REFUND_PAYABLE), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(1001))  # 1000 + 5 received − 4 refunded

        # the flat can be sold again, and the cancelled receipts stay frozen
        self.book("1A", customer=self.customers[2])
        with self.assertRaises(BusinessError):
            sales.void_receipt(Receipt.objects.first(), reason="x", user=self.accountant)
        with self.assertRaises(BusinessError):
            sales.record_receipt(booking=self.booking, date=TODAY, amount=100, deposit_account=self.bank, user=self.accountant)
        self.assertTrue(run_checks()["ok"])

    def test_deduction_cannot_exceed_what_was_paid(self):
        with self.assertRaises(BusinessError):
            sales.cancel_booking(booking=self.booking, date=TODAY, reason="x", deduction=lakh(6), user=self.owner)


class HandoverTests(SpaceUpTestCase):
    def setUp(self):
        self.build(flats=2)
        from construction import services as build
        from land import services as land
        parcel = self.parcel(lakh(20))
        land.record_land_payment(parcel=parcel, date=TODAY, amount=lakh(20), paid_from=self.bank, user=self.owner)
        land.register_parcel(parcel=parcel, date=TODAY, deed_no="D1", user=self.owner)
        build.record_expense(project=self.project, cost_head=self.head["C02"], date=TODAY, amount=lakh(30),
                             paid_from=self.bank, description="Structure", user=self.accountant)
        self.b1 = self.book("1A")
        self.b2 = self.book("2A", customer=self.customers[1])

    def test_handover_recognises_revenue_and_releases_cost(self):
        sales.record_receipt(booking=self.b1, date=TODAY, amount=lakh(25), deposit_account=self.bank, user=self.accountant)
        with self.assertRaises(BusinessError) as ctx:
            sales.handover_booking(booking=self.b1, date=TODAY, user=self.owner)
        self.assertEqual(ctx.exception.code, "dues_pending")

        sales.handover_booking(booking=self.b1, date=TODAY, user=self.owner, allow_dues=True)
        self.assertEqual(self.bal(K.REVENUE), lakh(31))
        self.assertEqual(self.bal(K.AR), lakh(6))
        self.assertEqual(self.bal(K.CUSTOMER_ADVANCE), D("0.00"))
        self.assertEqual(self.bal(K.COGS_LAND), lakh(10))   # half of 20 lakh land
        self.assertEqual(self.bal(K.COGS_DEV), lakh(15))    # half of 30 lakh build cost
        self.assertEqual(self.bal(K.WIP_LAND), lakh(10))
        self.assertEqual(self.flat("1A").status, Flat.Status.HANDED_OVER)

        # money received after handover settles the receivable
        r = sales.record_receipt(booking=self.b1, date=TODAY, amount=lakh(6), deposit_account=self.bank, user=self.accountant)
        self.assertEqual(self.bal(K.AR), D("0.00"))
        sales.void_receipt(r, reason="bounced", user=self.accountant)
        self.assertEqual(self.bal(K.AR), lakh(6))
        self.assertTrue(run_checks()["ok"])

    def test_last_flat_clears_work_in_progress_exactly(self):
        from construction import services as build
        for b in (self.b1, self.b2):
            sales.record_receipt(booking=b, date=TODAY, amount=lakh(31), deposit_account=self.bank, user=self.accountant)
        sales.handover_booking(booking=self.b1, date=TODAY, user=self.owner)
        # a late cost arrives before the last handover
        build.record_expense(project=self.project, cost_head=self.head["C09"], date=TODAY, amount=D("333333.33"),
                             paid_from=self.bank, description="Paint", user=self.accountant)
        sales.handover_booking(booking=self.b2, date=TODAY, user=self.owner)
        self.assertEqual(self.bal(K.WIP_LAND), D("0.00"))
        self.assertEqual(self.bal(K.WIP_DEV), D("0.00"))
        self.assertEqual(self.bal(K.COGS_DEV), lakh(30) + D("333333.33"))
        self.assertEqual(self.bal(K.REVENUE), lakh(62))
        self.assertTrue(run_checks()["ok"])

    def test_transfer_changes_owner_and_books_the_fee(self):
        sales.transfer_booking(booking=self.b1, to_customer=self.customers[3], date=TODAY, fee=50000,
                               fee_account=self.cash, user=self.owner)
        self.b1.refresh_from_db()
        self.assertEqual(self.b1.customer, self.customers[3])
        self.assertEqual(self.bal("TRANSFER_FEE"), D("50000.00"))
        with self.assertRaises(BusinessError):
            sales.transfer_booking(booking=self.b1, to_customer=self.customers[3], date=TODAY, user=self.owner)
