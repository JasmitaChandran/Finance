# Scalability Strategy

## Stateless API

- No session state in memory for auth; JWT tokens keep API instances horizontally scalable.
- Any API node can serve requests behind load balancer.

## Provider Abstraction + Fallback

- Provider chain prevents single external API failure from breaking user flows.
- Add/remove providers with minimal changes in `stock_service`.

## Caching

- Redis-backed read caching for quote/profile/history/search endpoints.
- In-memory fallback preserves partial functionality when Redis is unavailable.
- TTL values tuned by data volatility:
  - quote: 60s
  - search/history: 300s
  - profile: 900s

## Rate Limiting

- Middleware throttles per-IP request bursts.
- Protects free-tier API quotas and backend CPU.

## Frontend Performance

- App Router, small component boundaries, and client-only where needed.
- Chart rendering isolated to chart components.
- Responsive layout with progressive information density.

## Microservice-ready Evolution Path

1. Extract alerts scheduler to worker service.
2. Extract AI summarization to separate inference service.
3. Split market data ingestion and analytics into independent services.
4. Add message queue (e.g., Upstash Kafka/RQ/Celery) for asynchronous jobs.
