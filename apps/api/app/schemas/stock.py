from __future__ import annotations

from pydantic import BaseModel


class StockQuote(BaseModel):
    symbol: str
    name: str
    currency: str | None = None
    price: float | None = None
    change_percent: float | None = None
    market_cap: float | None = None


class StockProfile(BaseModel):
    symbol: str
    name: str
    sector: str | None = None
    industry: str | None = None
    website: str | None = None
    description: str | None = None
    country: str | None = None


class StockDashboard(BaseModel):
    quote: StockQuote
    profile: StockProfile
    ratios: dict
    financial_highlights: dict
    history: list[dict]


class ExplainMetricRequest(BaseModel):
    metric: str
    value: float | None = None
    symbol: str | None = None


class StockSummaryRequest(BaseModel):
    symbol: str
    mode: str = "beginner"
