"""Land, vendor bills, payments, purchase orders, expenses."""
from decimal import Decimal

from accounts.models import JournalEntry
from accounts.services import K
from construction import services as build
from construction.models import PurchaseOrder, VendorBill, VendorPayment, WorkPackage
from core.exceptions import BusinessError
from land import services as land
from land.models import LandParcel
from reports.integrity import run_checks

from .base import TODAY, SpaceUpTestCase, lakh

D = Decimal


class LandTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.parcel_ = self.parcel(lakh(30))

    def pay(self, amount):
        return land.record_land_payment(parcel=self.parcel_, date=TODAY, amount=amount, paid_from=self.bank, user=self.owner)

    def test_bayna_is_an_advance_until_registration(self):
        self.pay(lakh(8))
        self.parcel_.refresh_from_db()
        self.assertEqual(self.parcel_.stage, LandParcel.Stage.BAYNA)
        self.assertEqual(self.bal(K.LAND_ADVANCE), lakh(8))
        self.assertEqual(self.bal(K.WIP_LAND), D("0.00"))

        land.register_parcel(parcel=self.parcel_, date=TODAY, deed_no="D-1", user=self.owner)
        self.assertEqual(self.bal(K.LAND_ADVANCE), D("0.00"))
        self.assertEqual(self.bal(K.WIP_LAND), lakh(30))
        self.assertEqual(self.bal(K.LAND_PAYABLE), lakh(22))

        self.pay(lakh(22))
        self.assertEqual(self.bal(K.LAND_PAYABLE), D("0.00"))
        with self.assertRaises(BusinessError):
            self.pay(1)
        with self.assertRaises(BusinessError):
            land.register_parcel(parcel=self.parcel_, date=TODAY, deed_no="D-2", user=self.owner)
        self.assertTrue(run_checks()["ok"])

    def test_cannot_pay_above_the_agreed_price(self):
        self.pay(lakh(29))
        with self.assertRaises(BusinessError):
            self.pay(lakh(1) + 1)

    def test_voiding_a_bayna_payment_after_registration_restores_the_payable(self):
        p = self.pay(lakh(8))
        land.register_parcel(parcel=self.parcel_, date=TODAY, deed_no="D-1", user=self.owner)
        land.void_land_payment(p, reason="Cheque returned", user=self.owner)
        self.assertEqual(self.bal(K.LAND_PAYABLE), lakh(30))
        self.assertEqual(self.bal(K.LAND_ADVANCE), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(1000))
        self.assertTrue(run_checks()["ok"])

    def test_payment_fails_cleanly_when_the_account_is_short(self):
        before = JournalEntry.objects.count()
        with self.assertRaises(BusinessError) as ctx:
            land.record_land_payment(parcel=self.parcel_, date=TODAY, amount=lakh(1), paid_from=self.cash, user=self.owner)
        self.assertEqual(ctx.exception.code, "insufficient_funds")
        self.assertEqual(JournalEntry.objects.count(), before)
        self.assertEqual(self.parcel_.payments.count(), 0)


class BillTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.wp = WorkPackage.objects.create(
            project=self.project, name="Piling", cost_head=self.head["C01"], execution="CONTRACTOR",
            vendor=self.contractor, budget=lakh(10), retention_percent=D("5"),
        )

    def bill(self, amount, **kw):
        return build.create_bill(
            project=self.project, vendor=self.contractor, bill_date=TODAY, kind="CONTRACTOR", work_package=self.wp,
            lines=[dict(cost_head=self.head["C01"], description="Running bill", amount=amount)], user=self.accountant, **kw,
        )

    def test_retention_is_held_back_and_released_separately(self):
        b = self.bill(lakh(4))
        self.assertEqual((b.gross_amount, b.retention_amount, b.net_payable), (lakh(4), D("20000.00"), D("380000.00")))
        self.assertEqual(self.bal(K.WIP_DEV), lakh(4))          # full cost is recognised
        self.assertEqual(self.bal(K.AP), D("380000.00"))
        self.assertEqual(self.bal(K.RETENTION), D("20000.00"))

        build.pay_bill(bill=b, date=TODAY, amount=D("300000"), paid_from=self.bank, user=self.accountant)
        with self.assertRaises(BusinessError) as ctx:
            build.pay_bill(bill=b, date=TODAY, amount=D("80000.01"), paid_from=self.bank, user=self.accountant)
        self.assertEqual(ctx.exception.code, "over_payment")
        build.pay_bill(bill=b, date=TODAY, amount=D("80000"), paid_from=self.bank, user=self.accountant)
        self.assertEqual(self.bal(K.AP), D("0.00"))

        with self.assertRaises(BusinessError):
            build.pay_bill(bill=b, date=TODAY, amount=D("20001"), paid_from=self.bank, kind="RETENTION", user=self.accountant)
        pay = build.pay_bill(bill=b, date=TODAY, amount=D("20000"), paid_from=self.bank, kind="RETENTION", user=self.accountant)
        self.assertEqual(self.bal(K.RETENTION), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(996))

        build.void_vendor_payment(pay, reason="Wrong account", user=self.accountant)
        self.assertEqual(self.bal(K.RETENTION), D("20000.00"))
        self.assertTrue(run_checks()["ok"])

    def test_contractor_cannot_be_billed_above_the_contract(self):
        self.bill(lakh(6))
        with self.assertRaises(BusinessError) as ctx:
            self.bill(lakh(4) + 1)
        self.assertEqual(ctx.exception.code, "over_contract")
        self.bill(lakh(4))

    def test_bill_with_payments_cannot_be_voided(self):
        b = self.bill(lakh(2))
        pay = build.pay_bill(bill=b, date=TODAY, amount=1000, paid_from=self.bank, user=self.accountant)
        with self.assertRaises(BusinessError):
            build.void_bill(b, reason="x", user=self.accountant)
        build.void_vendor_payment(pay, reason="x", user=self.accountant)
        build.void_bill(b, reason="Duplicate entry", user=self.accountant)
        self.assertEqual(self.bal(K.WIP_DEV), D("0.00"))
        self.assertEqual(self.bal(K.AP), D("0.00"))
        self.assertTrue(run_checks()["ok"])

    def test_quantity_times_rate_must_match_amount(self):
        with self.assertRaises(BusinessError):
            build.create_bill(
                project=self.project, vendor=self.vendor, bill_date=TODAY, user=self.accountant,
                lines=[dict(cost_head=self.head["C02"], description="Rod", quantity=D("2"), rate=D("92000"), amount=D("190000"))],
            )

    def test_purchase_order_becomes_a_bill_on_receipt(self):
        po = build.create_purchase_order(project=self.project, vendor=self.vendor, date=TODAY, user=self.engineer, lines=[
            dict(cost_head=self.head["C02"], item="MS rod", unit="ton", quantity=D("2.5"), rate=D("92000")),
            dict(cost_head=self.head["C02"], item="Cement", unit="bag", quantity=D("100"), rate=D("540")),
        ])
        self.assertEqual(po.total, D("284000.00"))
        with self.assertRaises(BusinessError):
            build.receive_purchase_order(po, date=TODAY, user=self.accountant)  # not approved yet
        build.approve_purchase_order(po, self.owner)
        bill = build.receive_purchase_order(po, date=TODAY, user=self.accountant)
        self.assertEqual(bill.gross_amount, D("284000.00"))
        self.assertEqual(self.bal(K.AP), D("284000.00"))
        with self.assertRaises(BusinessError):
            build.cancel_purchase_order(po, self.owner)
        build.void_bill(bill, reason="Goods returned", user=self.accountant)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.APPROVED)
        self.assertEqual(self.bal(K.AP), D("0.00"))


class ExpenseTests(SpaceUpTestCase):
    def setUp(self):
        self.build()

    def spend(self, code, amount, project="default"):
        return build.record_expense(
            project=self.project if project == "default" else project, cost_head=self.head[code], date=TODAY,
            amount=amount, paid_from=self.bank, description="test", user=self.accountant,
        )

    def test_costs_land_in_the_right_accounts(self):
        self.spend("L02", 1000)
        self.spend("C02", 2000)
        self.spend("D01", 300)
        self.spend("M01", 40)
        self.spend("O01", 5, project=None)
        self.assertEqual(self.bal(K.WIP_LAND), D("1000.00"))
        self.assertEqual(self.bal(K.WIP_DEV), D("2300.00"))
        self.assertEqual(self.bal(K.MARKETING), D("40.00"))
        self.assertEqual(self.bal(K.OVERHEAD), D("5.00"))

    def test_project_cost_needs_a_project(self):
        with self.assertRaises(BusinessError):
            self.spend("C02", 2000, project=None)

    def test_void_reverses_cost_and_cash(self):
        e = self.spend("C02", 2000)
        build.void_expense(e, reason="Entered twice", user=self.accountant)
        self.assertEqual(self.bal(K.WIP_DEV), D("0.00"))
        self.assertEqual(self.bal(K.BANK), lakh(1000))
        with self.assertRaises(BusinessError):
            build.void_expense(e, reason="again", user=self.accountant)
