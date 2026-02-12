from __future__ import annotations

from pydantic import BaseModel, Field


class CreateAlertRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    target_price: float = Field(gt=0)
    above: bool = True


class AlertResponse(BaseModel):
    id: str
    symbol: str
    target_price: float
    above: bool
    is_active: bool
