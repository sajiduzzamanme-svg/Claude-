"""Create a realistic demo company through the same service layer the app uses.

Usage:  python manage.py seed_demo            (refuses if data already exists)
        python manage.py seed_demo --reset    (wipes business data first)
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import Account, CostHead
from accounts.services import K, acct, cr, dr, post_journal
from construction import services as build
from construction.models import Vendor, WorkPackage
from core.models import Role, User
from land import services as land
from land.models import LandParcel
from projects import services as proj
from projects.models import Flat, Milestone, Project, ProjectDocument
from reports.integrity import run_checks
from sales import services as sales
from sales.models import Booking, Customer, Lead

BUSINESS_TABLES = [
    "sales_refundpayment", "sales_cancellation", "sales_bookingtransfer", "sales_pricerevisionline",
    "sales_pricerevision", "sales_receiptallocation", "sales_receipt", "sales_installment", "sales_booking",
    "sales_lead", "sales_customer", "construction_expense", "construction_vendorpayment",
    "construction_vendorbillline", "construction_vendorbill", "construction_purchaseorderline",
    "construction_purchaseorder", "construction_workpackage", "construction_vendor", "land_landpayment",
    "land_landparcel", "projects_milestone", "projects_estimateline", "projects_estimate",
    "projects_projectdocument", "projects_flat", "accounts_journalline", "accounts_journalentry",
    "projects_project", "core_auditlog", "core_sequence",
]


def L(x):  # lakh
    return Decimal(x) * 100000


class Command(BaseCommand):
    help = "Load demo data for Space Up ERP"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing business data first")

    def handle(self, *args, **opts):
        if Project.objects.exists():
            if not opts["reset"]:
                raise CommandError("Data already exists. Re-run with --reset to wipe and reload.")
            with connection.cursor() as cur:
                cur.execute("TRUNCATE " + ", ".join(BUSINESS_TABLES) + " RESTART IDENTITY CASCADE")
            self.stdout.write("Existing business data removed.")
        with transaction.atomic():
            self.seed()
        result = run_checks()
        failed = [c["title"] for c in result["checks"] if not c["ok"]]
        if failed:
            raise CommandError("Integrity checks failed after seeding: " + "; ".join(failed))
        self.stdout.write(self.style.SUCCESS("Demo data loaded. All integrity checks pass."))
        self.stdout.write("Sign in with  owner / spaceup123  (also: accounts, sales, engineer, purchase)")

    # ------------------------------------------------------------------
    def user(self, username, first, last, role, designation):
        u, _ = User.objects.get_or_create(username=username, defaults=dict(
            first_name=first, last_name=last, role=role, designation=designation, is_staff=role in (Role.OWNER, Role.ADMIN),
            is_superuser=role == Role.OWNER, email=f"{username}@spaceup.example",
        ))
        u.set_password("spaceup123")
        u.save()
        return u

    def seed(self):
        today = timezone.localdate()
        d = lambda days: today + timedelta(days=days)  # noqa: E731

        owner = self.user("owner", "Rafiq", "Ahmed", Role.OWNER, "Managing Director")
        accounts_u = self.user("accounts", "Nasrin", "Akter", Role.ACCOUNTS, "Accounts Manager")
        sales_u = self.user("sales", "Tanvir", "Hasan", Role.SALES, "Sales Executive")
        sales2 = self.user("sales2", "Mitu", "Rahman", Role.SALES, "Sales Executive")
        self.user("engineer", "Kamal", "Uddin", Role.ENGINEER, "Site Engineer")
        self.user("purchase", "Shahin", "Alam", Role.PURCHASE, "Purchase Officer")

        cash, bank, mobile = acct(K.CASH), acct(K.BANK), acct(K.MOBILE)
        head = {h.code: h for h in CostHead.objects.all()}

        # Opening capital
        post_journal(
            date=d(-420), memo="Owner's capital introduced", user=owner,
            lines=[dr(bank, L(450)), dr(cash, L(20)), cr(K.CAPITAL, L(470))],
        )

        # ============ Project 1: land registered, construction under way ============
        p1 = Project.objects.create(
            code="SU-01", name="Space Up Niketan Heights", location="Bashundhara R/A, Dhaka",
            address="Plot 14, Road 7, Block D, Bashundhara R/A", status=Project.Status.ACTIVE,
            land_area_katha=Decimal("5.000"), storeys=9, start_date=d(-400), expected_handover=d(420),
            description="G+8 residential building, 16 flats, two units per floor.", created_by=owner,
        )
        proj.add_default_documents(p1)
        p1.documents.filter(doc_type__in=["LAND_DEED", "KHATIAN", "APPROVED_PLAN", "DEVELOPER_REG", "MUTATION"]).update(
            status=ProjectDocument.Status.RECEIVED, received_date=d(-380), reference_no="DOC/SU-01"
        )
        for unit, size, landp, conp in (("A", "1450", L(38), L(62)), ("B", "1280", L(34), L(55))):
            proj.generate_flats(
                project=p1, floors_from=1, floors_to=8, units=[unit], size_sqft=Decimal(size), flat_type="3 Bed",
                bedrooms=3, land_price=landp, construction_price=conp, other_charges=L(4),
                land_share_katha=Decimal("0.3125"), facing="South" if unit == "A" else "North",
            )
        parcel1 = LandParcel.objects.create(
            project=p1, title="Bashundhara Block D, Plot 14", mouza="Joar Sahara", khatian_no="1182", dag_no="3391",
            area_katha=Decimal("5.000"), owner_name="Abdul Malek", owner_phone="01711000001", agreed_price=L(400),
            bayna_date=d(-410), bayna_deed_no="B-2211", registration_deadline=d(-330), created_by=owner,
        )
        land.record_land_payment(parcel=parcel1, date=d(-410), amount=L(100), paid_from=bank, user=owner, reference="CHQ 001201")
        land.record_land_payment(parcel=parcel1, date=d(-370), amount=L(150), paid_from=bank, user=owner, reference="CHQ 001209")
        land.register_parcel(parcel=parcel1, date=d(-340), deed_no="D-7781", user=owner)
        land.mark_mutated(parcel=parcel1, date=d(-300), user=owner)
        build.record_expense(project=p1, cost_head=head["L02"], date=d(-340), amount=L(28), paid_from=bank,
                             payee="Sub-registry office", description="Registration fee and stamp duty", user=accounts_u)
        build.record_expense(project=p1, cost_head=head["L04"], date=d(-405), amount=L(4), paid_from=cash,
                             payee="Land broker", description="Broker commission", user=accounts_u)

        est = proj.save_estimate(project=p1, title="Approved budget", user=owner, lines=[
            dict(cost_head=head["L01"], description="5 katha land", amount=L(400)),
            dict(cost_head=head["L02"], amount=L(30)),
            dict(cost_head=head["L03"], amount=L(2)),
            dict(cost_head=head["L04"], amount=L(4)),
            dict(cost_head=head["D01"], amount=L(12)),
            dict(cost_head=head["D02"], amount=L(3)),
            dict(cost_head=head["D03"], amount=L(8)),
            dict(cost_head=head["D04"], amount=L(2)),
            dict(cost_head=head["C01"], description="Piling 60 nos", amount=L(85)),
            dict(cost_head=head["C02"], description="RCC frame, 9 slabs", quantity=22000, unit="sqft", rate=1450),
            dict(cost_head=head["C03"], amount=L(70)),
            dict(cost_head=head["C04"], amount=L(38)),
            dict(cost_head=head["C05"], amount=L(34)),
            dict(cost_head=head["C06"], amount=L(95)),
            dict(cost_head=head["C07"], amount=L(48)),
            dict(cost_head=head["C08"], amount=L(62)),
            dict(cost_head=head["C09"], amount=L(18)),
            dict(cost_head=head["C11"], amount=L(15)),
            dict(cost_head=head["M01"], amount=L(14)),
            dict(cost_head=head["M02"], amount=L(22)),
            dict(cost_head=head["O02"], amount=L(30)),
            dict(cost_head=head["X01"], amount=L(25)),
        ])
        proj.approve_estimate(est, owner)
        proj.open_sales(p1, owner)

        for seq, (name, weight, prog, planned) in enumerate([
            ("Piling & foundation", 12, 100, -300), ("Basement & ground floor", 10, 100, -230),
            ("Structure up to 4th floor", 18, 100, -120), ("Structure up to roof", 18, 55, 40),
            ("Brickwork & plaster", 14, 15, 150), ("Electrical & plumbing", 10, 0, 240),
            ("Tiles, doors & finishing", 12, 0, 330), ("Lift, utility & handover", 6, 0, 410),
        ], start=1):
            Milestone.objects.create(
                project=p1, sequence=seq, name=name, weight=weight, progress=prog, planned_date=d(planned),
                completed_date=d(planned + 6) if prog == 100 else None,
            )

        v_rod = Vendor.objects.create(name="BSRM Steel Dealer - Mirpur", kind=Vendor.Kind.SUPPLIER, phone="01811000011", created_by=owner)
        v_cem = Vendor.objects.create(name="Shah Cement Distributor", kind=Vendor.Kind.SUPPLIER, phone="01811000012", created_by=owner)
        v_pile = Vendor.objects.create(name="Dhaka Piling & Foundation Ltd", kind=Vendor.Kind.CONTRACTOR, phone="01811000013", created_by=owner)
        v_arch = Vendor.objects.create(name="Studio Sthapotto Architects", kind=Vendor.Kind.CONSULTANT, phone="01811000014", created_by=owner)
        v_lab = Vendor.objects.create(name="Jalal Sardar (Labour)", kind=Vendor.Kind.LABOUR, phone="01811000015", created_by=owner)
        v_build = Vendor.objects.create(name="Unique Builders & Engineers", kind=Vendor.Kind.CONTRACTOR, phone="01811000016", created_by=owner)

        wp_pile = WorkPackage.objects.create(
            project=p1, name="Piling works", cost_head=head["C01"], execution="CONTRACTOR", vendor=v_pile, budget=L(85),
            retention_percent=Decimal("5"), start_date=d(-320), end_date=d(-280), progress=100, status="DONE", created_by=owner,
        )
        wp_struct = WorkPackage.objects.create(
            project=p1, name="RCC structure (own team)", cost_head=head["C02"], execution="OWN", budget=L(319),
            start_date=d(-270), end_date=d(60), progress=68, status="IN_PROGRESS", created_by=owner,
        )
        WorkPackage.objects.create(
            project=p1, name="Brickwork & plaster", cost_head=head["C03"], execution="CONTRACTOR", vendor=v_build,
            budget=L(68), retention_percent=Decimal("5"), start_date=d(-20), end_date=d(160), progress=15,
            status="IN_PROGRESS", created_by=owner,
        )

        # ---- sales for project 1 ----
        names = [
            ("Md. Shafiqul Islam", "01712000001"), ("Farhana Yasmin", "01712000002"), ("Dr. Anisur Rahman", "01712000003"),
            ("Engr. Mahbub Alam", "01712000004"), ("Sharmin Sultana", "01712000005"), ("Kazi Imran Hossain", "01712000006"),
            ("Rumana Haque", "01712000007"), ("Golam Mostafa", "01712000008"), ("Nusrat Jahan", "01712000009"),
            ("Abu Sayeed Chowdhury", "01712000010"), ("Tahmina Begum", "01712000011"),
        ]
        customers = [
            Customer.objects.create(name=n, phone=ph, address="Dhaka", nid=f"19{i:02d}5512345{i:02d}", created_by=sales_u)
            for i, (n, ph) in enumerate(names, start=1)
        ]
        flats1 = list(p1.flats.order_by("floor", "unit"))
        plan = [  # flat index, months ago booked, installments, discount (lakh), how far behind on payments (months)
            (0, 12, 24, 0, 0), (1, 12, 24, 1, 0), (2, 11, 24, 0, 1), (3, 10, 30, 0, 0), (4, 9, 24, 2, 3),
            (6, 8, 30, 0, 0), (7, 7, 24, 0, 2), (9, 5, 24, 0, 0), (10, 3, 30, 1, 0), (12, 2, 24, 0, 0),
        ]
        bookings = []
        for i, (fi, months_ago, n_inst, disc, behind) in enumerate(plan):
            flat, cust = flats1[fi], customers[i]
            bdate = sales.add_months(today, -months_ago)
            total = flat.list_price - L(disc)
            schedule = sales.build_schedule(
                total=total, booking_date=bdate, booking_money=L(5), down_payment=L(15),
                down_payment_date=bdate + timedelta(days=30), installment_count=n_inst,
                first_installment_date=sales.add_months(bdate, 2), handover_amount=L(6), round_to=1000,
            )
            b = sales.create_booking(
                flat=flat, customer=cust, booking_date=bdate, schedule=schedule, discount=L(disc),
                sales_person=sales_u if i % 2 == 0 else sales2, user=sales_u,
            )
            bookings.append(b)
            # Collect what has fallen due, except customers who are behind.
            cutoff = sales.add_months(today, -behind) if behind else today
            for inst in b.installments.filter(due_date__lte=cutoff).order_by("sequence"):
                method, account = ("CHEQUE", bank) if inst.amount > L(4) else ("BANK", bank) if inst.sequence % 3 else ("MOBILE", mobile)
                sales.record_receipt(
                    booking=b, date=min(inst.due_date + timedelta(days=inst.sequence % 5), today), amount=inst.amount,
                    deposit_account=account, method=method, reference=f"TXN{b.id:02d}{inst.sequence:03d}", user=accounts_u,
                )
        # one partial payment
        late = bookings[4]
        nxt = late.installments.filter(paid_amount=0).order_by("sequence").first()
        sales.record_receipt(booking=late, date=d(-12), amount=nxt.amount / 2, deposit_account=cash, method="CASH", user=accounts_u)

        # a cancelled booking with refund partly paid
        cust_c = customers[10]
        flat_c = flats1[14]
        bdate = sales.add_months(today, -6)
        sched = sales.build_schedule(total=flat_c.list_price, booking_date=bdate, booking_money=L(5), down_payment=L(15),
                                     installment_count=24, first_installment_date=sales.add_months(bdate, 2), round_to=1000)
        bc = sales.create_booking(flat=flat_c, customer=cust_c, booking_date=bdate, schedule=sched, user=sales_u, sales_person=sales2)
        sales.record_receipt(booking=bc, date=bdate, amount=L(5), deposit_account=bank, method="BANK", user=accounts_u)
        sales.record_receipt(booking=bc, date=bdate + timedelta(days=20), amount=L(15), deposit_account=bank, method="CHEQUE", user=accounts_u)
        cancel = sales.cancel_booking(booking=bc, date=d(-60), reason="Customer moved abroad", deduction=L(2), user=owner)
        sales.pay_refund(cancellation=cancel, date=d(-45), amount=L(10), paid_from=bank, reference="CHQ 001288", user=accounts_u)

        # ---- costs for project 1 ----
        b = build.create_bill(project=p1, vendor=v_arch, bill_date=d(-390), kind="SERVICE", reference="INV-118", user=accounts_u, lines=[
            dict(cost_head=head["D01"], description="Architectural & structural design", amount=L(11)),
            dict(cost_head=head["D02"], description="3D render and walkthrough animation", amount=L(3)),
        ])
        build.pay_bill(bill=b, date=d(-380), amount=L(14), paid_from=bank, user=accounts_u)
        build.record_expense(project=p1, cost_head=head["D03"], date=d(-360), amount=L(7.5), paid_from=bank, payee="RAJUK",
                             description="Plan approval fees", user=accounts_u)
        build.record_expense(project=p1, cost_head=head["D04"], date=d(-395), amount=L(1.8), paid_from=cash, payee="Geo Tech BD",
                             description="Soil test, 4 boreholes", user=accounts_u)

        for amount, day in ((L(40), -310), (L(42), -285)):
            b = build.create_bill(project=p1, vendor=v_pile, bill_date=d(day), kind="CONTRACTOR", work_package=wp_pile,
                                  reference=f"RB-{abs(day)}", user=accounts_u,
                                  lines=[dict(cost_head=head["C01"], description="Piling running bill", amount=amount)])
            build.pay_bill(bill=b, date=d(day + 10), amount=b.net_payable, paid_from=bank, user=accounts_u)

        for month in range(8, 0, -1):
            day = -30 * month
            po = build.create_purchase_order(project=p1, vendor=v_rod, date=d(day - 5), work_package=wp_struct, user=owner, lines=[
                dict(cost_head=head["C02"], item="MS rod 60 grade", unit="ton", quantity=Decimal("12"), rate=Decimal("92000")),
            ])
            build.approve_purchase_order(po, owner)
            bill = build.receive_purchase_order(po, date=d(day), reference=f"CH-{1000 + month}", due_date=d(day + 30), user=accounts_u)
            if month > 1:
                build.pay_bill(bill=bill, date=d(day + 25), amount=bill.net_payable, paid_from=bank, user=accounts_u)
            bill = build.create_bill(project=p1, vendor=v_cem, bill_date=d(day + 3), due_date=d(day + 33), work_package=wp_struct,
                                     reference=f"SC-{2000 + month}", user=accounts_u, lines=[
                dict(cost_head=head["C02"], description="Cement", unit="bag", quantity=Decimal("900"), rate=Decimal("540")),
                dict(cost_head=head["C02"], description="Stone chips & sand", amount=L(4.2)),
            ])
            if month > 2:
                build.pay_bill(bill=bill, date=d(day + 28), amount=bill.net_payable, paid_from=bank, user=accounts_u)
            elif month == 2:
                build.pay_bill(bill=bill, date=d(day + 28), amount=L(4), paid_from=bank, user=accounts_u)
            build.record_expense(project=p1, cost_head=head["C10"], date=d(day + 15), amount=L(6.5), paid_from=cash,
                                 payee=v_lab.name, description="Site labour weekly wages", user=accounts_u)
            post_journal(date=d(day + 14), memo="Cash withdrawn from bank for site", user=accounts_u,
                         lines=[dr(cash, L(7)), cr(bank, L(7))])
            build.record_expense(project=p1, cost_head=head["O02"], date=d(day + 28), amount=L(1.6), paid_from=bank,
                                 payee="Staff", description="Project staff salaries", user=accounts_u)
        build.record_expense(project=p1, cost_head=head["M01"], date=d(-200), amount=L(6), paid_from=bank,
                             payee="Prothom Alo / Facebook", description="Launch campaign", user=accounts_u)
        build.record_expense(project=None, cost_head=head["O01"], date=d(-25), amount=L(1.2), paid_from=bank,
                             payee="Landlord", description="Head office rent", user=accounts_u)

        # ============ Project 2: land only under bayna, selling has begun ============
        p2 = Project.objects.create(
            code="SU-02", name="Space Up Lake View", location="Uttara Sector 15, Dhaka", address="Plot 22, Road 3, Sector 15, Uttara",
            status=Project.Status.PLANNING, land_area_katha=Decimal("4.000"), storeys=8, start_date=d(-70),
            expected_handover=d(900), description="G+7 lake-facing building, 14 flats.", created_by=owner,
        )
        proj.add_default_documents(p2)
        p2.documents.filter(doc_type__in=["LAND_DEED", "KHATIAN", "APPROVED_PLAN", "DEVELOPER_REG"]).update(
            status=ProjectDocument.Status.RECEIVED, received_date=d(-50), reference_no="DOC/SU-02"
        )
        for unit, size, landp, conp in (("A", "1320", L(42), L(50)), ("B", "1180", L(38), L(45))):
            proj.generate_flats(project=p2, floors_from=1, floors_to=7, units=[unit], size_sqft=Decimal(size), flat_type="3 Bed",
                                bedrooms=3, land_price=landp, construction_price=conp, other_charges=L(4),
                                land_share_katha=Decimal("0.2857"), facing="Lake" if unit == "A" else "East")
        parcel2 = LandParcel.objects.create(
            project=p2, title="Uttara Sector 15, Plot 22", mouza="Dia Bari", khatian_no="558", dag_no="2104",
            area_katha=Decimal("4.000"), owner_name="Hajera Khatun & heirs", owner_phone="01711000002",
            agreed_price=L(380), bayna_date=d(-65), bayna_deed_no="B-3140", registration_deadline=d(75), created_by=owner,
        )
        land.record_land_payment(parcel=parcel2, date=d(-65), amount=L(80), paid_from=bank, user=owner, reference="CHQ 001301")
        est2 = proj.save_estimate(project=p2, title="Feasibility estimate", user=owner, lines=[
            dict(cost_head=head["L01"], amount=L(380)), dict(cost_head=head["L02"], amount=L(28)),
            dict(cost_head=head["D01"], amount=L(11)), dict(cost_head=head["D02"], amount=L(3)),
            dict(cost_head=head["D03"], amount=L(7)), dict(cost_head=head["C01"], amount=L(70)),
            dict(cost_head=head["C02"], amount=L(270)), dict(cost_head=head["C03"], amount=L(60)),
            dict(cost_head=head["C06"], amount=L(120)), dict(cost_head=head["C08"], amount=L(55)),
            dict(cost_head=head["M01"], amount=L(12)), dict(cost_head=head["X01"], amount=L(20)),
        ])
        proj.approve_estimate(est2, owner)
        proj.open_sales(p2, owner)
        for seq, (name, weight) in enumerate([("Design & approval", 8), ("Piling", 14), ("Structure", 36), ("Finishing", 32), ("Handover", 10)], 1):
            Milestone.objects.create(project=p2, sequence=seq, name=name, weight=weight, progress=60 if seq == 1 else 0, planned_date=d(120 * seq))
        b = build.create_bill(project=p2, vendor=v_arch, bill_date=d(-55), kind="SERVICE", reference="INV-140", due_date=d(10), user=accounts_u, lines=[
            dict(cost_head=head["D01"], description="Concept and architectural design", amount=L(6)),
            dict(cost_head=head["D02"], description="3D render and animation", amount=L(3)),
        ])
        build.pay_bill(bill=b, date=d(-40), amount=L(5), paid_from=bank, user=accounts_u)

        more = [("Shahidul Karim", "01713000001"), ("Lubna Mariam", "01713000002"), ("Iqbal Mahmud", "01713000003")]
        flats2 = list(p2.flats.order_by("floor", "unit"))
        for i, (n, ph) in enumerate(more):
            cust = Customer.objects.create(name=n, phone=ph, address="Uttara, Dhaka", created_by=sales_u)
            bdate = d(-40 + i * 9)
            flat = flats2[i * 3]
            sched = sales.build_schedule(total=flat.list_price, booking_date=bdate, booking_money=L(5), down_payment=L(20),
                                         down_payment_date=bdate + timedelta(days=45), installment_count=36,
                                         first_installment_date=sales.add_months(bdate, 3), handover_amount=L(5), round_to=1000)
            bk = sales.create_booking(flat=flat, customer=cust, booking_date=bdate, schedule=sched, user=sales_u, sales_person=sales_u)
            sales.record_receipt(booking=bk, date=bdate, amount=L(5), deposit_account=bank, method="BANK", user=accounts_u)

        # ---- CRM leads ----
        leads = [
            ("Arif Chowdhury", "01714000001", "Facebook", p2, "NEW", 95), ("Sadia Islam", "01714000002", "Referral", p1, "CONTACTED", 90),
            ("Monir Hossain", "01714000003", "Site signboard", p2, "SITE_VISIT", 100), ("Dr. Selina Parvin", "01714000004", "Newspaper", p1, "NEGOTIATION", 92),
            ("Rezaul Karim", "01714000005", "Facebook", p2, "CONTACTED", 85), ("Jannatul Ferdous", "01714000006", "Walk-in", p2, "SITE_VISIT", 98),
            ("Habibur Rahman", "01714000007", "Referral", p1, "LOST", 80), ("Ayesha Siddiqua", "01714000008", "Facebook", p2, "NEW", 88),
        ]
        for i, (n, ph, src, pr, stage, budget) in enumerate(leads):
            Lead.objects.create(name=n, phone=ph, source=src, project=pr, stage=stage, budget=L(budget),
                                assigned_to=sales_u if i % 2 else sales2, next_follow_up=d(i - 2), created_by=sales_u)
