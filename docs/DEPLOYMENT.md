# Deployment Guide (Free Tier Friendly)

## Recommended Stack

- Frontend: Vercel (free)
- Backend: Render Web Service or Railway (free/low-cost dev)
- PostgreSQL: Neon or Supabase free tier
- Redis: Upstash free tier
- Auth provider support: Google OAuth (free), optional Clerk/Firebase

## 1) Deploy Backend (Render)

1. Create Web Service from repo root.
2. Root directory: `apps/api`.
3. Build command:

```bash
pip install -e .
```

4. Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

5. Set env vars (from `.env.example`):
- `DATABASE_URL` (Neon/Supabase)
- `REDIS_URL` (Upstash Redis URL)
- `SECRET_KEY`
- `ALLOWED_ORIGINS` (your Vercel URL)
- provider keys + OpenAI key if available

## 2) Deploy Frontend (Vercel)

1. Import repo into Vercel.
2. Framework preset: Next.js.
3. Root directory: `apps/web`.
4. Env var:
- `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-domain>/api/v1`

## 3) Database Initialization

Option A: automatic SQLAlchemy table creation on backend startup (already enabled).

Option B: run SQL manually:

```bash
psql "$DATABASE_URL" -f infra/db/schema.sql
```

## 4) Post-deploy Validation

- `GET /health` returns `{ "status": "ok" }`
- Signup/Login works
- Stock dashboard loads for `AAPL`
- Watchlist + portfolio saves persist
- Alert check endpoint returns valid response

## 5) Production Hardening Checklist

- rotate `SECRET_KEY`
- set strict CORS origins
- enforce HTTPS only
- enable external logging (Axiom/Better Stack/Sentry)
- add scheduled worker for `/alerts/check`
