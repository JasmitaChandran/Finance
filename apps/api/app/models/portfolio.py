from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False, default="My Portfolio")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="portfolios")
    positions = relationship("PortfolioPosition", back_populates="portfolio", cascade="all,delete-orphan")


class PortfolioPosition(Base):
    __tablename__ = "portfolio_positions"
    __table_args__ = (UniqueConstraint("portfolio_id", "symbol", name="uq_portfolio_symbol"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    portfolio_id: Mapped[str] = mapped_column(String(36), ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    average_buy_price: Mapped[float] = mapped_column(Float, nullable=False)
    sector: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    portfolio = relationship("Portfolio", back_populates="positions")
