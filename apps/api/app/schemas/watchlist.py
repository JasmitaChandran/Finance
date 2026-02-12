from __future__ import annotations

from pydantic import BaseModel, Field


class CreateWatchlistRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class AddWatchlistItemRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)


class WatchlistItemResponse(BaseModel):
    id: str
    symbol: str


class WatchlistResponse(BaseModel):
    id: str
    name: str
    items: list[WatchlistItemResponse]
