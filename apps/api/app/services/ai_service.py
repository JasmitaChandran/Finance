from __future__ import annotations

import json

from openai import OpenAI

from app.core.config import settings
from app.utils.finance_terms import FINANCE_TERM_HINTS


class AIService:
    def __init__(self) -> None:
        self.client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    async def explain_metric(self, metric: str, value: float | None = None, symbol: str | None = None) -> dict:
        key = metric.lower().replace("/", "_")
        hint = FINANCE_TERM_HINTS.get(key)

        if self.client:
            prompt = (
                "Explain the following stock metric for beginners in plain language. "
                "Return JSON with keys: title, simple_explanation, analogy, what_good_looks_like, caution, formula, unit. "
                f"Metric: {metric}, Value: {value}, Symbol: {symbol}."
            )
            response = self.client.responses.create(model=settings.openai_model, input=prompt)
            text = response.output_text
            try:
                return json.loads(text)
            except Exception:
                pass

        if not hint:
            hint = {
                "name": metric,
                "simple": "This metric helps evaluate business health and valuation.",
                "analogy": "Think of it as a dashboard signal rather than a single final verdict.",
                "formula": "Formula varies by metric family.",
                "unit": "Contextual",
            }

        return {
            "title": hint["name"],
            "simple_explanation": hint["simple"],
            "analogy": hint["analogy"],
            "what_good_looks_like": "Healthy values depend on industry and trend, not one-time numbers.",
            "caution": "Always combine this with growth, debt, and competitive position.",
            "formula": hint.get("formula"),
            "unit": hint.get("unit"),
        }

    async def stock_summary(self, symbol: str, dashboard: dict, mode: str = "beginner") -> dict:
        if self.client:
            prompt = (
                "You are an investment education assistant. Return JSON with keys: "
                "eli15_summary, bull_case, bear_case, risk_level, suitable_for. "
                f"Symbol: {symbol}. Mode: {mode}. Dashboard data: {dashboard}"
            )
            response = self.client.responses.create(model=settings.openai_model, input=prompt)
            text = response.output_text
            try:
                return json.loads(text)
            except Exception:
                pass

        price = dashboard.get("quote", {}).get("price")
        pe = dashboard.get("ratios", {}).get("pe")
        growth = dashboard.get("ratios", {}).get("revenue_growth")
        risk = "Medium"
        if pe and pe > 45:
            risk = "High"
        elif pe and pe < 18:
            risk = "Low"

        suitable_for = ["Long-term"]
        if risk == "Low":
            suitable_for.append("Beginner")
        else:
            suitable_for.append("High-risk investor")

        return {
            "eli15_summary": (
                f"{symbol.upper()} is a business you can buy a small piece of. "
                f"Its current market price is around {price}."
            ),
            "bull_case": "Revenue momentum and consistent business execution can support upside.",
            "bear_case": "Valuation can compress quickly if growth slows or margins weaken.",
            "risk_level": risk,
            "suitable_for": suitable_for,
        }

    async def tutor_answer(self, question: str) -> dict:
        if self.client:
            prompt = (
                "Answer this finance-learning question for a beginner. Keep under 140 words and include a real-world analogy. "
                f"Question: {question}"
            )
            response = self.client.responses.create(model=settings.openai_model, input=prompt)
            return {"answer": response.output_text}

        return {
            "answer": (
                "Think of investing like planting different crops, not one plant. "
                "Diversify, invest steadily, and focus on business quality instead of daily price noise."
            )
        }


ai_service = AIService()
