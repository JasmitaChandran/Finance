from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
from app.schemas.auth import (
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.id, expires_delta=timedelta(minutes=settings.access_token_expire_minutes))
    return TokenResponse(access_token=token)


@router.post("/google", response_model=TokenResponse)
def google_sign_in(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=400, detail="Google login not configured")

    try:
        info = id_token.verify_oauth2_token(payload.id_token, Request(), settings.google_client_id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    sub = info.get("sub")
    email = info.get("email")
    name = info.get("name") or "Google User"
    if not sub or not email:
        raise HTTPException(status_code=400, detail="Missing user claims in Google token")

    user = db.query(User).filter((User.google_sub == sub) | (User.email == email)).first()
    if not user:
        user = User(email=email, full_name=name, google_sub=sub)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.google_sub:
        user.google_sub = sub
        db.add(user)
        db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name)
