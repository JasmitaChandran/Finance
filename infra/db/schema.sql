CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255),
    google_sub VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlists (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id VARCHAR(36) PRIMARY KEY,
    watchlist_id VARCHAR(36) NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol VARCHAR(16) NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_watchlist_symbol UNIQUE (watchlist_id, symbol)
);

CREATE TABLE IF NOT EXISTS portfolios (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
    id VARCHAR(36) PRIMARY KEY,
    portfolio_id VARCHAR(36) NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol VARCHAR(16) NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    average_buy_price DOUBLE PRECISION NOT NULL,
    sector VARCHAR(120),
    CONSTRAINT uq_portfolio_symbol UNIQUE (portfolio_id, symbol)
);

CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(16) NOT NULL,
    target_price DOUBLE PRECISION NOT NULL,
    above BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_symbol ON watchlist_items(symbol);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol ON portfolio_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
