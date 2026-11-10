from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase

from accounts.models import Account, CostHead
from accounts.services import K, acct, balance, cr, dr, post_journal
from construction.models import Vendor
from core.models import Role, User
from land.models import LandParcel
from projects import services as proj
from projects.models import Flat, Project, ProjectDocument
from sales import services as sales
from sales.models import Customer

D = Decimal
TODAY = date(2026, 6, 15)


def lakh(n):
    return D(str(n)) * 100000


class Scenario:
    """Builds a small, hand-checkable company: one project with four 1,000 sqft flats."""

    def build(self, flats=4, capital=lakh(1000), open_sales=True):
        self.owner = User.objects.create_user("owner", password="pass12345", role=Role.OWNER)
        self.accountant = User.objects.create_user("acc", password="pass12345", role=Role.ACCOUNTS)
        self.seller = User.objects.create_user("seller", password="pass12345", role=Role.SALES)
        self.engineer = User.objects.create_user("eng", password="pass12345", role=Role.ENGINEER)
        self.cash, self.bank = acct(K.CASH), acct(K.BANK)
        self.head = {h.code: h for h in CostHead.objects.all()}
        if capital:
            post_journal(date=TODAY - timedelta(days=400), memo="Capital", user=self.owner,
                         lines=[dr(self.bank, capital), cr(K.CAPITAL, capital)])
        self.project = Project.objects.create(code="T-01", name="Test Tower", storeys=flats, created_by=self.owner)
        proj.add_default_documents(self.project)
        for floor in range(1, flats + 1):
            Flat.objects.create(
                project=self.project, code=f"{floor}A", floor=floor, unit="A", size_sqft=D("1000"),
                land_price=lakh(10), construction_price=lakh(20), other_charges=lakh(1),
            )
        if open_sales:
            self.project.documents.update(status=ProjectDocument.Status.RECEIVED)
            proj.open_sales(self.project, self.owner)
            self.project.refresh_from_db()
        self.customers = [Customer.objects.create(name=f"Customer {i}", phone=f"0170000000{i}") for i in range(1, 6)]
        self.vendor = Vendor.objects.create(name="Steel House", kind=Vendor.Kind.SUPPLIER)
        self.contractor = Vendor.objects.create(name="Build Co", kind=Vendor.Kind.CONTRACTOR)
        return self

    def flat(self, code):
        return Flat.objects.get(project=self.project, code=code)

    def parcel(self, price=lakh(30), **kw):
        return LandParcel.objects.create(
            project=self.project, title="Plot 1", area_katha=D("4"), owner_name="Land Owner", agreed_price=price, **kw
        )

    def book(self, code="1A", customer=None, discount=0, booking_date=TODAY, booking_money=lakh(1),
             installments=10, **kw):
        flat = self.flat(code)
        total = flat.list_price - D(str(discount))
        schedule = sales.build_schedule(
            total=total, booking_date=booking_date, booking_money=booking_money, installment_count=installments,
            first_installment_date=sales.add_months(booking_date, 1),
        )
        return sales.create_booking(
            flat=flat, customer=customer or self.customers[0], booking_date=booking_date, schedule=schedule,
            discount=discount, user=self.seller, **kw,
        )


class SpaceUpTestCase(TestCase, Scenario):
    def bal(self, key, **filters):
        return balance(key, **filters)
