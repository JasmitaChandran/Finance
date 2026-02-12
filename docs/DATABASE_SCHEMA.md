# Database Schema

Primary schema is in `/Users/I527874/Documents/New project/infra/db/schema.sql`.

## Core Tables

1. `users`
- `id` (UUID string, PK)
- `email` (unique)
- `full_name`
- `password_hash` (nullable for Google-only users)
- `google_sub` (unique, nullable)
- `created_at`

2. `watchlists`
- `id` (PK)
- `user_id` (FK -> `users.id`)
- `name`
- `created_at`

3. `watchlist_items`
- `id` (PK)
- `watchlist_id` (FK -> `watchlists.id`)
- `symbol`
- `added_at`
- Unique constraint: (`watchlist_id`, `symbol`)

4. `portfolios`
- `id` (PK)
- `user_id` (FK -> `users.id`)
- `name`
- `created_at`

5. `portfolio_positions`
- `id` (PK)
- `portfolio_id` (FK -> `portfolios.id`)
- `symbol`
- `quantity`
- `average_buy_price`
- `sector`
- Unique constraint: (`portfolio_id`, `symbol`)

6. `alerts`
- `id` (PK)
- `user_id` (FK -> `users.id`)
- `symbol`
- `target_price`
- `above` (boolean threshold direction)
- `is_active`
- `created_at`

## Data Modeling Notes

- UUID-style string IDs simplify distributed writes and client-side temporary IDs.
- User-linked resources enforce ownership in every CRUD endpoint.
- Symbol indexes optimize quote/alert/watchlist lookups.
- Alert table is scheduler-compatible for future worker-based periodic checks.
