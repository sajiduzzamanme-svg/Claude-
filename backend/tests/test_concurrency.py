"""Two people pressing Save at the same moment must not break the books."""
import threading
from decimal import Decimal

from django.db import connection
from django.test import TransactionTestCase

from accounts.services import K, balance
from core.exceptions import BusinessError
from sales import services as sales
from sales.models import Receipt

from .base import TODAY, Scenario, lakh

D = Decimal


class ConcurrentReceiptTests(TransactionTestCase, Scenario):
    serialized_rollback = True

    def test_simultaneous_receipts_cannot_over_collect(self):
        self.build()
        booking = self.book("1A", booking_money=lakh(31), installments=0)  # one line of 31 lakh
        results = []

        def collect():
            try:
                sales.record_receipt(booking=booking, date=TODAY, amount=lakh(20), deposit_account=self.bank, user=None)
                results.append("ok")
            except BusinessError as exc:
                results.append(exc.code)
            finally:
                connection.close()

        threads = [threading.Thread(target=collect) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(sorted(results), ["ok", "over_collection", "over_collection", "over_collection"])
        self.assertEqual(sales.paid_total(booking), lakh(20))
        self.assertEqual(balance(K.CUSTOMER_ADVANCE), lakh(20))
        numbers = list(Receipt.objects.values_list("number", flat=True))
        self.assertEqual(len(numbers), len(set(numbers)))
