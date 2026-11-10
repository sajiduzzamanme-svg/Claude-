"""Seed the chart of accounts and standard cost heads."""
from django.db import migrations

ACCOUNTS = [
    # code, name, bangla, type, cash/bank, control, system key
    ("1000", "Cash in Hand", "হাতে নগদ", "ASSET", True, False, "CASH"),
    ("1010", "Bank Account", "ব্যাংক হিসাব", "ASSET", True, False, "BANK"),
    ("1020", "Mobile Banking (bKash/Nagad)", "মোবাইল ব্যাংকিং", "ASSET", True, False, "MOBILE"),
    ("1100", "Receivable from Flat Owners", "ফ্ল্যাট মালিকদের কাছে পাওনা", "ASSET", False, True, "AR"),
    ("1200", "Land Advance (Bayna)", "জমির বায়না অগ্রিম", "ASSET", False, True, "LAND_ADVANCE"),
    ("1300", "Project WIP - Land", "চলমান প্রকল্প - জমি", "ASSET", False, True, "WIP_LAND"),
    ("1310", "Project WIP - Development", "চলমান প্রকল্প - নির্মাণ", "ASSET", False, True, "WIP_DEV"),
    ("2000", "Payable to Vendors", "সরবরাহকারী ও ঠিকাদারের দেনা", "LIABILITY", False, True, "AP"),
    ("2010", "Retention Payable", "জামানত দেনা", "LIABILITY", False, True, "RETENTION"),
    ("2020", "Payable to Landowners", "জমির মালিকের দেনা", "LIABILITY", False, True, "LAND_PAYABLE"),
    ("2100", "Customer Advances", "ক্রেতার অগ্রিম", "LIABILITY", False, True, "CUSTOMER_ADVANCE"),
    ("2110", "Refund Payable", "ফেরতযোগ্য টাকা", "LIABILITY", False, True, "REFUND_PAYABLE"),
    ("2200", "Loans Payable", "ঋণ", "LIABILITY", False, False, "LOAN"),
    ("3000", "Owner's Capital", "মালিকের মূলধন", "EQUITY", False, False, "CAPITAL"),
    ("3100", "Owner's Drawings", "মালিকের উত্তোলন", "EQUITY", False, False, "DRAWINGS"),
    ("4000", "Sales Revenue - Flats", "ফ্ল্যাট বিক্রয় আয়", "INCOME", False, True, "REVENUE"),
    ("4100", "Cancellation Deduction Income", "বাতিল কর্তন আয়", "INCOME", False, True, "FORFEIT_INCOME"),
    ("4200", "Transfer Fee Income", "নাম পরিবর্তন ফি আয়", "INCOME", False, True, "TRANSFER_FEE"),
    ("4900", "Other Income", "অন্যান্য আয়", "INCOME", False, False, "OTHER_INCOME"),
    ("5000", "Cost of Sales - Land", "বিক্রয় ব্যয় - জমি", "EXPENSE", False, True, "COGS_LAND"),
    ("5010", "Cost of Sales - Development", "বিক্রয় ব্যয় - নির্মাণ", "EXPENSE", False, True, "COGS_DEV"),
    ("6000", "Office & Admin Expense", "অফিস ও প্রশাসনিক ব্যয়", "EXPENSE", False, True, "OVERHEAD"),
    ("6010", "Sales & Marketing Expense", "বিক্রয় ও বিপণন ব্যয়", "EXPENSE", False, True, "MARKETING"),
    ("6020", "Bank Charges", "ব্যাংক চার্জ", "EXPENSE", False, False, "BANK_CHARGES"),
    ("6900", "Other Expense", "অন্যান্য ব্যয়", "EXPENSE", False, False, "OTHER_EXPENSE"),
]

COST_HEADS = [
    # code, name, bangla, category, system key
    ("L01", "Land purchase price", "জমির ক্রয়মূল্য", "LAND", "LAND_PRICE"),
    ("L02", "Registration & stamp duty", "রেজিস্ট্রি ও স্ট্যাম্প", "LAND", None),
    ("L03", "Mutation & land tax", "নামজারি ও খাজনা", "LAND", None),
    ("L04", "Land broker commission", "জমির দালাল কমিশন", "LAND", None),
    ("D01", "Architect & structural design", "আর্কিটেক্ট ও স্ট্রাকচারাল ডিজাইন", "DESIGN", None),
    ("D02", "3D render & animation", "থ্রিডি ও অ্যানিমেশন", "DESIGN", None),
    ("D03", "Plan approval fees", "নকশা অনুমোদন ফি", "DESIGN", None),
    ("D04", "Soil test & survey", "সয়েল টেস্ট ও সার্ভে", "DESIGN", None),
    ("C01", "Piling & foundation", "পাইলিং ও ফাউন্ডেশন", "CONSTRUCTION", None),
    ("C02", "Structure (RCC)", "স্ট্রাকচার (আরসিসি)", "CONSTRUCTION", None),
    ("C03", "Brickwork & plaster", "গাঁথুনি ও প্লাস্টার", "CONSTRUCTION", None),
    ("C04", "Electrical works", "ইলেকট্রিক্যাল কাজ", "CONSTRUCTION", None),
    ("C05", "Plumbing & sanitary", "প্লাম্বিং ও স্যানিটারি", "CONSTRUCTION", None),
    ("C06", "Tiles & finishing", "টাইলস ও ফিনিশিং", "CONSTRUCTION", None),
    ("C07", "Doors, windows & grill", "দরজা, জানালা ও গ্রিল", "CONSTRUCTION", None),
    ("C08", "Lift, generator & substation", "লিফট, জেনারেটর ও সাবস্টেশন", "CONSTRUCTION", None),
    ("C09", "Paint", "রং", "CONSTRUCTION", None),
    ("C10", "Site labour", "সাইট লেবার", "CONSTRUCTION", None),
    ("C11", "Utility connections", "ইউটিলিটি সংযোগ", "CONSTRUCTION", None),
    ("M01", "Advertising & promotion", "বিজ্ঞাপন ও প্রচার", "MARKETING", None),
    ("M02", "Sales commission", "বিক্রয় কমিশন", "MARKETING", None),
    ("O01", "Office rent & utilities", "অফিস ভাড়া ও ইউটিলিটি", "OVERHEAD", None),
    ("O02", "Salaries", "বেতন", "OVERHEAD", None),
    ("O03", "Miscellaneous office cost", "বিবিধ অফিস খরচ", "OVERHEAD", None),
    ("X01", "Contingency", "কন্টিনজেন্সি", "CONTINGENCY", None),
]


def seed(apps, schema_editor):
    Account = apps.get_model("accounts", "Account")
    CostHead = apps.get_model("accounts", "CostHead")
    for code, name, bn, typ, cash, control, key in ACCOUNTS:
        Account.objects.update_or_create(
            code=code,
            defaults=dict(name=name, name_bn=bn, type=typ, is_cash_bank=cash, is_control=control, system_key=key),
        )
    for code, name, bn, cat, key in COST_HEADS:
        CostHead.objects.update_or_create(code=code, defaults=dict(name=name, name_bn=bn, category=cat, system_key=key))


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
