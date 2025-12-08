from typing import List, Optional

from pydantic import BaseModel, Field, validator


class TaxCalculationRequest(BaseModel):
    amount: float = Field(..., ge=0, description="Gross NIL income for the period")
    state: str = Field("", description="Two-letter state code, defaults to unknown")
    federal_rate: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Optional explicit effective federal tax rate (0-1)",
    )
    annual_income_estimate: Optional[float] = Field(
        None,
        ge=0,
        description="Optional estimated annual income to infer federal rate if not provided",
    )

    @validator("state")
    def normalize_state(cls, value: str) -> str:
        # Upper-case once to avoid case-related lookup errors later
        return value.upper().strip()


class TaxCalculationResponse(BaseModel):
    gross_income: float
    self_employment_tax: float
    federal_tax: float
    state_tax: float
    recommended_reserve: float
    usable_cash: float
    disclaimer: str


class StateTaxRate(BaseModel):
    code: str
    name: str
    rate: float


class StateTaxRatesResponse(BaseModel):
    states: List[StateTaxRate]
