from __future__ import annotations

from fastapi import APIRouter

from app.services.news_service import news_service

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/{symbol}/summary")
async def summarize(symbol: str):
    return await news_service.summarize(symbol)
