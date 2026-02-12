from __future__ import annotations

import httpx

from app.core.config import settings
from app.services.providers.base import StockProvider


class FMPProvider(StockProvider):
    name = "fmp"

    def _ready(self) -> bool:
        return bool(settings.fmp_api_key)

    @staticmethod
    def _parse_range(raw_value):
        if not raw_value or not isinstance(raw_value, str) or "-" not in raw_value:
            return (None, None)
        low_raw, high_raw = raw_value.split("-", 1)
        try:
            return (float(low_raw.strip()), float(high_raw.strip()))
        except Exception:
            return (None, None)

    async def get_quote(self, symbol: str) -> dict:
        if not self._ready():
            raise RuntimeError("FMP API key missing")
        url = f"https://financialmodelingprep.com/api/v3/quote/{symbol}"
        params = {"apikey": settings.fmp_api_key}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()

        if not payload:
            raise RuntimeError("No quote returned")
        row = payload[0]
        return {
            "symbol": row.get("symbol", symbol.upper()),
            "name": row.get("name") or symbol.upper(),
            "currency": row.get("currency") or "USD",
            "price": row.get("price"),
            "change_percent": row.get("changesPercentage"),
            "market_cap": row.get("marketCap"),
            "volume": row.get("volume"),
            "open": row.get("open"),
            "high": row.get("dayHigh") or row.get("high"),
            "low": row.get("dayLow") or row.get("low"),
            "close": row.get("previousClose") or row.get("price"),
        }

    async def get_profile(self, symbol: str) -> dict:
        if not self._ready():
            raise RuntimeError("FMP API key missing")
        url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}"
        params = {"apikey": settings.fmp_api_key}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()

        if not payload:
            raise RuntimeError("No profile returned")
        row = payload[0]
        week_52_low, week_52_high = self._parse_range(row.get("range"))
        return {
            "symbol": row.get("symbol", symbol.upper()),
            "name": row.get("companyName") or symbol.upper(),
            "sector": row.get("sector"),
            "industry": row.get("industry"),
            "website": row.get("website"),
            "description": row.get("description"),
            "country": row.get("country"),
            "trailing_pe": row.get("pe"),
            "roe": row.get("roe"),
            "roce": row.get("roic"),
            "debt_to_equity": row.get("debtToEquity"),
            "profit_margin": row.get("profitMargin"),
            "revenue_growth": row.get("growthRevenue"),
            "pb": row.get("priceToBookRatio"),
            "peg": row.get("pegRatio"),
            "dividend_yield": row.get("lastDiv"),
            "eps": row.get("eps"),
            "book_value": row.get("bookValuePerShare"),
            "beta": row.get("beta"),
            "week_52_high": week_52_high,
            "week_52_low": week_52_low,
        }

    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        if not self._ready():
            raise RuntimeError("FMP API key missing")
        url = f"https://financialmodelingprep.com/api/v3/historical-price-full/{symbol}"
        params = {"timeseries": 120, "apikey": settings.fmp_api_key}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json().get("historical", [])

        if not payload:
            raise RuntimeError("No historical data returned")

        rows = list(reversed(payload[-120:]))
        return [
            {
                "date": row["date"],
                "open": row.get("open"),
                "high": row.get("high"),
                "low": row.get("low"),
                "close": row.get("close"),
                "adj_close": row.get("adjClose") or row.get("close"),
                "volume": row.get("volume"),
            }
            for row in rows
        ]

    async def search(self, query: str) -> list[dict]:
        if not self._ready():
            return []
        url = "https://financialmodelingprep.com/api/v3/search"
        params = {"query": query, "limit": 8, "exchange": "NASDAQ", "apikey": settings.fmp_api_key}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            payload = response.json()

        return [
            {
                "symbol": row.get("symbol"),
                "name": row.get("name"),
                "exchange": row.get("exchangeShortName"),
                "type": row.get("type"),
            }
            for row in payload
            if row.get("symbol")
        ]
