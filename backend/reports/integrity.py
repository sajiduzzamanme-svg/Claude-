"""Self-audit: prove the ledger and the sub-ledgers tell the same story.

Each check compares a control account in the general ledger with the detail
records it is supposed to summarise. Any difference means something bypassed
the service layer and must be investigated.
"""
from django.db.models import Count, F, Q, Sum

from accounts.models import Account, JournalEntry, JournalLine
from accounts.services import K, balance
from construction.models import VendorBill, VendorPayment
from core.money import ZERO
from land.models import LandParcel, LandPayment
from projects.models import Flat
from sales.models import Booking, Cancellation, Installment, Receipt, ReceiptAllocation


def _s(qs, expr):
    return qs.aggregate(t=Sum(expr))["t"] or ZERO


def _check(key, title, title_bn, expected, actual, detail=""):
    return {
        "key": key, "title": title, "title_bn": title_bn, "ok": expected == actual,
        "expected": str(expected), "actual": str(actual), "detail": detail,
    }


def run_checks():
    checks = []
    posted_receipts = Receipt.objects.filter(status=Receipt.Status.POSTED)
    posted_bills = VendorBill.objects.filter(status=VendorBill.Status.POSTED)
    posted_land = LandPayment.objects.filter(status=LandPayment.Status.POSTED)

    totals = JournalLine.objects.aggregate(d=Sum("debit"), c=Sum("credit"))
    checks.append(_check(
        "ledger_balanced", "Total debits equal total credits", "মোট ডেবিট = মোট ক্রেডিট",
        totals["d"] or ZERO, totals["c"] or ZERO,
    ))

    unbalanced = (
        JournalEntry.objects.annotate(d=Sum("lines__debit"), c=Sum("lines__credit")).exclude(d=F("c")).count()
    )
    checks.append(_check("entries_balanced", "Every voucher balances on its own", "প্রতিটি ভাউচার আলাদাভাবে মেলে", 0, unbalanced))

    checks.append(_check(
        "customer_advance", "Customer advances match payments on active bookings",
        "ক্রেতার অগ্রিম = চলমান বুকিংয়ের আদায়",
        _s(Installment.objects.filter(booking__status=Booking.Status.ACTIVE), "paid_amount"),
        balance(K.CUSTOMER_ADVANCE),
    ))
    checks.append(_check(
        "receivable", "Receivable matches dues on handed-over flats", "পাওনা = হস্তান্তরিত ফ্ল্যাটের বকেয়া",
        _s(Installment.objects.filter(booking__status=Booking.Status.HANDED_OVER), F("amount") - F("paid_amount")),
        balance(K.AR),
    ))
    checks.append(_check(
        "revenue", "Sales revenue matches handed-over contracts", "বিক্রয় আয় = হস্তান্তরিত চুক্তির মূল্য",
        _s(Installment.objects.filter(booking__status=Booking.Status.HANDED_OVER), "amount"),
        balance(K.REVENUE),
    ))

    bad_inst = 0
    alloc = dict(
        ReceiptAllocation.objects.filter(receipt__status=Receipt.Status.POSTED)
        .values_list("installment").annotate(t=Sum("amount"))
    )
    for pk, paid in Installment.objects.values_list("id", "paid_amount"):
        if (alloc.get(pk) or ZERO) != paid:
            bad_inst += 1
    checks.append(_check(
        "installments", "Each installment's paid amount matches its receipts", "প্রতিটি কিস্তির আদায় রিসিটের সাথে মেলে", 0, bad_inst,
    ))

    bad_receipts = posted_receipts.annotate(a=Sum("allocations__amount")).exclude(a=F("amount")).count()
    checks.append(_check(
        "receipts_allocated", "Every receipt is fully applied to installments", "প্রতিটি রিসিট সম্পূর্ণ কিস্তিতে বণ্টিত", 0, bad_receipts,
    ))

    bad_sched = (
        Booking.objects.exclude(status=Booking.Status.CANCELLED)
        .annotate(s=Sum("installments__amount")).exclude(s=F("total_price") + F("revision_amount")).count()
    )
    checks.append(_check(
        "schedules", "Every payment schedule adds up to the contract value", "প্রতিটি কিস্তির তালিকা চুক্তিমূল্যের সমান", 0, bad_sched,
    ))

    checks.append(_check(
        "vendor_payable", "Vendor payables match unpaid bills", "সরবরাহকারীর দেনা = অপরিশোধিত বিল",
        _s(posted_bills, F("net_payable") - F("paid_amount")), balance(K.AP),
    ))
    checks.append(_check(
        "retention", "Retention payable matches retention held on bills", "জামানত দেনা = বিলে আটকে রাখা জামানত",
        _s(posted_bills, F("retention_amount") - F("retention_released")), balance(K.RETENTION),
    ))

    bad_bills = 0
    pay = {}
    for bill_id, kind, total in (
        VendorPayment.objects.filter(status=VendorPayment.Status.POSTED).values_list("bill", "kind").annotate(t=Sum("amount"))
    ):
        pay[(bill_id, kind)] = total
    for pk, paid, released in VendorBill.objects.values_list("id", "paid_amount", "retention_released"):
        if (pay.get((pk, "BILL")) or ZERO) != paid or (pay.get((pk, "RETENTION")) or ZERO) != released:
            bad_bills += 1
    checks.append(_check("bills_paid", "Each bill's paid amount matches its payments", "প্রতিটি বিলের পরিশোধ পেমেন্টের সাথে মেলে", 0, bad_bills))

    unregistered = [LandParcel.Stage.NEGOTIATION, LandParcel.Stage.BAYNA]
    checks.append(_check(
        "land_advance", "Land advance matches bayna paid on unregistered land", "জমির অগ্রিম = অনিবন্ধিত জমির বায়না",
        _s(posted_land.filter(parcel__stage__in=unregistered), "amount"), balance(K.LAND_ADVANCE),
    ))
    registered = LandParcel.objects.exclude(stage__in=unregistered)
    checks.append(_check(
        "land_payable", "Landowner payable matches unpaid price of registered land", "জমির মালিকের দেনা = নিবন্ধিত জমির বাকি মূল্য",
        _s(registered, "agreed_price") - _s(posted_land.exclude(parcel__stage__in=unregistered), "amount"),
        balance(K.LAND_PAYABLE),
    ))
    checks.append(_check(
        "refund_payable", "Refund payable matches refunds still owed", "ফেরতযোগ্য টাকা = বাকি রিফান্ড",
        _s(Cancellation.objects.all(), F("refund_amount") - F("refunded_amount")), balance(K.REFUND_PAYABLE),
    ))

    live = Booking.objects.filter(status=Booking.Status.ACTIVE).values_list("flat_id", flat=True)
    handed = Booking.objects.filter(status=Booking.Status.HANDED_OVER).values_list("flat_id", flat=True)
    bad_flats = (
        Flat.objects.filter(status=Flat.Status.BOOKED).exclude(id__in=live).count()
        + Flat.objects.filter(id__in=live).exclude(status=Flat.Status.BOOKED).count()
        + Flat.objects.filter(status=Flat.Status.HANDED_OVER).exclude(id__in=handed).count()
        + Flat.objects.filter(id__in=handed).exclude(status=Flat.Status.HANDED_OVER).count()
    )
    checks.append(_check("flat_status", "Flat status agrees with its booking", "ফ্ল্যাটের অবস্থা বুকিংয়ের সাথে মেলে", 0, bad_flats))

    negative = [a.name for a in Account.objects.filter(is_cash_bank=True) if balance(a) < 0]
    checks.append(_check(
        "cash_non_negative", "No cash or bank account is overdrawn", "কোনো নগদ/ব্যাংক হিসাব ঋণাত্মক নয়", 0, len(negative),
        ", ".join(negative),
    ))
    return {"ok": all(c["ok"] for c in checks), "checks": checks}
