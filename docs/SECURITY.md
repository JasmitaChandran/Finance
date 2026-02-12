# Security Best Practices

## Authentication + Authorization

- Email/password authentication with bcrypt hashing (`passlib`).
- Google sign-in supported through token verification.
- JWT access tokens with expiration.
- Route-level ownership checks for watchlists, portfolios, and alerts.

## API Security

- CORS restricted to allowed frontend origins.
- Rate limiting enabled by default.
- Input validation via Pydantic on all public endpoints.

## Secrets + Configuration

- Environment variables only, no hardcoded credentials.
- Rotate `SECRET_KEY` and API keys periodically.
- Use managed secrets in Vercel/Render instead of `.env` files in production.

## Data Protection

- Minimize personal data footprint (email + name only).
- Encrypt transport with HTTPS end-to-end.
- Back up database snapshots via managed provider settings.

## Recommended Next Upgrades

1. Add refresh tokens + token revocation list.
2. Add audit logging for sensitive account actions.
3. Add WAF/bot protection at edge.
4. Add SAST/Dependency scans in CI.
5. Add object-level access tests for all protected endpoints.
