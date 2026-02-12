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
            "volume": info.get("lastVolume") or raw_info.get("regularMarketVolume") or raw_info.get("volume"),
            "open": info.get("open") or raw_info.get("regularMarketOpen"),
            "high": info.get("dayHigh") or raw_info.get("regularMarketDayHigh"),
            "low": info.get("dayLow") or raw_info.get("regularMarketDayLow"),
            "close": info.get("lastPrice") or raw_info.get("regularMarketPrice") or raw_info.get("currentPrice"),
        }

    async def get_profile(self, symbol: str) -> dict:
        ticker = yf.Ticker(symbol)
        fast_info = await asyncio.to_thread(lambda: ticker.fast_info)
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
            "roce": info.get("returnOnCapital") or info.get("returnOnCapitalEmployed") or info.get("returnOnAssets"),
            "debt_to_equity": info.get("debtToEquity"),
            "profit_margin": info.get("profitMargins"),
            "revenue_growth": info.get("revenueGrowth"),
            "pb": info.get("priceToBook"),
            "peg": info.get("pegRatio"),
            "dividend_yield": info.get("dividendYield"),
            "eps": info.get("trailingEps"),
            "book_value": info.get("bookValue"),
            "beta": info.get("beta"),
            "week_52_high": info.get("fiftyTwoWeekHigh") or fast_info.get("yearHigh"),
            "week_52_low": info.get("fiftyTwoWeekLow") or fast_info.get("yearLow"),
        }

    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        ticker = yf.Ticker(symbol)
        history = await asyncio.to_thread(
            lambda: ticker.history(period=period, interval="1d", auto_adjust=False)
        )
        result = []
        has_adj_close = "Adj Close" in history.columns
        for idx, row in history.iterrows():
            close_value = float(row["Close"])
            result.append(
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": close_value,
                    "adj_close": float(row["Adj Close"]) if has_adj_close else close_value,
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
