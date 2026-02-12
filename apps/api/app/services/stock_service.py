from __future__ import annotations

import math

from fastapi import HTTPException

from app.core.cache import cache
from app.services.providers.alpha_vantage_provider import AlphaVantageProvider
from app.services.providers.fmp_provider import FMPProvider
from app.services.providers.yahoo_provider import YahooFinanceProvider


class StockService:
    def __init__(self) -> None:
        self.providers = [YahooFinanceProvider(), FMPProvider(), AlphaVantageProvider()]

    def _sanitize_json(self, value):
        if isinstance(value, dict):
            return {k: self._sanitize_json(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._sanitize_json(v) for v in value]

        # Normalize numpy/pandas scalar values into plain Python scalars when present.
        if hasattr(value, "item") and callable(getattr(value, "item")):
            try:
                return self._sanitize_json(value.item())
            except Exception:
                pass

        if isinstance(value, float) and not math.isfinite(value):
            return None
        return value

    def _is_finite_number(self, value) -> bool:
        try:
            return math.isfinite(float(value))
        except (TypeError, ValueError):
            return False

    def _as_number(self, value):
        if self._is_finite_number(value):
            return float(value)
        return None

    def _change_for_offset(self, history: list[dict], offset_days: int):
        if len(history) <= offset_days:
            return None
        latest = self._as_number(history[-1].get("close"))
        base = self._as_number(history[-1 - offset_days].get("close"))
        if latest is None or base is None or base == 0:
            return None
        return ((latest - base) / base) * 100

    async def _from_providers(self, method_name: str, *args, **kwargs):
        last_error = None
        for provider in self.providers:
            try:
                method = getattr(provider, method_name)
                return await method(*args, **kwargs)
            except Exception as exc:  # pragma: no cover
                last_error = exc
                continue
        raise HTTPException(status_code=503, detail=f"Data providers unavailable: {last_error}")

    async def search(self, query: str) -> list[dict]:
        key = f"search:{query.lower()}"
        data = await cache.remember(key, lambda: self._from_providers("search", query), ttl_seconds=300)
        return self._sanitize_json(data)

    async def quote(self, symbol: str) -> dict:
        key = f"quote:{symbol.upper()}"
        data = await cache.remember(key, lambda: self._from_providers("get_quote", symbol), ttl_seconds=60)
        return self._sanitize_json(data)

    async def profile(self, symbol: str) -> dict:
        key = f"profile:{symbol.upper()}"
        data = await cache.remember(key, lambda: self._from_providers("get_profile", symbol), ttl_seconds=900)
        return self._sanitize_json(data)

    async def history(self, symbol: str, period: str = "6mo") -> list[dict]:
        key = f"history:{symbol.upper()}:{period}"
        data = await cache.remember(key, lambda: self._from_providers("get_history", symbol, period), ttl_seconds=300)
        safe_history = [
            row
            for row in data
            if isinstance(row, dict)
            and self._is_finite_number(row.get("close"))
            and self._is_finite_number(row.get("volume"))
        ]
        return self._sanitize_json(safe_history)

    async def financial_statements(self, symbol: str, years: int = 10) -> dict:
        key = f"financials:{symbol.upper()}:{years}"
        data = await cache.remember(
            key,
            lambda: self._from_providers("get_financials", symbol, years),
            ttl_seconds=6 * 3600,
        )
        return self._sanitize_json(data)

    async def dashboard(self, symbol: str) -> dict:
        quote = await self.quote(symbol)
        profile = await self.profile(symbol)
        history = await self.history(symbol)
        history_5y = await self.history(symbol, period="5y")
        try:
            financial_statements = await self.financial_statements(symbol, years=10)
        except HTTPException:
            financial_statements = {"years": [], "income_statement": {"raw": [], "common_size": []}, "balance_sheet": {"raw": [], "common_size": []}, "cash_flow": {"raw": [], "common_size": []}}

        ratios = {
            "pe": profile.get("trailing_pe"),
            "pb": profile.get("pb"),
            "peg": profile.get("peg"),
            "roe": profile.get("roe"),
            "roce": profile.get("roce"),
            "debt_to_equity": profile.get("debt_to_equity"),
            "profit_margin": profile.get("profit_margin"),
            "revenue_growth": profile.get("revenue_growth"),
            "dividend_yield": profile.get("dividend_yield"),
            "eps": profile.get("eps"),
            "book_value": profile.get("book_value"),
            "beta": profile.get("beta"),
        }

        highlights = {
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "market_cap": quote.get("market_cap"),
        }

        clean_profile = {
            "symbol": profile.get("symbol"),
            "name": profile.get("name"),
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "website": profile.get("website"),
            "description": profile.get("description"),
            "country": profile.get("country"),
        }

        perf = {
            "1d": self._change_for_offset(history_5y, 1),
            "1w": self._change_for_offset(history_5y, 5),
            "1m": self._change_for_offset(history_5y, 21),
            "1y": self._change_for_offset(history_5y, 252),
            "5y": self._change_for_offset(history_5y, 1260),
        }

        latest_row = history_5y[-1] if history_5y else {}
        ohlc = {
            "open": self._as_number(latest_row.get("open") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("open")),
            "high": self._as_number(latest_row.get("high") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("high")),
            "low": self._as_number(latest_row.get("low") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("low")),
            "close": self._as_number(latest_row.get("close") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("close")) or self._as_number(quote.get("price")),
            "adjusted_close": self._as_number(latest_row.get("adj_close") if isinstance(latest_row, dict) else None),
        }

        market_data = {
            "live_price": self._as_number(quote.get("price")),
            "changes_percent": perf,
            "volume": self._as_number(quote.get("volume")) or self._as_number(latest_row.get("volume") if isinstance(latest_row, dict) else None),
            "market_cap": self._as_number(quote.get("market_cap")),
            "week_52_high": self._as_number(profile.get("week_52_high")),
            "week_52_low": self._as_number(profile.get("week_52_low")),
            "beta": self._as_number(profile.get("beta")),
            "pe": self._as_number(profile.get("trailing_pe")),
            "pb": self._as_number(profile.get("pb")),
            "peg": self._as_number(profile.get("peg")),
            "dividend_yield": self._as_number(profile.get("dividend_yield")),
            "eps": self._as_number(profile.get("eps")),
            "book_value": self._as_number(profile.get("book_value")),
            "roe": self._as_number(profile.get("roe")),
            "roce": self._as_number(profile.get("roce")),
        }

        dashboard = {
            "quote": quote,
            "profile": clean_profile,
            "ratios": ratios,
            "financial_highlights": highlights,
            "history": history,
            "market_data": market_data,
            "ohlc": ohlc,
            "financial_statements": financial_statements,
        }
        return self._sanitize_json(dashboard)


stock_service = StockService()
