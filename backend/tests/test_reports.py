"""Management figures checked against numbers worked out by hand."""
from datetime import timedelta
from decimal import Decimal

from django.core.management import call_command

from construction import services as build
from land import services as land
from projects import services as proj
from reports import services as reports
from reports.integrity import run_checks
from sales import services as sales

from .base import TODAY, SpaceUpTestCase, lakh

D = Decimal


class ProfitTests(SpaceUpTestCase):
    """Four 1,000 sqft flats at 31 lakh (10 land + 20 build + 1 other).

    Estimate: land 30 lakh, building 60 lakh. Two flats sold at list price.
    """

    def setUp(self):
        self.build()
        est = proj.save_estimate(project=self.project, title="Budget", user=self.owner, lines=[
            dict(cost_head=self.head["L01"], amount=lakh(30)),
            dict(cost_head=self.head["C02"], amount=lakh(60)),
        ])
        proj.approve_estimate(est, self.owner)
        parcel = self.parcel(lakh(30))
        land.record_land_payment(parcel=parcel, date=TODAY, amount=lakh(30), paid_from=self.bank, user=self.owner)
        land.register_parcel(parcel=parcel, date=TODAY, deed_no="D1", user=self.owner)
        self.b1 = self.book("1A")
        self.b2 = self.book("2A", customer=self.customers[1])
        for b in (self.b1, self.b2):
            sales.record_receipt(booking=b, date=TODAY, amount=lakh(3.1), deposit_account=self.bank, user=self.accountant)

    def fin(self):
        return reports.project_financials(self.project, as_of=TODAY)

    def test_profit_by_source_matches_hand_calculation(self):
        f = self.fin()
        self.assertEqual(f["flats"]["sold"], 2)
        self.assertEqual(D(f["sales"]["sold_value"]), lakh(62))
        self.assertEqual(D(f["sales"]["sold_land_value"]), lakh(20))
        self.assertEqual(D(f["sales"]["sold_building_value"]), lakh(42))
        self.assertEqual(D(f["sales"]["collected"]), lakh(6.2))
        self.assertEqual(D(f["sales"]["receivable"]), lakh(55.8))
        # half the building is sold, so half of each cost is matched against the sales
        self.assertEqual(D(f["profit"]["land"]), lakh(5))        # 20 − 30/2
        self.assertEqual(D(f["profit"]["building"]), lakh(12))   # 42 − 60/2
        self.assertEqual(D(f["profit"]["booked"]), lakh(17))
        self.assertEqual(D(f["profit"]["realised"]), lakh(1.7))  # 10% collected → 10% of profit realised
        self.assertEqual(D(f["profit"]["projected"]), lakh(34))  # 4 × 31 − 90
        self.assertEqual(D(f["flats"]["unsold_value"]), lakh(62))

    def test_cost_overrun_eats_profit_immediately(self):
        build.record_expense(project=self.project, cost_head=self.head["C02"], date=TODAY, amount=lakh(70),
                             paid_from=self.bank, description="Structure", user=self.accountant)
        f = self.fin()
        self.assertEqual(D(f["cost"]["actual_building"]), lakh(70))
        self.assertEqual(D(f["cost"]["building_basis"]), lakh(70))  # actual is above the 60 lakh estimate
        self.assertEqual(D(f["profit"]["building"]), lakh(7))       # 42 − 70/2
        self.assertEqual(D(f["cost"]["overrun"]), lakh(10))
        eva = reports.estimate_vs_actual(self.project)
        row = next(r for r in eva["rows"] if r["code"] == "C02")
        self.assertTrue(row["over_budget"])
        self.assertEqual(D(row["variance"]), lakh(-10))

    def test_discount_is_shared_between_land_and_building(self):
        land_part, building_part = reports.sale_split(lakh(10), lakh(20), lakh(1), lakh(3.1), lakh(27.9), D("0"))
        self.assertEqual(land_part, lakh(9))          # 10% off the land part
        self.assertEqual(building_part, lakh(18.9))
        self.assertEqual(land_part + building_part, lakh(27.9))

    def test_unregistered_land_still_counts_as_committed_cost(self):
        extra = self.parcel(lakh(12))
        land.record_land_payment(parcel=extra, date=TODAY, amount=lakh(2), paid_from=self.bank, user=self.owner)
        f = self.fin()
        self.assertEqual(D(f["cost"]["actual_land"]), lakh(30))
        self.assertEqual(D(f["cost"]["land_committed"]), lakh(42))
        self.assertEqual(D(f["land"]["bayna_remaining"]), lakh(10))
        self.assertEqual(D(f["profit"]["land"]), lakh(20) - lakh(21))  # the bayna land already weighs on profit

    def test_receivables_aging_buckets(self):
        r = reports.receivables(as_of=TODAY + timedelta(days=45))
        # Each buyer paid 3.1 lakh: 1 lakh booking money + 2.1 lakh of the first 3-lakh installment.
        # That installment fell due a month after booking, so 0.9 lakh per buyer is 15 days overdue.
        self.assertEqual(D(r["buckets"]["d1_30"]), lakh(1.8))
        self.assertEqual(D(r["total"]), lakh(55.8))          # 62 sold − 6.2 collected
        self.assertEqual(D(r["buckets"]["not_due"]), lakh(54))
        self.assertEqual(D(r["overdue"]), lakh(1.8))
        self.assertEqual(r["rows"][0]["max_days_overdue"], 15)

    def test_cashflow_forecast_counts_every_unpaid_taka_once(self):
        cf = reports.cashflow_forecast(months=12, as_of=TODAY)
        inflow = sum(D(m["inflow"]) for m in cf["months"]) + D(cf["beyond"]["inflow"])
        self.assertEqual(inflow, lakh(55.8))
        self.assertEqual(D(cf["opening_cash"]), lakh(1000) - lakh(30) + lakh(6.2))


class SeedIntegrityTests(SpaceUpTestCase):
    def test_demo_company_passes_every_integrity_check(self):
        call_command("seed_demo", verbosity=0)
        result = run_checks()
        self.assertTrue(result["ok"], [c for c in result["checks"] if not c["ok"]])
        self.assertGreaterEqual(len(result["checks"]), 15)
        dash = reports.dashboard()
        self.assertEqual(len(dash["projects"]), 2)
        tb_debit = sum(D(p["sales"]["collected"]) for p in dash["projects"])
        self.assertGreater(tb_debit, 0)

    def test_integrity_check_notices_tampering(self):
        self.build()
        b = self.book("1A")
        sales.record_receipt(booking=b, date=TODAY, amount=lakh(2), deposit_account=self.bank, user=self.accountant)
        self.assertTrue(run_checks()["ok"])
        inst = b.installments.order_by("sequence").first()
        type(inst).objects.filter(pk=inst.pk).update(paid_amount=0)  # someone edits the sub-ledger directly
        failed = {c["key"] for c in run_checks()["checks"] if not c["ok"]}
        self.assertIn("installments", failed)
        self.assertIn("customer_advance", failed)
