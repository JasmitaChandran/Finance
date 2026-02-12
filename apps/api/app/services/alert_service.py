from __future__ import annotations

from app.core.config import settings


class AlertService:
    async def send_alert_email(self, to_email: str, symbol: str, target_price: float, current_price: float, above: bool) -> dict:
        # Production hook point: integrate Resend/SendGrid/Mailgun free tier.
        if not settings.resend_api_key:
            return {
                "queued": False,
                "message": "Email provider not configured. Alert condition can still be tracked via API polling."
            }

        direction = "above" if above else "below"
        return {
            "queued": True,
            "message": f"Alert email would be sent to {to_email}: {symbol} moved {direction} {target_price} (now {current_price})."
        }


alert_service = AlertService()
