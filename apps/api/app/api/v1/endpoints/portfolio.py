from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.portfolio import Portfolio, PortfolioPosition
from app.models.user import User
from app.schemas.portfolio import AddPositionRequest, CreatePortfolioRequest
from app.services.portfolio_service import portfolio_service
from app.services.stock_service import stock_service

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("")
def list_portfolios(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolios = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "positions": [
                    {
                        "id": pos.id,
                        "symbol": pos.symbol,
                        "quantity": pos.quantity,
                        "average_buy_price": pos.average_buy_price,
                        "sector": pos.sector,
                    }
                    for pos in p.positions
                ],
            }
            for p in portfolios
        ]
    }


@router.post("")
def create_portfolio(payload: CreatePortfolioRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = Portfolio(user_id=user.id, name=payload.name)
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return {"id": portfolio.id, "name": portfolio.name, "positions": []}


@router.post("/{portfolio_id}/positions")
def upsert_position(
    portfolio_id: str,
    payload: AddPositionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user.id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    symbol = payload.symbol.upper()
    pos = db.query(PortfolioPosition).filter(
        PortfolioPosition.portfolio_id == portfolio.id,
        PortfolioPosition.symbol == symbol,
    ).first()

    if not pos:
        pos = PortfolioPosition(
            portfolio_id=portfolio.id,
            symbol=symbol,
            quantity=payload.quantity,
            average_buy_price=payload.average_buy_price,
            sector=payload.sector,
        )
        db.add(pos)
    else:
        pos.quantity = payload.quantity
        pos.average_buy_price = payload.average_buy_price
        pos.sector = payload.sector

    db.commit()
    db.refresh(pos)
    return {
        "id": pos.id,
        "symbol": pos.symbol,
        "quantity": pos.quantity,
        "average_buy_price": pos.average_buy_price,
        "sector": pos.sector,
    }


@router.get("/{portfolio_id}/insights")
async def portfolio_insights(portfolio_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user.id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    holdings = []
    market_value = 0.0
    cost_basis = 0.0

    for pos in portfolio.positions:
        quote = await stock_service.quote(pos.symbol)
        current_price = quote.get("price") or 0.0
        value = current_price * pos.quantity
        cost = pos.average_buy_price * pos.quantity
        market_value += value
        cost_basis += cost
        holdings.append(
            {
                "symbol": pos.symbol,
                "sector": pos.sector,
                "quantity": pos.quantity,
                "average_buy_price": pos.average_buy_price,
                "current_price": current_price,
                "pnl": value - cost,
            }
        )

    insights = portfolio_service.insights(holdings)
    insights.update(
        {
            "portfolio_name": portfolio.name,
            "market_value": round(market_value, 2),
            "cost_basis": round(cost_basis, 2),
            "unrealized_pnl": round(market_value - cost_basis, 2),
            "holdings": holdings,
        }
    )
    return insights
