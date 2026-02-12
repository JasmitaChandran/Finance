from __future__ import annotations

from fastapi import APIRouter

from app.services.stock_service import stock_service

router = APIRouter(prefix="/compare", tags=["compare"])


@router.get("")
async def compare(symbols: str):
    tokens = [item.strip().upper() for item in symbols.split(",") if item.strip()][:4]
    data = []
    for symbol in tokens:
        dashboard = await stock_service.dashboard(symbol)
        ratios = dashboard["ratios"]
        data.append(
            {
                "symbol": symbol,
                "name": dashboard["quote"].get("name"),
                "price": dashboard["quote"].get("price"),
                "market_cap": dashboard["quote"].get("market_cap"),
                "pe": ratios.get("pe"),
                "roe": ratios.get("roe"),
                "revenue_growth": ratios.get("revenue_growth"),
                "profit_margin": ratios.get("profit_margin"),
            }
        )

    return {"items": data}
