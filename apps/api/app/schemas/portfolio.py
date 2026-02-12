from __future__ import annotations

from pydantic import BaseModel, Field


class CreatePortfolioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class AddPositionRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    quantity: float = Field(gt=0)
    average_buy_price: float = Field(gt=0)
    sector: str | None = None


class PositionResponse(BaseModel):
    id: str
    symbol: str
    quantity: float
    average_buy_price: float
    sector: str | None = None


class PortfolioResponse(BaseModel):
    id: str
    name: str
    positions: list[PositionResponse]
