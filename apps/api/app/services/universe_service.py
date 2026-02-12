from __future__ import annotations

import asyncio
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

    async def _refresh_if_needed(self) -> None:
        now = datetime.utcnow()
        if self._items and self._last_refresh and now - self._last_refresh < self._ttl:
            return

        async with self._lock:
            now = datetime.utcnow()
            if self._items and self._last_refresh and now - self._last_refresh < self._ttl:
                return

            try:
                nasdaq_text, other_text = await asyncio.gather(
                    self._download_text("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
                    self._download_text("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
                )

                nasdaq_rows = self._parse_pipe_table(nasdaq_text)
                other_rows = self._parse_pipe_table(other_text)

                merged = self._parse_nasdaq(nasdaq_rows) + self._parse_other(other_rows)

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
                self._items = FALLBACK_UNIVERSE.copy()
                self._last_refresh = now

    async def list_stocks(self, query: str = "", offset: int = 0, limit: int = 80) -> dict:
        await self._refresh_if_needed()

        q = query.strip().upper()
        items = self._items
        if q:
            items = [
                item
                for item in items
                if item["symbol"].startswith(q) or q in item["name"].upper()
            ]

        total = len(items)
        sliced = items[offset : offset + limit]

        return {"total": total, "items": sliced}


universe_service = UniverseService()
