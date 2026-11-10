"""Money helpers. All amounts are Decimal with exactly two decimal places."""
from decimal import ROUND_HALF_UP, Decimal

from django.db import models

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def money(value) -> Decimal:
    """Coerce to a 2-dp Decimal using banker-safe half-up rounding. Never use float."""
    if value is None:
        return ZERO
    if isinstance(value, float):
        value = str(value)
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


class MoneyField(models.DecimalField):
    """Decimal(18,2) column for currency amounts."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("max_digits", 18)
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("default", ZERO)
        super().__init__(*args, **kwargs)


def split_amount(total: Decimal, parts: int) -> list[Decimal]:
    """Split ``total`` into ``parts`` amounts that sum to exactly ``total``.

    Rounding remainder goes to the last part so no paisa is lost.
    """
    total = money(total)
    if parts <= 0:
        raise ValueError("parts must be positive")
    each = (total / parts).quantize(CENT, rounding=ROUND_HALF_UP)
    amounts = [each] * parts
    amounts[-1] = total - each * (parts - 1)
    return amounts


def prorate(total: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """Distribute ``total`` across ``weights`` so the result sums to exactly ``total``."""
    total = money(total)
    weight_sum = sum(weights, Decimal("0"))
    if not weights or weight_sum <= 0:
        raise ValueError("weights must be positive")
    out, running = [], ZERO
    for w in weights[:-1]:
        share = (total * w / weight_sum).quantize(CENT, rounding=ROUND_HALF_UP)
        out.append(share)
        running += share
    out.append(total - running)
    return out
