from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import alerts, auth, compare, learning, news, portfolio, screener, stocks, watchlist

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(stocks.router)
api_router.include_router(screener.router)
api_router.include_router(compare.router)
api_router.include_router(watchlist.router)
api_router.include_router(portfolio.router)
api_router.include_router(alerts.router)
api_router.include_router(news.router)
api_router.include_router(learning.router)
