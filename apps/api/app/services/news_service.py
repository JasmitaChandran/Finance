from __future__ import annotations

import asyncio

import yfinance as yf

from app.core.config import settings
from app.services.ai_service import ai_service

POSITIVE_WORDS = {"beats", "surge", "growth", "strong", "record", "upgrade", "profit"}
NEGATIVE_WORDS = {"miss", "fall", "weak", "downgrade", "loss", "lawsuit", "cut"}


class NewsService:
    def _extract_article(self, item: dict) -> dict:
        content = item.get("content") or {}
        provider = content.get("provider") or {}
        click = content.get("clickThroughUrl") or {}
        canonical = content.get("canonicalUrl") or {}

        title = item.get("title") or content.get("title") or ""
        summary = item.get("summary") or content.get("summary") or content.get("description") or ""

        return {
            "title": title,
            "publisher": item.get("publisher") or provider.get("displayName"),
            "link": item.get("link") or click.get("url") or canonical.get("url"),
            "published": item.get("providerPublishTime") or content.get("pubDate") or content.get("displayTime"),
            "summary": summary,
        }

    async def fetch_news(self, symbol: str) -> list[dict]:
        ticker = yf.Ticker(symbol)
        items = await asyncio.to_thread(lambda: ticker.news or [])
        parsed = []
        for item in items[:15]:
            article = self._extract_article(item)
            if article["title"] or article["summary"]:
                parsed.append(article)
            if len(parsed) >= 10:
                break
        return parsed

    def sentiment(self, articles: list[dict]) -> str:
        score = 0
        for article in articles:
            text = f"{article.get('title', '')} {article.get('summary', '')}".lower()
            score += sum(1 for w in POSITIVE_WORDS if w in text)
            score -= sum(1 for w in NEGATIVE_WORDS if w in text)

        if score > 2:
            return "Positive"
        if score < -2:
            return "Negative"
        return "Neutral"

    async def summarize(self, symbol: str) -> dict:
        news = await self.fetch_news(symbol)
        if not news:
            return {
                "symbol": symbol.upper(),
                "bullets": ["No recent news found from free data providers."],
                "sentiment": "Neutral",
                "source_count": 0,
            }

        fallback_bullets = [item["title"].strip() for item in news if item.get("title", "").strip()][:5]

        if ai_service.client:
            try:
                prompt = (
                    "Summarize the following stock news into 3-5 concise bullets for a beginner. "
                    "Return plain text bullets only, each line must contain one complete bullet sentence. "
                    f"Articles: {news}"
                )
                response = ai_service.client.responses.create(input=prompt, model=settings.openai_model)
                parsed = []
                for line in response.output_text.splitlines():
                    cleaned = line.strip().lstrip("-*• ").strip()
                    if cleaned:
                        parsed.append(cleaned)
                bullets = parsed[:5] if parsed else fallback_bullets
            except Exception:
                bullets = fallback_bullets
        else:
            bullets = fallback_bullets

        if not bullets:
            summary_fallback = [item["summary"].strip() for item in news if item.get("summary", "").strip()][:5]
            bullets = summary_fallback or ["News found, but summary extraction failed. Please retry."]

        return {
            "symbol": symbol.upper(),
            "bullets": bullets,
            "sentiment": self.sentiment(news),
            "source_count": len(news),
        }


news_service = NewsService()
