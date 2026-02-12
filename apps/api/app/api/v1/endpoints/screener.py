from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.screener_service import screener_service

router = APIRouter(prefix="/screener", tags=["screener"])


class ScreenerRequest(BaseModel):
    symbols: list[str]
    min_market_cap: float | None = None
    max_pe: float | None = None
    min_roe: float | None = None
    min_revenue_growth: float | None = None


@router.post("/run")
async def run_screener(payload: ScreenerRequest):
    filters = payload.model_dump()
    symbols = filters.pop("symbols")
    items = await screener_service.run(symbols=symbols, filters=filters)
    return {"items": items}


@router.get("/presets")
def presets():
    return {
        "items": [
            {
                "id": "safe-compounders",
                "label": "Safe Compounders",
                "for": "Beginner long-term",
                "filters": {
                    "min_market_cap": 10000000000,
                    "max_pe": 35,
                    "min_roe": 0.12,
                    "min_revenue_growth": 0.05,
                },
            },
            {
                "id": "value-hunters",
                "label": "Value Hunters",
                "for": "Moderate risk",
                "filters": {
                    "min_market_cap": 5000000000,
                    "max_pe": 20,
                    "min_roe": 0.10,
                    "min_revenue_growth": 0.03,
                },
            },
            {
                "id": "high-growth",
                "label": "High Growth",
                "for": "High-risk users",
                "filters": {
                    "min_market_cap": 2000000000,
                    "max_pe": 70,
                    "min_roe": 0.08,
                    "min_revenue_growth": 0.15,
                },
            },
        ]
    }
