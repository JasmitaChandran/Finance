from __future__ import annotations

import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.portfolio import Portfolio, PortfolioPosition, PortfolioTransaction
from app.models.user import User
from app.schemas.portfolio import AddPositionRequest, AddTransactionRequest, CreatePortfolioRequest
from app.services.portfolio_service import portfolio_service
from app.services.stock_service import stock_service

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def _owned_portfolio_or_404(db: Session, user_id: str, portfolio_id: str) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _serialize_position(position: PortfolioPosition) -> dict:
    return {
        "id": position.id,
        "symbol": position.symbol,
        "quantity": float(position.quantity),
        "average_buy_price": float(position.average_buy_price),
        "sector": position.sector,
    }


def _serialize_transaction(tx: PortfolioTransaction) -> dict:
    return {
        "id": tx.id,
        "symbol": tx.symbol,
        "side": tx.side,
        "quantity": float(tx.quantity),
        "price": float(tx.price),
        "fee": float(tx.fee),
        "trade_date": tx.trade_date.isoformat(),
        "note": tx.note,
        "created_at": tx.created_at.isoformat() if tx.created_at else "",
    }


@router.get("")
def list_portfolios(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolios = db.query(Portfolio).filter(Portfolio.user_id == user.id).all()
    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "positions": [_serialize_position(pos) for pos in p.positions],
                "transaction_count": len(p.transactions),
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
    portfolio = _owned_portfolio_or_404(db, user.id, portfolio_id)

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
    return _serialize_position(pos)


@router.post("/{portfolio_id}/transactions")
def add_transaction(
    portfolio_id: str,
    payload: AddTransactionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    portfolio = _owned_portfolio_or_404(db, user.id, portfolio_id)
    symbol = payload.symbol.upper()
    side = payload.side.lower()
    trade_date = payload.trade_date or date.today()
    quantity = float(payload.quantity)
    price = float(payload.price)
    fee = float(payload.fee or 0.0)

    position = db.query(PortfolioPosition).filter(
        PortfolioPosition.portfolio_id == portfolio.id,
        PortfolioPosition.symbol == symbol,
    ).first()

    if side == "buy":
        if not position:
            position = PortfolioPosition(
                portfolio_id=portfolio.id,
                symbol=symbol,
                quantity=quantity,
                average_buy_price=((quantity * price) + fee) / quantity,
                sector=payload.sector,
            )
            db.add(position)
        else:
            old_qty = float(position.quantity)
            new_qty = old_qty + quantity
            weighted_cost = (old_qty * float(position.average_buy_price)) + (quantity * price) + fee
            position.quantity = new_qty
            position.average_buy_price = weighted_cost / new_qty if new_qty > 0 else float(position.average_buy_price)
            if payload.sector:
                position.sector = payload.sector
    else:
        if not position or float(position.quantity) <= 0:
            raise HTTPException(status_code=400, detail="Cannot sell: no holding for this symbol.")
        if float(position.quantity) + 1e-9 < quantity:
            raise HTTPException(status_code=400, detail="Cannot sell more than available quantity.")

        remaining = float(position.quantity) - quantity
        if remaining <= 1e-8:
            db.delete(position)
            position = None
        else:
            position.quantity = remaining

    tx = PortfolioTransaction(
        portfolio_id=portfolio.id,
        symbol=symbol,
        side=side,
        quantity=quantity,
        price=price,
        fee=fee,
        trade_date=trade_date,
        note=payload.note,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _serialize_transaction(tx)


@router.get("/{portfolio_id}/transactions")
def list_transactions(
    portfolio_id: str,
    limit: int = Query(default=200, ge=1, le=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    portfolio = _owned_portfolio_or_404(db, user.id, portfolio_id)
    rows = (
        db.query(PortfolioTransaction)
        .filter(PortfolioTransaction.portfolio_id == portfolio.id)
        .order_by(PortfolioTransaction.trade_date.desc(), PortfolioTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"items": [_serialize_transaction(tx) for tx in rows]}


@router.get("/{portfolio_id}/insights")
async def portfolio_insights(portfolio_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = _owned_portfolio_or_404(db, user.id, portfolio_id)

    holdings = []
    tx_rows = (
        db.query(PortfolioTransaction)
        .filter(PortfolioTransaction.portfolio_id == portfolio.id)
        .order_by(PortfolioTransaction.trade_date.asc(), PortfolioTransaction.created_at.asc())
        .all()
    )
    tx_payload = [_serialize_transaction(tx) for tx in tx_rows]

    symbols = {position.symbol for position in portfolio.positions}
    symbols.update(tx.symbol for tx in tx_rows)
    symbols = {symbol for symbol in symbols if symbol}

    quote_by_symbol: dict[str, dict] = {}
    profile_by_symbol: dict[str, dict] = {}
    history_by_symbol: dict[str, list[dict]] = {}

    async def fetch_symbol_bundle(symbol: str):
        quote, profile, history = await asyncio.gather(
            stock_service.quote(symbol),
            stock_service.profile(symbol),
            stock_service.history(symbol, period="1y"),
        )
        return symbol, quote, profile, history

    bundles = await asyncio.gather(*(fetch_symbol_bundle(symbol) for symbol in symbols), return_exceptions=True)
    for result in bundles:
        if isinstance(result, Exception):
            continue
        sym, quote, profile, history = result
        try:
            quote_by_symbol[sym] = quote
            profile_by_symbol[sym] = profile
            history_by_symbol[sym] = history
        except Exception:
            quote_by_symbol[sym] = {}
            profile_by_symbol[sym] = {}
            history_by_symbol[sym] = []

    for position in portfolio.positions:
        quote = quote_by_symbol.get(position.symbol, {})
        profile = profile_by_symbol.get(position.symbol, {})
        current_price = float(quote.get("price") or 0.0)
        value = current_price * float(position.quantity)
        cost = float(position.average_buy_price) * float(position.quantity)
        holdings.append(
            {
                "symbol": position.symbol,
                "sector": position.sector or profile.get("sector"),
                "quantity": float(position.quantity),
                "average_buy_price": float(position.average_buy_price),
                "current_price": current_price,
                "market_value": value,
                "cost_basis": cost,
                "pnl": value - cost,
                "beta": profile.get("beta"),
                "history": history_by_symbol.get(position.symbol, []),
            }
        )

    benchmark_history = []
    try:
        benchmark_history = await stock_service.history("SPY", period="1y")
    except Exception:
        benchmark_history = []

    insights = portfolio_service.insights(holdings, tx_payload, benchmark_history)
    market_value = insights.get("auto_pnl_calculation", {}).get("market_value", 0.0)
    cost_basis = insights.get("auto_pnl_calculation", {}).get("cost_basis", 0.0)
    unrealized = insights.get("auto_pnl_calculation", {}).get("unrealized_pnl", 0.0)
    response_holdings = [
        {
            "symbol": item.get("symbol"),
            "sector": item.get("sector"),
            "quantity": item.get("quantity"),
            "average_buy_price": item.get("average_buy_price"),
            "current_price": item.get("current_price"),
            "market_value": item.get("market_value"),
            "cost_basis": item.get("cost_basis"),
            "pnl": item.get("pnl"),
            "beta": item.get("beta"),
        }
        for item in holdings
    ]
    insights.update(
        {
            "portfolio_name": portfolio.name,
            "market_value": round(float(market_value or 0), 2),
            "cost_basis": round(float(cost_basis or 0), 2),
            "unrealized_pnl": round(float(unrealized or 0), 2),
            "holdings": response_holdings,
            "transactions": tx_payload[-200:],
        }
    )
    return insights
