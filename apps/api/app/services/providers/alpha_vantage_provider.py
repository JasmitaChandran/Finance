from __future__ import annotations

import httpx

from app.core.config import settings
from app.services.providers.base import StockProvider


class AlphaVantageProvider(StockProvider):
    name = "alpha_vantage"

    def _ready(self) -> bool:
        return bool(settings.alpha_vantage_api_key)

    async def get_quote(self, symbol: str) -> dict:
        if not self._ready():
            raise RuntimeError("Alpha Vantage API key missing")
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "GLOBAL_QUOTE",
            "symbol": symbol,
            "apikey": settings.alpha_vantage_api_key,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json().get("Global Quote", {})

        if not data:
            raise RuntimeError("No quote returned")

        return {
            "symbol": symbol.upper(),
            "name": symbol.upper(),
            "currency": "USD",
            "price": float(data.get("05. price", 0) or 0),
            "change_percent": float((data.get("10. change percent") or "0").replace("%", "")),
            "market_cap": None,
        }

    async def get_profile(self, symbol: str) -> dict:
        if not self._ready():
            raise RuntimeError("Alpha Vantage API key missing")
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "OVERVIEW",
            "symbol": symbol,
            "apikey": settings.alpha_vantage_api_key,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

        if not data or "Symbol" not in data:
            raise RuntimeError("No profile returned")

        return {
            "symbol": data.get("Symbol", symbol.upper()),
            "name": data.get("Name", symbol.upper()),
            "sector": data.get("Sector"),
            "industry": data.get("Industry"),
            "website": data.get("OfficialSite"),
            "description": data.get("Description"),
            "country": data.get("Country"),
            "trailing_pe": float(data.get("PERatio", 0) or 0),
            "roe": float(data.get("ReturnOnEquityTTM", 0) or 0),
            "debt_to_equity": float(data.get("DebtToEquity", 0) or 0),
            "profit_margin": float(data.get("ProfitMargin", 0) or 0),
            "revenue_growth": float(data.get("QuarterlyRevenueGrowthYOY", 0) or 0),
        }

    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        if not self._ready():
            raise RuntimeError("Alpha Vantage API key missing")
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "TIME_SERIES_DAILY",
            "symbol": symbol,
            "outputsize": "compact",
            "apikey": settings.alpha_vantage_api_key,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json().get("Time Series (Daily)", {})

        if not data:
            raise RuntimeError("No historical data returned")

        ordered_dates = sorted(data.keys())[-120:]
        return [
            {
                "date": dt,
                "close": float(data[dt]["4. close"]),
                "volume": float(data[dt]["5. volume"]),
            }
            for dt in ordered_dates
        ]

    async def search(self, query: str) -> list[dict]:
        if not self._ready():
            return []
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "SYMBOL_SEARCH",
            "keywords": query,
            "apikey": settings.alpha_vantage_api_key,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json().get("bestMatches", [])

        return [
            {
                "symbol": item.get("1. symbol"),
                "name": item.get("2. name"),
                "exchange": item.get("4. region"),
                "type": item.get("3. type"),
            }
            for item in data
            if item.get("1. symbol")
        ]
