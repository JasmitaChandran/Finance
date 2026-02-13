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
            "volume": float(data.get("06. volume", 0) or 0),
            "open": float(data.get("02. open", 0) or 0),
            "high": float(data.get("03. high", 0) or 0),
            "low": float(data.get("04. low", 0) or 0),
            "close": float(data.get("08. previous close", 0) or 0),
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
            "roce": float(data.get("ReturnOnAssetsTTM", 0) or 0),
            "debt_to_equity": float(data.get("DebtToEquity", 0) or 0),
            "profit_margin": float(data.get("ProfitMargin", 0) or 0),
            "revenue_growth": float(data.get("QuarterlyRevenueGrowthYOY", 0) or 0),
            "pb": float(data.get("PriceToBookRatio", 0) or 0),
            "peg": float(data.get("PEGRatio", 0) or 0),
            "dividend_yield": float(data.get("DividendYield", 0) or 0),
            "eps": float(data.get("EPS", 0) or 0),
            "book_value": float(data.get("BookValue", 0) or 0),
            "beta": float(data.get("Beta", 0) or 0),
            "enterprise_value": float(data.get("EV", 0) or 0),
            "enterprise_to_ebitda": float(data.get("EVToEBITDA", 0) or 0),
            "free_cash_flow": float(data.get("FreeCashFlowTTM", 0) or 0),
            "operating_cash_flow": float(data.get("OperatingCashFlowTTM", 0) or 0),
            "total_debt": float(data.get("TotalDebt", 0) or 0),
            "total_cash": float(data.get("CashAndCashEquivalentsAtCarryingValue", 0) or 0),
            "earnings_growth": float(data.get("QuarterlyEarningsGrowthYOY", 0) or 0),
            "shares_outstanding": float(data.get("SharesOutstanding", 0) or 0),
            "week_52_high": float(data.get("52WeekHigh", 0) or 0),
            "week_52_low": float(data.get("52WeekLow", 0) or 0),
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
                "open": float(data[dt]["1. open"]),
                "high": float(data[dt]["2. high"]),
                "low": float(data[dt]["3. low"]),
                "close": float(data[dt]["4. close"]),
                "adj_close": float(data[dt]["4. close"]),
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

    async def get_financials(self, symbol: str, years: int = 10) -> dict:
        raise RuntimeError("Alpha Vantage financial statements endpoint not enabled in this implementation")
