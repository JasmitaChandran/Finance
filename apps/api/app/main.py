from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.cache import cache
from app.core.config import settings
from app.core.database import Base, engine
from app.core.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    await cache.connect()
    yield
    await cache.close()


app = FastAPI(
    title="Lumina API",
    version="1.0.0",
    description="AI-first stock analytics API for beginner and pro users.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware, limit=120, window_seconds=60)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.api_v1_prefix)
