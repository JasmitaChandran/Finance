from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class CreatePortfolioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class AddPositionRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    quantity: float = Field(gt=0)
    average_buy_price: float = Field(gt=0)
    sector: str | None = None


class AddTransactionRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    side: Literal["buy", "sell"]
    quantity: float = Field(gt=0)
    price: float = Field(gt=0)
    fee: float = Field(default=0, ge=0)
    trade_date: date | None = None
    sector: str | None = None
    note: str | None = Field(default=None, max_length=255)


class PositionResponse(BaseModel):
    id: str
    symbol: str
    quantity: float
    average_buy_price: float
    sector: str | None = None


class PortfolioTransactionResponse(BaseModel):
    id: str
    symbol: str
    side: str
    quantity: float
    price: float
    fee: float
    trade_date: str
    note: str | None = None
    created_at: str


class PortfolioResponse(BaseModel):
    id: str
    name: str
    positions: list[PositionResponse]
