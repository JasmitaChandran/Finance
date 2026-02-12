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

    async def dashboard(self, symbol: str) -> dict:
        quote = await self.quote(symbol)
        profile = await self.profile(symbol)
        history = await self.history(symbol)

        ratios = {
            "pe": profile.get("trailing_pe"),
            "roe": profile.get("roe"),
            "debt_to_equity": profile.get("debt_to_equity"),
            "profit_margin": profile.get("profit_margin"),
            "revenue_growth": profile.get("revenue_growth"),
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

        dashboard = {
            "quote": quote,
            "profile": clean_profile,
            "ratios": ratios,
            "financial_highlights": highlights,
            "history": history,
        }
        return self._sanitize_json(dashboard)


stock_service = StockService()
