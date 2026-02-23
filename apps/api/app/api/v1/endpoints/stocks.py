from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.stock import ExplainMetricRequest, StockSummaryRequest
from app.services.ai_service import ai_service
from app.services.smart_insights_service import smart_insights_service
from app.services.stock_service import stock_service
from app.services.universe_service import universe_service

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/search")
async def search_stocks(q: str = Query(min_length=1, max_length=30)):
    return {"items": await stock_service.search(q)}


@router.get("/universe")
async def stock_universe(
    q: str = Query(default="", max_length=60),
    market: str = Query(default="", max_length=20),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=80, ge=1, le=200),
):
    return await universe_service.list_stocks(query=q, market=market, offset=offset, limit=limit)


@router.get("/market-heatmap")
async def market_heatmap(limit: int = Query(default=60, ge=20, le=200)):
    return await stock_service.market_heatmap(limit=limit)


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
async def dashboard(symbol: str, mode: str = Query(default="pro", max_length=20)):
    return await stock_service.dashboard(symbol, mode=mode)


@router.get("/{symbol}/panels/{panel}")
async def dashboard_panel(
    symbol: str,
    panel: str,
    mode: str = Query(default="pro", max_length=20),
    period: str = Query(default="6mo", max_length=20),
    years: int = Query(default=10, ge=3, le=15),
):
    return await stock_service.panel(symbol=symbol, panel=panel, mode=mode, period=period, years=years)


@router.get("/{symbol}/benchmark-context")
async def benchmark_context(symbol: str):
    return await stock_service.benchmark_context(symbol)


@router.get("/{symbol}/relevance")
async def relevance_context(
    symbol: str,
    mode: str = Query(default="beginner", max_length=20),
    view: str = Query(default="long_term", max_length=30),
):
    return await stock_service.relevance_context(symbol=symbol, mode=mode, view=view)


@router.get("/{symbol}/financials")
async def financials(symbol: str, years: int = Query(default=10, ge=3, le=15)):
    return await stock_service.financial_statements(symbol, years=years)


@router.get("/{symbol}/smart-insights")
async def smart_insights(symbol: str):
    return await smart_insights_service.build(symbol)


@router.post("/explain-metric")
async def explain_metric(payload: ExplainMetricRequest):
    return await ai_service.explain_metric(payload.metric, payload.value, payload.symbol)


@router.post("/summary")
async def summary(payload: StockSummaryRequest):
    dashboard = await stock_service.dashboard(payload.symbol)
    return await ai_service.stock_summary(payload.symbol, dashboard, payload.mode)
