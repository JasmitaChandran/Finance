from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.screener_service import screener_service

router = APIRouter(prefix="/screener", tags=["screener"])


class ScreenerRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    min_market_cap: float | None = None
    max_market_cap: float | None = None
    min_pe: float | None = None
    max_pe: float | None = None
    min_roe: float | None = None
    min_revenue_growth: float | None = None
    max_debt_to_equity: float | None = None
    min_rsi: float | None = None
    max_rsi: float | None = None
    min_beta: float | None = None
    max_beta: float | None = None
    min_sharpe_ratio: float | None = None
    max_drawdown_5y_max: float | None = None
    max_volatility_percentile: float | None = Field(default=None, ge=0, le=100)
    min_rolling_beta: float | None = None
    max_rolling_beta: float | None = None
    fcf_positive_5y: bool = False
    debt_decreasing_trend: bool = False
    roic_gt_wacc: bool = False
    min_earnings_consistency: float | None = Field(default=None, ge=0, le=100)
    min_revenue_cagr_3y: float | None = None
    min_eps_cagr_5y: float | None = None
    operating_leverage_improving: bool = False
    breakout_only: bool = False
    volume_spike_only: bool = False
    magic_formula_only: bool = False
    low_volatility_only: bool = False
    high_momentum_only: bool = False
    dividend_aristocrats_only: bool = False
    insider_buying_only: bool = False
    sort_by: str = "score"
    sort_order: str = "desc"
    universe_limit: int = Field(default=220, ge=50, le=1200)
    limit: int = Field(default=120, ge=10, le=500)


@router.post("/run")
async def run_screener(payload: ScreenerRequest):
    filters = payload.model_dump()
    symbols = filters.pop("symbols")
    result = await screener_service.run(symbols=symbols, filters=filters)
    return result


@router.get("/presets")
def presets():
    return {
        "items": [
            {
                "id": "quality-compounders",
                "label": "Quality Compounders",
                "for": "High quality, consistent compounders with healthy profitability and balance sheets.",
                "filters": {
                    "min_market_cap": 10000000000,
                    "min_pe": 8,
                    "max_pe": 35,
                    "min_roe": 0.12,
                    "min_revenue_growth": 0.05,
                    "max_debt_to_equity": 1.2,
                    "low_volatility_only": True,
                    "fcf_positive_5y": True,
                    "min_earnings_consistency": 80,
                },
            },
            {
                "id": "deep-value",
                "label": "Deep Value",
                "for": "Low valuation names with acceptable balance-sheet strength and downside control.",
                "filters": {
                    "min_market_cap": 5000000000,
                    "min_pe": 3,
                    "max_pe": 16,
                    "min_roe": 0.08,
                    "max_debt_to_equity": 1.6,
                    "magic_formula_only": True,
                    "min_sharpe_ratio": 0.3,
                },
            },
            {
                "id": "high-momentum",
                "label": "High Momentum",
                "for": "Trend-following screen focused on strong price leadership and breakouts.",
                "filters": {
                    "min_market_cap": 2000000000,
                    "min_revenue_growth": 0.08,
                    "high_momentum_only": True,
                    "breakout_only": True,
                    "volume_spike_only": True,
                    "min_rsi": 50,
                    "max_rsi": 78,
                },
            },
            {
                "id": "turnaround-candidates",
                "label": "Turnaround Candidates",
                "for": "Improving businesses where operating leverage and momentum are turning positive.",
                "filters": {
                    "min_market_cap": 1000000000,
                    "max_pe": 45,
                    "min_roe": 0.03,
                    "min_revenue_growth": 0.02,
                    "operating_leverage_improving": True,
                    "min_rsi": 40,
                },
            },
            {
                "id": "low-beta-defensive",
                "label": "Low Beta Defensive",
                "for": "Lower-volatility and lower-beta companies with stable profitability.",
                "filters": {
                    "min_market_cap": 10000000000,
                    "max_beta": 0.9,
                    "low_volatility_only": True,
                    "min_roe": 0.08,
                    "max_drawdown_5y_max": 45,
                },
            },
            {
                "id": "high-fcf-yield",
                "label": "High FCF Yield",
                "for": "Cash-generating businesses trading at relatively attractive valuations.",
                "filters": {
                    "min_market_cap": 3000000000,
                    "max_pe": 28,
                    "min_roe": 0.1,
                    "fcf_positive_5y": True,
                    "debt_decreasing_trend": True,
                },
            },
            {
                "id": "small-cap-multibagger",
                "label": "Small Cap Multibagger",
                "for": "Smaller companies with strong growth and improving quality indicators.",
                "filters": {
                    "min_market_cap": 300000000,
                    "max_market_cap": 12000000000,
                    "min_revenue_growth": 0.15,
                    "min_revenue_cagr_3y": 0.12,
                    "min_eps_cagr_5y": 0.1,
                    "high_momentum_only": True,
                },
            },
            {
                "id": "earnings-breakout",
                "label": "Earnings Breakout",
                "for": "Revenue and EPS acceleration with improving operating leverage and momentum.",
                "filters": {
                    "min_market_cap": 2000000000,
                    "min_revenue_growth": 0.1,
                    "min_revenue_cagr_3y": 0.08,
                    "min_eps_cagr_5y": 0.08,
                    "operating_leverage_improving": True,
                    "volume_spike_only": True,
                    "high_momentum_only": True,
                },
            },
            {
                "id": "high-growth",
                "label": "High Growth",
                "for": "High-risk users seeking aggressive growth and strong recent momentum.",
                "filters": {
                    "min_market_cap": 2000000000,
                    "max_pe": 90,
                    "min_roe": 0.08,
                    "min_revenue_growth": 0.15,
                    "high_momentum_only": True,
                    "breakout_only": True,
                },
            },
            {
                "id": "dividend-aristocrats",
                "label": "Dividend Aristocrats (Proxy)",
                "for": "Income-oriented users",
                "filters": {
                    "min_market_cap": 10000000000,
                    "min_roe": 0.08,
                    "max_debt_to_equity": 1.4,
                    "dividend_aristocrats_only": True,
                    "low_volatility_only": True,
                },
            },
            {
                "id": "insider-buying",
                "label": "Insider Buying",
                "for": "Signal-driven users",
                "filters": {
                    "min_market_cap": 2000000000,
                    "min_roe": 0.05,
                    "insider_buying_only": True,
                    "high_momentum_only": True,
                },
            },
            {
                "id": "volume-breakout",
                "label": "Volume Breakouts",
                "for": "Swing setups",
                "filters": {
                    "breakout_only": True,
                    "volume_spike_only": True,
                    "min_rsi": 45,
                    "max_rsi": 75,
                    "high_momentum_only": True,
                },
            },
        ]
    }
