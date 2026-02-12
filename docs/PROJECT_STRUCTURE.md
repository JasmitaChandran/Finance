# Project Structure

```
.
├── apps
│   ├── api
│   │   ├── app
│   │   │   ├── api/v1/endpoints   # Route handlers (auth, stocks, screener, compare, watchlist, portfolio, alerts, learning)
│   │   │   ├── core               # Config, DB, cache, security, rate limiting
│   │   │   ├── models             # SQLAlchemy entities
│   │   │   ├── schemas            # Request/response contracts
│   │   │   ├── services           # Business logic + provider abstraction + AI
│   │   │   └── main.py            # FastAPI app + startup lifecycle
│   │   └── pyproject.toml
│   └── web
│       ├── app                    # Next.js App Router pages
│       ├── components             # UI + interactive modules
│       ├── lib                    # API client, type contracts, format helpers
│       └── public                 # PWA manifest
├── docs
│   ├── API_DESIGN.md
│   ├── DATABASE_SCHEMA.md
│   ├── DEPLOYMENT.md
│   ├── PROJECT_STRUCTURE.md
│   ├── SCALABILITY.md
│   └── SECURITY.md
├── infra
│   └── db/schema.sql
├── .env.example
├── docker-compose.yml
└── README.md
```

## Architectural Layers

- `Route layer`: validates request shape and user context.
- `Service layer`: implements business logic, AI summaries, and data orchestration.
- `Provider layer`: integrates stock APIs in fallback sequence (Yahoo -> FMP -> Alpha Vantage).
- `Persistence layer`: PostgreSQL entities for users, watchlists, portfolios, and alerts.
- `Caching layer`: Redis first, in-memory fallback.

## Why this layout works

- Keeps backend stateless and horizontally scalable.
- Makes API provider swap easy without breaking frontend.
- Supports beginner/pro UX experiments without backend rewrites.
