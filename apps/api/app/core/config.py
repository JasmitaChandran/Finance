from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/lumina"
    redis_url: str = "redis://localhost:6379/0"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    alpha_vantage_api_key: str | None = None
    fmp_api_key: str | None = None

    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"

    google_client_id: str | None = None

    resend_api_key: str | None = None
    alerts_from_email: str = "alerts@example.com"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        # In development, allow localhost plus common LAN/private-network origins
        # so frontend can be opened from another local host/device without manual updates.
        if self.env.lower() == "development":
            return (
                r"^https?://("
                r"localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|"
                r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
                r"192\.168\.\d{1,3}\.\d{1,3}|"
                r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|"
                r"[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.local"
                r")(:\d+)?$"
            )
        return None


settings = Settings()
