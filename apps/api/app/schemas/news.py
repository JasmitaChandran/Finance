from __future__ import annotations

from pydantic import BaseModel


class NewsSummaryResponse(BaseModel):
    symbol: str
    bullets: list[str]
    sentiment: str
    source_count: int
