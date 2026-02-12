from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.stock import ExplainMetricRequest, StockSummaryRequest
from app.services.ai_service import ai_service
from app.services.stock_service import stock_service
from app.services.universe_service import universe_service

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/search")
async def search_stocks(q: str = Query(min_length=1, max_length=30)):
    return {"items": await stock_service.search(q)}


@router.get("/universe")
async def stock_universe(
    q: str = Query(default="", max_length=60),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=80, ge=1, le=200),
):
    return await universe_service.list_stocks(query=q, offset=offset, limit=limit)


@router.get("/{symbol}/quote")
async def quote(symbol: str):
    return await stock_service.quote(symbol)


@router.get("/{symbol}/profile")
async def profile(symbol: str):
    return await stock_service.profile(symbol)


@router.get("/{symbol}/history")
async def history(symbol: str, period: str = "6mo"):
    return {"symbol": symbol.upper(), "items": await stock_service.history(symbol, period)}


@router.get("/{symbol}/dashboard")
async def dashboard(symbol: str):
    return await stock_service.dashboard(symbol)


@router.get("/{symbol}/financials")
async def financials(symbol: str, years: int = Query(default=10, ge=3, le=15)):
    return await stock_service.financial_statements(symbol, years=years)


@router.post("/explain-metric")
async def explain_metric(payload: ExplainMetricRequest):
    return await ai_service.explain_metric(payload.metric, payload.value, payload.symbol)


@router.post("/summary")
async def summary(payload: StockSummaryRequest):
    dashboard = await stock_service.dashboard(payload.symbol)
    return await ai_service.stock_summary(payload.symbol, dashboard, payload.mode)
