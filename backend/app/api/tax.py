from fastapi import APIRouter, HTTPException, status

from app.core.tax_calculator import calculate_tax_reserve
from app.models.tax_models import (
    StateTaxRatesResponse,
    TaxCalculationRequest,
    TaxCalculationResponse,
)
from app.utils.constants import STATE_DISPLAY_NAMES, STATE_TAX_RATES

router = APIRouter(prefix="/tax", tags=["tax"])


@router.post(
    "/calculate",
    response_model=TaxCalculationResponse,
    status_code=status.HTTP_200_OK,
)
def calculate_tax(payload: TaxCalculationRequest) -> TaxCalculationResponse:
    try:
        # Keep business logic separate so the route only orchestrates request/response flow.
        return calculate_tax_reserve(payload)
    except ValueError as exc:
        # Translate domain validation issues into client-friendly HTTP errors.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get(
    "/state-rates",
    response_model=StateTaxRatesResponse,
    status_code=status.HTTP_200_OK,
)
def list_state_tax_rates() -> StateTaxRatesResponse:
    states = [
        {"code": code, "name": STATE_DISPLAY_NAMES.get(code, code), "rate": rate}
        for code, rate in STATE_TAX_RATES.items()
    ]
    states.sort(key=lambda entry: entry["name"])
    return StateTaxRatesResponse(states=states)
