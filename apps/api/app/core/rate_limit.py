from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int = 120, window_seconds: int = 60):
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.requests: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        if request.url.path.endswith("/health"):
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = self.requests[ip]

        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()

        if len(bucket) >= self.limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please retry shortly."},
            )

        bucket.append(now)
        return await call_next(request)
