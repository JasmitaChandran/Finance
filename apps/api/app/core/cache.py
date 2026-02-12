from __future__ import annotations

import json
import time
from collections.abc import Awaitable, Callable

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover
    Redis = None

from app.core.config import settings


class MemoryTTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, str]] = {}

    async def get(self, key: str) -> dict | list | str | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            self._store.pop(key, None)
            return None
        return json.loads(value)

    async def set(self, key: str, value: dict | list | str, ttl_seconds: int) -> None:
        self._store[key] = (time.time() + ttl_seconds, json.dumps(value))


class CacheClient:
    def __init__(self) -> None:
        self._memory = MemoryTTLCache()
        self._redis = None

    async def connect(self) -> None:
        if Redis is None:
            return
        try:
            client = Redis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            self._redis = client
        except Exception:
            self._redis = None

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()

    async def get(self, key: str):
        if self._redis:
            try:
                value = await self._redis.get(key)
                return json.loads(value) if value else None
            except Exception:
                pass
        return await self._memory.get(key)

    async def set(self, key: str, value: dict | list | str, ttl_seconds: int = 300) -> None:
        serialized = json.dumps(value)
        if self._redis:
            try:
                await self._redis.set(name=key, value=serialized, ex=ttl_seconds)
                return
            except Exception:
                pass
        await self._memory.set(key, value, ttl_seconds)

    async def remember(
        self,
        key: str,
        producer: Callable[[], Awaitable[dict | list | str]],
        ttl_seconds: int = 300,
    ):
        cached = await self.get(key)
        if cached is not None:
            return cached
        fresh = await producer()
        await self.set(key, fresh, ttl_seconds)
        return fresh


cache = CacheClient()
