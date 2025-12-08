from typing import Tuple

from app.models.tax_models import TaxCalculationRequest, TaxCalculationResponse
from app.utils.constants import DISCLAIMER, STATE_TAX_RATES

SELF_EMPLOYMENT_TAX_RATE = 0.153

# Simplified federal brackets for effective rate inference
FEDERAL_BRACKETS: Tuple[Tuple[float, float], ...] = (
    (11000, 0.10),
    (44000, 0.12),
    (95000, 0.22),
    (float("inf"), 0.24),
)


def _round_currency(value: float) -> float:
    # Round consistently to two decimals for currency display
    return round(value, 2)


def infer_federal_rate(annual_income_estimate: float) -> float:
    """Infer conservative effective federal rate from simplified brackets."""
    for threshold, rate in FEDERAL_BRACKETS:
        if annual_income_estimate <= threshold:
            return rate
    # Should never hit because last bracket is inf, but keep defensive default
    return FEDERAL_BRACKETS[-1][1]


def calculate_tax_reserve(payload: TaxCalculationRequest) -> TaxCalculationResponse:
    if payload.amount < 0:
        raise ValueError("Income amount cannot be negative.")

    # Use explicit federal rate when provided; otherwise infer using best available data.
    if payload.federal_rate is not None:
        federal_rate = payload.federal_rate
    elif payload.annual_income_estimate is not None:
        federal_rate = infer_federal_rate(payload.annual_income_estimate)
    else:
        # Default to the highest bracket to stay conservative without an estimate.
        federal_rate = FEDERAL_BRACKETS[-1][1]

    state_rate = STATE_TAX_RATES.get(payload.state, 0.0)

    self_employment_tax = _round_currency(payload.amount * SELF_EMPLOYMENT_TAX_RATE)
    federal_tax = _round_currency(payload.amount * federal_rate)
    state_tax = _round_currency(payload.amount * state_rate)

    recommended_reserve = _round_currency(self_employment_tax + federal_tax + state_tax)
    usable_cash = _round_currency(payload.amount - recommended_reserve)

    return TaxCalculationResponse(
        gross_income=_round_currency(payload.amount),
        self_employment_tax=self_employment_tax,
        federal_tax=federal_tax,
        state_tax=state_tax,
        recommended_reserve=recommended_reserve,
        usable_cash=usable_cash,
        disclaimer=DISCLAIMER,
    )
