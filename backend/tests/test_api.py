"""The HTTP surface: sign-in, role rules, and that business errors come back as clean 400s."""
from decimal import Decimal

from rest_framework.test import APIClient

from accounts.models import JournalEntry
from sales import services as sales

from .base import TODAY, SpaceUpTestCase, lakh

D = Decimal


class ApiTests(SpaceUpTestCase):
    def setUp(self):
        self.build()
        self.api = APIClient()

    def login(self, username):
        res = self.api.post("/api/auth/login/", {"username": username, "password": "pass12345"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def test_nothing_is_readable_without_signing_in(self):
        for url in ("/api/dashboard/", "/api/bookings/", "/api/accounts/", "/api/reports/profit/"):
            self.assertEqual(self.api.get(url).status_code, 401, url)

    def test_booking_and_receipt_through_the_api(self):
        self.login("seller")
        flat = self.flat("1A")
        preview = self.api.post("/api/bookings/preview-schedule/", {
            "total": "3100000.00", "booking_date": str(TODAY), "booking_money": "100000", "installment_count": 10,
        }, format="json")
        self.assertEqual(preview.status_code, 200, preview.content)
        res = self.api.post("/api/bookings/", {
            "flat": flat.id, "customer": self.customers[0].id, "booking_date": str(TODAY), "schedule": preview.data,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        booking_id = res.data["id"]
        self.assertEqual(res.data["outstanding"], "3100000.00")

        # a sales person may not take money
        pay = {"date": str(TODAY), "amount": "250000", "deposit_account": self.bank.id, "method": "BANK"}
        self.assertEqual(self.api.post(f"/api/bookings/{booking_id}/receive/", pay, format="json").status_code, 403)

        self.login("acc")
        res = self.api.post(f"/api/bookings/{booking_id}/receive/", pay, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["paid"], "250000.00")
        self.assertEqual(res.data["installments"][1]["paid_amount"], "150000.00")

        # over-collection is a clean 400 and leaves no trace
        before = JournalEntry.objects.count()
        res = self.api.post(f"/api/bookings/{booking_id}/receive/", {**pay, "amount": "99999999"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "over_collection")
        self.assertEqual(JournalEntry.objects.count(), before)

        receipt_id = self.api.get(f"/api/receipts/?booking={booking_id}").data["results"][0]["id"]
        res = self.api.post(f"/api/receipts/{receipt_id}/void/", {"reason": "Cheque bounced"}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.data["status"], "VOIDED")

    def test_urls_work_with_or_without_trailing_slash(self):
        self.login("acc")
        for url in ("/api/flats", "/api/flats/", "/api/dashboard", "/api/dashboard/", "/api/accounts/cash", "/api/reports/profit"):
            self.assertEqual(self.api.get(url).status_code, 200, url)
        booking = self.book("1A")
        pay = {"date": str(TODAY), "amount": "1000", "deposit_account": self.bank.id}
        self.assertEqual(self.api.post(f"/api/bookings/{booking.id}/receive", pay, format="json").status_code, 201)

    def test_roles_are_enforced(self):
        self.login("seller")
        self.assertEqual(self.api.get("/api/accounts/").status_code, 403)
        self.assertEqual(self.api.get("/api/reports/profit/").status_code, 403)
        self.assertEqual(self.api.get("/api/land-parcels/").status_code, 403)
        self.assertEqual(self.api.post("/api/expenses/", {}, format="json").status_code, 403)
        self.assertEqual(self.api.post("/api/projects/", {"code": "X", "name": "X"}, format="json").status_code, 403)
        dash = self.api.get("/api/dashboard/")
        self.assertEqual(dash.status_code, 200)
        self.assertTrue(dash.data["restricted"])
        self.assertNotIn("profit", dash.data["projects"][0])
        self.assertNotIn("cash", dash.data["totals"])

        self.login("eng")
        self.assertEqual(self.api.get("/api/vendors/").status_code, 200)
        self.assertEqual(self.api.get("/api/bookings/").status_code, 403)

        self.login("acc")
        self.assertEqual(self.api.get("/api/accounts/").status_code, 200)
        self.assertEqual(self.api.get("/api/dashboard/").data["restricted"], False)
        self.assertEqual(self.api.post("/api/users/", {"username": "x", "password": "abcdef12"}, format="json").status_code, 403)

    def test_manual_journal_cannot_touch_control_accounts(self):
        self.login("acc")
        from accounts.services import acct
        body = {"date": str(TODAY), "memo": "Fix advances", "lines": [
            {"account": self.bank.id, "debit": "1000"}, {"account": acct("CUSTOMER_ADVANCE").id, "credit": "1000"},
        ]}
        res = self.api.post("/api/journal/", body, format="json")
        self.assertEqual(res.status_code, 400, res.content)
        body["lines"][1]["account"] = acct("LOAN").id
        res = self.api.post("/api/journal/", body, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        entry_id = res.data["id"]
        self.assertEqual(self.api.post(f"/api/journal/{entry_id}/reverse/", {"reason": "mistake"}, format="json").status_code, 201)
        self.assertEqual(self.api.post(f"/api/journal/{entry_id}/reverse/", {"reason": "again"}, format="json").status_code, 400)
        tb = self.api.get("/api/reports/trial-balance/").data
        self.assertTrue(tb["balanced"])
        self.assertEqual(tb["total_debit"], tb["total_credit"])


class SeededApiTests(SpaceUpTestCase):
    def setUp(self):
        self.api = APIClient()

    def test_reports_and_lists_respond_for_the_owner(self):
        from django.core.management import call_command
        call_command("seed_demo", verbosity=0)
        res = self.api.post("/api/auth/login/", {"username": "owner", "password": "spaceup123"}, format="json")
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        from accounts.services import acct
        from projects.models import Project
        from sales.models import Booking, Customer
        pid = Project.objects.order_by("id").first().id
        bid = Booking.objects.order_by("id").first().id
        cid = Customer.objects.order_by("id").first().id
        urls = [
            "/api/auth/me/", "/api/staff/", "/api/dashboard/", "/api/projects/", f"/api/flats/?project={pid}",
            f"/api/documents/?project={pid}", f"/api/estimates/?project={pid}", f"/api/milestones/?project={pid}",
            f"/api/projects/{pid}/summary/", f"/api/projects/{pid}/estimate-vs-actual/", "/api/land-parcels/",
            "/api/land-payments/", "/api/customers/", f"/api/customers/{cid}/", "/api/leads/", "/api/bookings/",
            f"/api/bookings/{bid}/", "/api/receipts/", "/api/price-revisions/", "/api/cancellations/", "/api/vendors/",
            "/api/work-packages/", "/api/purchase-orders/", "/api/vendor-bills/", "/api/vendor-payments/",
            "/api/expenses/", "/api/accounts/", "/api/accounts/cash/", "/api/cost-heads/", "/api/journal/",
            "/api/reports/receivables/", "/api/reports/cashflow/?months=6", "/api/reports/profit/",
            "/api/reports/integrity/", "/api/reports/trial-balance/", f"/api/reports/ledger/?account={acct('BANK').id}",
            "/api/users/", "/api/audit-log/",
        ]
        for url in urls:
            res = self.api.get(url)
            self.assertEqual(res.status_code, 200, f"{url}: {res.content[:300]}")
        self.assertTrue(self.api.get("/api/reports/integrity/").data["ok"])
