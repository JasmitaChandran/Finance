from __future__ import annotations

from abc import ABC, abstractmethod


class StockProvider(ABC):
    name: str

    @abstractmethod
    async def get_quote(self, symbol: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def get_profile(self, symbol: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    async def search(self, query: str) -> list[dict]:
        raise NotImplementedError

    @abstractmethod
    async def get_financials(self, symbol: str, years: int = 10) -> dict:
        raise NotImplementedError
