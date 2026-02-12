# API Design (v1)

Base URL: `http://localhost:8000/api/v1`

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `GET /auth/me`

Returns JWT bearer token. Use `Authorization: Bearer <token>` for protected routes.

## Stocks + AI

- `GET /stocks/search?q=AAPL`
- `GET /stocks/{symbol}/quote`
- `GET /stocks/{symbol}/profile`
- `GET /stocks/{symbol}/history?period=6mo`
- `GET /stocks/{symbol}/dashboard`
- `POST /stocks/explain-metric`
- `POST /stocks/summary`

### Example `POST /stocks/explain-metric`

```json
{
  "metric": "pe",
  "value": 32.6,
  "symbol": "AAPL"
}
```

## Screener + Compare

- `POST /screener/run`
- `GET /screener/presets`
- `GET /compare?symbols=AAPL,MSFT,NVDA`

## Watchlists

- `GET /watchlists`
- `POST /watchlists`
- `POST /watchlists/{watchlist_id}/items`
- `DELETE /watchlists/{watchlist_id}/items/{item_id}`
- `GET /watchlists/{watchlist_id}/quotes`

## Portfolios

- `GET /portfolios`
- `POST /portfolios`
- `POST /portfolios/{portfolio_id}/positions`
- `GET /portfolios/{portfolio_id}/insights`

## Alerts

- `GET /alerts`
- `POST /alerts`
- `DELETE /alerts/{alert_id}`
- `POST /alerts/check`

`POST /alerts/check` supports manual trigger; in production run it from a job scheduler.

## Learning

- `GET /learning/lessons`
- `POST /learning/tutor`

## Health

- `GET /health`

## Reliability Patterns

- Stock providers use fallback chain (Yahoo => FMP => Alpha Vantage).
- Cached reads reduce API quotas and latency.
- Rate limiter prevents abuse spikes.
