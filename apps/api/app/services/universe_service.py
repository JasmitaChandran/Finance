from __future__ import annotations

import asyncio
import csv
from datetime import datetime, timedelta
from typing import Optional

import httpx

FALLBACK_UNIVERSE = [
    {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ"},
    {"symbol": "AMZN", "name": "Amazon.com, Inc.", "exchange": "NASDAQ"},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "exchange": "NASDAQ"},
    {"symbol": "META", "name": "Meta Platforms, Inc.", "exchange": "NASDAQ"},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "exchange": "NASDAQ"},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE"},
    {"symbol": "V", "name": "Visa Inc.", "exchange": "NYSE"},
    {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE"},
]

INDIA_FALLBACK_UNIVERSE = [
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "RELIANCE"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "TCS"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "HDFCBANK"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "ICICIBANK"},
    {"symbol": "INFY.NS", "name": "Infosys Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "INFY"},
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "HINDUNILVR"},
    {"symbol": "ITC.NS", "name": "ITC Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "ITC"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "LT"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "SBIN"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel Limited", "exchange": "NSE", "country": "IN", "currency": "INR", "base_symbol": "BHARTIARTL"},
]

EXCHANGE_MAP = {
    "A": "AMEX",
    "N": "NYSE",
    "P": "NYSE ARCA",
    "Q": "NASDAQ",
    "V": "IEX",
    "Z": "BATS",
}


class UniverseService:
    def __init__(self) -> None:
        self._ttl = timedelta(hours=24)
        self._last_refresh: Optional[datetime] = None
        self._items: list[dict] = []
        self._lock = asyncio.Lock()

    async def _download_text(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.text

    @staticmethod
    def _parse_csv_rows(text: str) -> list[dict[str, str]]:
        lines = [line for line in text.splitlines() if line.strip()]
        if not lines:
            return []
        reader = csv.DictReader(lines)
        return [{str(k): str(v) if v is not None else "" for k, v in row.items()} for row in reader]

    @staticmethod
    def _parse_pipe_table(text: str) -> list[dict[str, str]]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return []

        header = [item.strip() for item in lines[0].split("|")]
        rows: list[dict[str, str]] = []

        for line in lines[1:]:
            if line.startswith("File Creation Time"):
                continue
            columns = [item.strip() for item in line.split("|")]
            if len(columns) < len(header):
                columns.extend([""] * (len(header) - len(columns)))
            row = {header[idx]: columns[idx] for idx in range(len(header))}
            rows.append(row)

        return rows

    @staticmethod
    def _parse_nasdaq(rows: list[dict[str, str]]) -> list[dict]:
        parsed: list[dict] = []
        for row in rows:
            symbol = (row.get("Symbol") or "").strip().upper()
            if not symbol or symbol == "SYMBOL":
                continue

            if (row.get("Test Issue") or "").strip().upper() == "Y":
                continue

            name = (row.get("Security Name") or "").strip() or symbol
            parsed.append({"symbol": symbol, "name": name, "exchange": "NASDAQ"})

        return parsed

    @staticmethod
    def _parse_other(rows: list[dict[str, str]]) -> list[dict]:
        parsed: list[dict] = []
        for row in rows:
            symbol = ((row.get("ACT Symbol") or row.get("CQS Symbol") or "").strip()).upper()
            if not symbol:
                continue

            if (row.get("Test Issue") or "").strip().upper() == "Y":
                continue

            exchange_code = (row.get("Exchange") or "").strip().upper()
            exchange = EXCHANGE_MAP.get(exchange_code, exchange_code or "OTHER")
            name = (row.get("Security Name") or "").strip() or symbol

            parsed.append({"symbol": symbol, "name": name, "exchange": exchange})

        return parsed

    @staticmethod
    def _parse_nse_equity(rows: list[dict[str, str]]) -> list[dict]:
        parsed: list[dict] = []
        for row in rows:
            base_symbol = (row.get("SYMBOL") or "").strip().upper()
            if not base_symbol:
                continue
            series = (row.get(" SERIES") or row.get("SERIES") or "").strip().upper()
            if series and series != "EQ":
                continue

            name = (row.get("NAME OF COMPANY") or "").strip() or base_symbol
            # NSE primary listing
            parsed.append(
                {
                    "symbol": f"{base_symbol}.NS",
                    "name": name,
                    "exchange": "NSE",
                    "country": "IN",
                    "currency": "INR",
                    "base_symbol": base_symbol,
                }
            )
            # Yahoo often supports .BO for many common stocks; include alias for BSE handling/search.
            parsed.append(
                {
                    "symbol": f"{base_symbol}.BO",
                    "name": name,
                    "exchange": "BSE",
                    "country": "IN",
                    "currency": "INR",
                    "base_symbol": base_symbol,
                    "alias": True,
                }
            )
        return parsed

    @staticmethod
    def _annotate_us_items(items: list[dict]) -> list[dict]:
        annotated: list[dict] = []
        for item in items:
            annotated.append(
                {
                    **item,
                    "country": item.get("country") or "US",
                    "currency": item.get("currency") or "USD",
                    "base_symbol": item.get("base_symbol") or item.get("symbol"),
                }
            )
        return annotated

    async def _refresh_if_needed(self) -> None:
        now = datetime.utcnow()
        if self._items and self._last_refresh and now - self._last_refresh < self._ttl:
            return

        async with self._lock:
            now = datetime.utcnow()
            if self._items and self._last_refresh and now - self._last_refresh < self._ttl:
                return

            try:
                nasdaq_text, other_text, nse_text = await asyncio.gather(
                    self._download_text("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
                    self._download_text("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
                    self._download_text("https://archives.nseindia.com/content/equities/EQUITY_L.csv"),
                )

                nasdaq_rows = self._parse_pipe_table(nasdaq_text)
                other_rows = self._parse_pipe_table(other_text)
                nse_rows = self._parse_csv_rows(nse_text)

                merged = (
                    self._annotate_us_items(self._parse_nasdaq(nasdaq_rows))
                    + self._annotate_us_items(self._parse_other(other_rows))
                    + self._parse_nse_equity(nse_rows)
                )

                # Deduplicate by symbol and keep the first encountered listing.
                dedup: dict[str, dict] = {}
                for item in merged:
                    if item["symbol"] not in dedup:
                        dedup[item["symbol"]] = item

                items = sorted(dedup.values(), key=lambda item: item["symbol"])
                if items:
                    self._items = items
                    self._last_refresh = now
                    return
            except Exception:
                pass

            if not self._items:
                self._items = self._annotate_us_items(FALLBACK_UNIVERSE.copy()) + INDIA_FALLBACK_UNIVERSE.copy()
                self._last_refresh = now

    @staticmethod
    def _matches_market(item: dict, market: str) -> bool:
        if not market or market in {"all", "global"}:
            return True
        exchange = str(item.get("exchange") or "").upper()
        country = str(item.get("country") or "").upper()
        if market == "india":
            return country == "IN" or exchange in {"NSE", "BSE"}
        if market == "us":
            return country == "US" or exchange in {"NASDAQ", "NYSE", "AMEX", "NYSE ARCA", "BATS", "IEX"}
        if market == "nse":
            return exchange == "NSE"
        if market == "bse":
            return exchange == "BSE"
        return True

    async def list_stocks(self, query: str = "", offset: int = 0, limit: int = 80, market: str = "") -> dict:
        await self._refresh_if_needed()

        q = query.strip().upper()
        market_key = market.strip().lower()
        items = [item for item in self._items if self._matches_market(item, market_key)]
        if q:
            items = [
                item
                for item in items
                if item["symbol"].startswith(q)
                or q in item["name"].upper()
                or q == str(item.get("base_symbol") or "").upper()
                or str(item.get("base_symbol") or "").upper().startswith(q)
            ]

        total = len(items)
        sliced = items[offset : offset + limit]

        return {"total": total, "items": sliced}


universe_service = UniverseService()
