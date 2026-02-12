from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.alert import Alert
from app.models.user import User
from app.schemas.alert import CreateAlertRequest
from app.services.alert_service import alert_service
from app.services.stock_service import stock_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.user_id == user.id).all()
    return {
        "items": [
            {
                "id": alert.id,
                "symbol": alert.symbol,
                "target_price": alert.target_price,
                "above": alert.above,
                "is_active": alert.is_active,
            }
            for alert in alerts
        ]
    }


@router.post("")
def create_alert(payload: CreateAlertRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = Alert(
        user_id=user.id,
        symbol=payload.symbol.upper(),
        target_price=payload.target_price,
        above=payload.above,
        is_active=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "symbol": item.symbol,
        "target_price": item.target_price,
        "above": item.above,
        "is_active": item.is_active,
    }


@router.delete("/{alert_id}")
def delete_alert(alert_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.user_id == user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"ok": True}


@router.post("/check")
async def check_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = db.query(Alert).filter(Alert.user_id == user.id, Alert.is_active.is_(True)).all()
    triggered = []

    for alert in alerts:
        quote = await stock_service.quote(alert.symbol)
        current_price = quote.get("price") or 0
        condition_met = current_price >= alert.target_price if alert.above else current_price <= alert.target_price

        if condition_met:
            email_result = await alert_service.send_alert_email(
                to_email=user.email,
                symbol=alert.symbol,
                target_price=alert.target_price,
                current_price=current_price,
                above=alert.above,
            )
            triggered.append(
                {
                    "alert_id": alert.id,
                    "symbol": alert.symbol,
                    "target_price": alert.target_price,
                    "current_price": current_price,
                    "email": email_result,
                }
            )

    return {"triggered": triggered, "count": len(triggered)}
