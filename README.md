# Lumina - AI-Powered Stock Insights Platform

Lumina is a production-oriented stock analysis and financial education platform inspired by Screener/Tickertape, redesigned for beginners without sacrificing pro-level depth.

## Highlights

- Dark premium responsive UI (mobile, tablet, desktop)
- Beginner mode vs Pro mode
- AI metric explainer (plain language + analogy)
- AI stock summary (ELI15, bull/bear case, risk profile)
- AI portfolio insights (diversification score, risk level, rebalance suggestions)
- AI news summarization + sentiment
- Smart screener + compare view + watchlists + alerts
- Learning hub + AI finance tutor
- JWT auth (email/password + Google token flow)
- Stock provider fallback chain (Yahoo -> FMP -> Alpha Vantage)
- Redis caching + in-memory fallback

## Monorepo

- `/Users/I527874/Documents/New project/apps/web` - Next.js + Tailwind frontend
- `/Users/I527874/Documents/New project/apps/api` - FastAPI backend
- `/Users/I527874/Documents/New project/infra/db/schema.sql` - SQL schema
- `/Users/I527874/Documents/New project/docs` - API, deployment, scalability, security, structure docs

## Quick Start

### Prerequisites

- Node.js 16+ (18+ recommended for production builds)
- Python 3.9+
- PostgreSQL + Redis (or local Docker via `docker-compose.yml`)

### 1) Start infra locally (optional)

```bash
docker compose up -d
```

### 2) Backend

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
cp ../../.env.example .env
uvicorn app.main:app --reload --port 8000
```

### 3) Frontend

```bash
cd apps/web
npm install
cp ../../.env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Deliverables Mapping

1. Full project structure: `/Users/I527874/Documents/New project/docs/PROJECT_STRUCTURE.md`
2. Database schema: `/Users/I527874/Documents/New project/docs/DATABASE_SCHEMA.md` + `/Users/I527874/Documents/New project/infra/db/schema.sql`
3. API design: `/Users/I527874/Documents/New project/docs/API_DESIGN.md`
4. Frontend components: `/Users/I527874/Documents/New project/apps/web/components`
5. Deployment guide: `/Users/I527874/Documents/New project/docs/DEPLOYMENT.md`
6. Scalability explanation: `/Users/I527874/Documents/New project/docs/SCALABILITY.md`
7. Security best practices: `/Users/I527874/Documents/New project/docs/SECURITY.md`
