from __future__ import annotations

import asyncio

import yfinance as yf

from app.services.providers.base import StockProvider


class YahooFinanceProvider(StockProvider):
    name = "yahoo"

    async def get_quote(self, symbol: str) -> dict:
        ticker = yf.Ticker(symbol)
        info = await asyncio.to_thread(lambda: ticker.fast_info)
        raw_info = await asyncio.to_thread(lambda: ticker.info)
        return {
            "symbol": symbol.upper(),
            "name": raw_info.get("shortName") or raw_info.get("longName") or symbol.upper(),
            "currency": info.get("currency") or raw_info.get("currency"),
            "price": info.get("lastPrice") or raw_info.get("currentPrice"),
            "change_percent": raw_info.get("regularMarketChangePercent"),
            "market_cap": info.get("marketCap") or raw_info.get("marketCap"),
        }

    async def get_profile(self, symbol: str) -> dict:
        ticker = yf.Ticker(symbol)
        info = await asyncio.to_thread(lambda: ticker.info)
        return {
            "symbol": symbol.upper(),
            "name": info.get("longName") or info.get("shortName") or symbol.upper(),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "website": info.get("website"),
            "description": info.get("longBusinessSummary"),
            "country": info.get("country"),
            "trailing_pe": info.get("trailingPE"),
            "roe": info.get("returnOnEquity"),
            "debt_to_equity": info.get("debtToEquity"),
            "profit_margin": info.get("profitMargins"),
            "revenue_growth": info.get("revenueGrowth"),
        }

    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        ticker = yf.Ticker(symbol)
        history = await asyncio.to_thread(lambda: ticker.history(period=period, interval="1d"))
        result = []
        for idx, row in history.iterrows():
            result.append(
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "close": float(row["Close"]),
                    "volume": float(row["Volume"]),
                }
            )
        return result

    async def search(self, query: str) -> list[dict]:
        searcher = yf.Search(query, max_results=8)
        quotes = await asyncio.to_thread(lambda: searcher.quotes)
        return [
            {
                "symbol": item.get("symbol"),
                "name": item.get("shortname") or item.get("longname") or item.get("symbol"),
                "exchange": item.get("exchange"),
                "type": item.get("quoteType"),
            }
            for item in quotes
            if item.get("symbol")
        ]
