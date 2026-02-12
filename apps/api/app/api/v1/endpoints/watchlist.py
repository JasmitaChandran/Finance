from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.watchlist import Watchlist, WatchlistItem
from app.schemas.watchlist import AddWatchlistItemRequest, CreateWatchlistRequest
from app.services.stock_service import stock_service

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


@router.get("")
def list_watchlists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watchlists = db.query(Watchlist).filter(Watchlist.user_id == user.id).all()
    return {
        "items": [
            {
                "id": w.id,
                "name": w.name,
                "items": [{"id": i.id, "symbol": i.symbol} for i in w.items],
            }
            for w in watchlists
        ]
    }


@router.post("")
def create_watchlist(payload: CreateWatchlistRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watchlist = Watchlist(user_id=user.id, name=payload.name)
    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)
    return {"id": watchlist.id, "name": watchlist.name, "items": []}


@router.post("/{watchlist_id}/items")
def add_item(
    watchlist_id: str,
    payload: AddWatchlistItemRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id, Watchlist.user_id == user.id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    symbol = payload.symbol.upper()
    exists = db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist.id, WatchlistItem.symbol == symbol).first()
    if exists:
        return {"id": exists.id, "symbol": exists.symbol}

    item = WatchlistItem(watchlist_id=watchlist.id, symbol=symbol)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "symbol": item.symbol}


@router.delete("/{watchlist_id}/items/{item_id}")
def remove_item(item_id: str, watchlist_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id, Watchlist.user_id == user.id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    item = db.query(WatchlistItem).filter(WatchlistItem.id == item_id, WatchlistItem.watchlist_id == watchlist.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/{watchlist_id}/quotes")
async def quotes(watchlist_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id, Watchlist.user_id == user.id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    quotes = []
    for item in watchlist.items:
        quotes.append(await stock_service.quote(item.symbol))

    return {"watchlist": watchlist.name, "items": quotes}
