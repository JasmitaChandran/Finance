from __future__ import annotations

import asyncio
import math
import re
from datetime import datetime, timezone
from typing import Any

import httpx
import yfinance as yf

from app.core.cache import cache
from app.core.config import settings
from app.services.ai_service import ai_service
from app.services.news_service import news_service
from app.services.stock_service import stock_service

POSITIVE_TERMS = {
    "beat",
    "beats",
    "growth",
    "strong",
    "record",
    "upgrade",
    "bullish",
    "profit",
    "surge",
    "expansion",
    "momentum",
}
NEGATIVE_TERMS = {
    "miss",
    "weak",
    "downgrade",
    "loss",
    "lawsuit",
    "fraud",
    "cut",
    "decline",
    "slowdown",
    "risk",
    "bearish",
}


class SmartInsightsService:
    def _as_number(self, value) -> float | None:
        try:
            number = float(value)
            if math.isfinite(number):
                return number
        except Exception:
            return None
        return None

    def _safe_div(self, numerator, denominator) -> float | None:
        num = self._as_number(numerator)
        den = self._as_number(denominator)
        if num is None or den is None or den == 0:
            return None
        return num / den

    def _normalize_rate(self, value) -> float | None:
        numeric = self._as_number(value)
        if numeric is None:
            return None
        if abs(numeric) > 2:
            return numeric / 100
        return numeric

    def _pct_change(self, latest, previous) -> float | None:
        cur = self._as_number(latest)
        prev = self._as_number(previous)
        if cur is None or prev is None or prev == 0:
            return None
        return ((cur - prev) / abs(prev)) * 100

    def _round(self, value, digits: int = 2):
        numeric = self._as_number(value)
        if numeric is None:
            return None
        return round(numeric, digits)

    def _annualized_volatility(self, history: list[dict]) -> float | None:
        closes = [self._as_number(row.get("close")) for row in history if isinstance(row, dict)]
        closes = [value for value in closes if value is not None and value > 0]
        if len(closes) < 22:
            return None

        returns = []
        for i in range(1, len(closes)):
            if closes[i - 1] == 0:
                continue
            returns.append((closes[i] - closes[i - 1]) / closes[i - 1])
        if len(returns) < 20:
            return None

        mean = sum(returns) / len(returns)
        variance = sum((item - mean) ** 2 for item in returns) / len(returns)
        return math.sqrt(variance) * math.sqrt(252) * 100

    def _extract_financial_values(self, dashboard: dict) -> tuple[dict, dict]:
        financials = dashboard.get("financial_statements") or {}
        years_raw = financials.get("years") if isinstance(financials, dict) else []
        years = [str(year) for year in years_raw if year is not None]
        latest_year = years[0] if years else None
        previous_year = years[1] if len(years) > 1 else None

        latest = stock_service._extract_statement_values(financials, latest_year) if latest_year else {}
        previous = stock_service._extract_statement_values(financials, previous_year) if previous_year else {}
        latest["year"] = latest_year
        previous["year"] = previous_year
        return latest, previous

    def _risk_analysis(self, dashboard: dict) -> dict:
        ratio_dashboard = dashboard.get("ratio_dashboard") or {}
        solvency = ratio_dashboard.get("solvency") or {}
        profitability = ratio_dashboard.get("profitability") or {}
        altman = ratio_dashboard.get("altman_z_score") or {}
        piotroski = ratio_dashboard.get("piotroski_f_score") or {}

        history = dashboard.get("history") or []
        volatility = self._annualized_volatility(history)
        beta = self._as_number((dashboard.get("market_data") or {}).get("beta"))
        debt_to_equity = self._as_number(solvency.get("debt_to_equity"))
        if debt_to_equity is None:
            debt_to_equity = self._normalize_rate((dashboard.get("ratios") or {}).get("debt_to_equity"))
        margin = self._normalize_rate(profitability.get("net_margin"))
        growth = self._normalize_rate((dashboard.get("ratios") or {}).get("revenue_growth"))

        score = 50.0
        factors = []

        if volatility is not None:
            if volatility > 45:
                score += 15
                level = "High"
            elif volatility < 20:
                score -= 8
                level = "Low"
            else:
                level = "Medium"
            factors.append(
                {
                    "factor": "Price volatility",
                    "value": self._round(volatility),
                    "level": level,
                    "detail": "Higher volatility means sharper swings and emotional pressure.",
                }
            )

        if beta is not None:
            if beta > 1.3:
                score += 8
                level = "High"
            elif beta < 0.9:
                score -= 4
                level = "Low"
            else:
                level = "Medium"
            factors.append(
                {
                    "factor": "Market beta",
                    "value": self._round(beta),
                    "level": level,
                    "detail": "Beta above 1 means this stock usually moves more than the overall market.",
                }
            )

        if debt_to_equity is not None:
            if debt_to_equity > 2:
                score += 14
                level = "High"
            elif debt_to_equity > 1:
                score += 6
                level = "Medium"
            else:
                score -= 4
                level = "Low"
            factors.append(
                {
                    "factor": "Leverage",
                    "value": self._round(debt_to_equity),
                    "level": level,
                    "detail": "Higher debt can amplify downside when earnings slow.",
                }
            )

        if margin is not None:
            margin_pct = margin * 100
            if margin_pct < 5:
                score += 10
                level = "High"
            elif margin_pct < 12:
                score += 3
                level = "Medium"
            else:
                score -= 6
                level = "Low"
            factors.append(
                {
                    "factor": "Profit margin",
                    "value": self._round(margin_pct),
                    "level": level,
                    "detail": "Thin margins leave less cushion during weak demand periods.",
                }
            )

        if growth is not None:
            growth_pct = growth * 100
            if growth_pct < 0:
                score += 8
                level = "High"
            elif growth_pct < 5:
                score += 3
                level = "Medium"
            else:
                score -= 4
                level = "Low"
            factors.append(
                {
                    "factor": "Revenue growth",
                    "value": self._round(growth_pct),
                    "level": level,
                    "detail": "Negative or slow top-line growth often increases business risk.",
                }
            )

        zone = str(altman.get("zone") or "Unknown")
        if zone == "Distress":
            score += 14
        elif zone == "Safe":
            score -= 8
        factors.append(
            {
                "factor": "Balance-sheet safety (Altman)",
                "value": zone,
                "level": "High" if zone == "Distress" else "Low" if zone == "Safe" else "Medium",
                "detail": "Altman zone indicates how resilient the balance sheet may be under stress.",
            }
        )

        pio_score = self._as_number(piotroski.get("score"))
        if pio_score is not None:
            if pio_score <= 3:
                score += 10
                level = "High"
            elif pio_score <= 6:
                level = "Medium"
            else:
                score -= 6
                level = "Low"
            factors.append(
                {
                    "factor": "Quality score (Piotroski)",
                    "value": self._round(pio_score),
                    "level": level,
                    "detail": "Higher Piotroski scores indicate stronger operating quality.",
                }
            )

        score = max(0.0, min(100.0, score))
        if score >= 67:
            level = "High"
        elif score >= 35:
            level = "Medium"
        else:
            level = "Low"

        if level == "High":
            explanation = (
                "This stock currently carries elevated risk. Expect bigger price swings and higher dependence on execution."
            )
        elif level == "Medium":
            explanation = (
                "Risk looks balanced. The business has strengths, but there are still areas that need close monitoring."
            )
        else:
            explanation = (
                "Risk appears relatively controlled versus peers, though no stock is risk-free."
            )

        return {
            "risk_score": self._round(score),
            "risk_level": level,
            "explanation": explanation,
            "factors": factors,
        }

    def _fraud_signals(self, dashboard: dict) -> dict:
        latest, previous = self._extract_financial_values(dashboard)

        revenue = latest.get("revenue")
        prev_revenue = previous.get("revenue")
        receivables = latest.get("receivables")
        prev_receivables = previous.get("receivables")
        net_income = latest.get("net_income")
        operating_cf = latest.get("operating_cash_flow")
        total_assets = latest.get("total_assets")
        debt = latest.get("long_term_debt")
        prev_debt = previous.get("long_term_debt")
        shares = latest.get("shares_outstanding")
        prev_shares = previous.get("shares_outstanding")
        gross_profit = latest.get("gross_profit")
        prev_gross_profit = previous.get("gross_profit")

        revenue_growth = self._pct_change(revenue, prev_revenue)
        receivables_growth = self._pct_change(receivables, prev_receivables)
        debt_growth = self._pct_change(debt, prev_debt)
        share_growth = self._pct_change(shares, prev_shares)
        gross_margin = self._safe_div(gross_profit, revenue)
        prev_gross_margin = self._safe_div(prev_gross_profit, prev_revenue)
        margin_delta = None
        if gross_margin is not None and prev_gross_margin is not None:
            margin_delta = (gross_margin - prev_gross_margin) * 100

        accrual_ratio = None
        if net_income is not None and operating_cf is not None and total_assets not in (None, 0):
            accrual_ratio = (net_income - operating_cf) / total_assets

        checks = []
        risk_points = 0

        def add_signal(name: str, value, threshold: str, triggered: bool, severity: str, detail: str):
            nonlocal risk_points
            if triggered:
                risk_points += 16 if severity == "high" else 8
            checks.append(
                {
                    "name": name,
                    "value": self._round(value),
                    "threshold": threshold,
                    "triggered": triggered,
                    "severity": severity,
                    "detail": detail,
                }
            )

        add_signal(
            "Accrual quality",
            accrual_ratio * 100 if accrual_ratio is not None else None,
            "> 8%",
            bool(accrual_ratio is not None and accrual_ratio > 0.08),
            "high",
            "When earnings rise faster than cash generation, quality can be weaker.",
        )
        add_signal(
            "Cash flow vs net income",
            self._safe_div(operating_cf, net_income) * 100 if self._safe_div(operating_cf, net_income) is not None else None,
            "< 70%",
            bool(operating_cf is not None and net_income is not None and net_income > 0 and operating_cf < net_income * 0.7),
            "high",
            "A large gap between accounting profit and operating cash flow can be a red flag.",
        )
        add_signal(
            "Receivables growth vs revenue growth",
            (receivables_growth - revenue_growth) if receivables_growth is not None and revenue_growth is not None else None,
            "> 15 pts",
            bool(revenue_growth is not None and receivables_growth is not None and receivables_growth - revenue_growth > 15),
            "medium",
            "Receivables growing much faster than sales may indicate aggressive revenue recognition.",
        )
        add_signal(
            "Leverage jump",
            debt_growth,
            "> 30%",
            bool(debt_growth is not None and debt_growth > 30),
            "medium",
            "Fast debt expansion can hide cash pressure or over-aggressive growth.",
        )
        add_signal(
            "Gross margin deterioration",
            margin_delta,
            "< -5 pts",
            bool(margin_delta is not None and margin_delta < -5),
            "medium",
            "Large margin compression can indicate pricing pressure or accounting noise.",
        )
        add_signal(
            "Share dilution",
            share_growth,
            "> 5%",
            bool(share_growth is not None and share_growth > 5),
            "medium",
            "Rising share count may dilute existing investors and mask per-share weakness.",
        )

        risk_points = max(0, min(100, risk_points))
        if risk_points >= 50:
            risk_level = "High"
        elif risk_points >= 24:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        return {
            "risk_score": risk_points,
            "risk_level": risk_level,
            "signals": checks,
            "summary": (
                "Signals suggest elevated accounting-risk conditions."
                if risk_level == "High"
                else "Signals are mixed; monitor upcoming results carefully."
                if risk_level == "Medium"
                else "No major accounting-risk patterns detected in available data."
            ),
        }

    async def _earnings_history(self, symbol: str) -> list[dict]:
        ticker = yf.Ticker(symbol)
        try:
            frame = await asyncio.to_thread(lambda: ticker.earnings_dates)
        except Exception:
            frame = None

        rows = []
        if frame is None or getattr(frame, "empty", True):
            return rows

        for idx, row in frame.head(16).iterrows():
            estimate = self._as_number(row.get("EPS Estimate"))
            actual = self._as_number(row.get("Reported EPS"))
            surprise = self._as_number(row.get("Surprise(%)"))
            if surprise is None and estimate not in (None, 0) and actual is not None:
                surprise = ((actual - estimate) / abs(estimate)) * 100
            date_value = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            if estimate is None and actual is None and surprise is None:
                continue
            rows.append(
                {
                    "date": date_value,
                    "estimated_eps": estimate,
                    "reported_eps": actual,
                    "surprise_percent": surprise,
                }
            )

        return rows

    def _earnings_surprise_probability(self, earnings_rows: list[dict], dashboard: dict) -> dict:
        observed = [
            row
            for row in earnings_rows
            if row.get("surprise_percent") is not None
            or (row.get("estimated_eps") is not None and row.get("reported_eps") is not None)
        ]

        if observed:
            surprises = []
            beats = 0
            for row in observed[:8]:
                surprise = self._as_number(row.get("surprise_percent"))
                if surprise is None:
                    estimate = self._as_number(row.get("estimated_eps"))
                    actual = self._as_number(row.get("reported_eps"))
                    if estimate not in (None, 0) and actual is not None:
                        surprise = ((actual - estimate) / abs(estimate)) * 100
                if surprise is None:
                    continue
                surprises.append(surprise)
                if surprise > 0:
                    beats += 1

            if surprises:
                beat_rate = beats / len(surprises)
                avg_surprise = sum(surprises) / len(surprises)
                surprise_strength = max(-0.5, min(0.5, avg_surprise / 20))
                probability = 50 + (beat_rate - 0.5) * 40 + surprise_strength * 20
                probability = max(5, min(95, probability))
                confidence = min(95, 40 + len(surprises) * 7)
                return {
                    "beat_probability": self._round(probability),
                    "miss_probability": self._round(100 - probability),
                    "confidence": self._round(confidence),
                    "sample_quarters": len(surprises),
                    "average_surprise_percent": self._round(avg_surprise),
                    "explanation": "Probability is inferred from historical beat rate and average surprise magnitude.",
                }

        growth = self._normalize_rate((dashboard.get("ratios") or {}).get("revenue_growth")) or 0
        margin = self._normalize_rate((dashboard.get("ratios") or {}).get("profit_margin")) or 0
        fallback_prob = 50 + growth * 30 + margin * 20
        fallback_prob = max(10, min(90, fallback_prob))
        return {
            "beat_probability": self._round(fallback_prob),
            "miss_probability": self._round(100 - fallback_prob),
            "confidence": 35,
            "sample_quarters": 0,
            "average_surprise_percent": None,
            "explanation": "Historical earnings surprise data was limited, so this estimate uses growth and margin quality.",
        }

    def _revenue_series(self, dashboard: dict) -> list[dict]:
        financials = dashboard.get("financial_statements") or {}
        income_block = (financials.get("income_statement") or {}).get("raw") or []
        revenue_row = None
        candidates = {
            "totalrevenue",
            "operatingrevenue",
            "revenue",
            "netsales",
            "sales",
        }
        for row in income_block:
            metric = "".join(ch for ch in str(row.get("metric", "")).lower() if ch.isalnum())
            if metric in candidates:
                revenue_row = row
                break
        if not revenue_row:
            return []

        values = revenue_row.get("values") or {}
        points = []
        for year, raw in values.items():
            numeric = self._as_number(raw)
            if numeric is None:
                continue
            year_str = str(year)[:4]
            if year_str.isdigit():
                points.append({"year": int(year_str), "revenue": numeric})
        points.sort(key=lambda item: item["year"])
        return points

    def _linear_regression(self, x: list[float], y: list[float]) -> tuple[float, float]:
        n = len(x)
        if n == 0:
            return (0.0, 0.0)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(a * b for a, b in zip(x, y))
        sum_xx = sum(a * a for a in x)
        denom = n * sum_xx - sum_x * sum_x
        if denom == 0:
            return (0.0, sum_y / n if n else 0.0)
        slope = (n * sum_xy - sum_x * sum_y) / denom
        intercept = (sum_y - slope * sum_x) / n
        return (slope, intercept)

    def _revenue_forecast_ml(self, dashboard: dict) -> dict:
        history = self._revenue_series(dashboard)
        if len(history) < 3:
            return {
                "model": "Linear trend (fallback)",
                "history": history,
                "forecast": [],
                "r2_score": None,
                "explanation": "Not enough annual revenue points to build a reliable forecast.",
            }

        x = list(range(len(history)))
        revenues = [item["revenue"] for item in history]
        use_log = all(value > 0 for value in revenues)

        if use_log:
            y = [math.log(value) for value in revenues]
            slope, intercept = self._linear_regression(x, y)
            predict = lambda idx: math.exp(intercept + slope * idx)
            model_name = "Log-linear regression"
        else:
            y = revenues
            slope, intercept = self._linear_regression(x, y)
            predict = lambda idx: intercept + slope * idx
            model_name = "Linear regression"

        fitted = [predict(i) for i in x]
        y_mean = sum(revenues) / len(revenues)
        ss_tot = sum((value - y_mean) ** 2 for value in revenues)
        ss_res = sum((actual - fit) ** 2 for actual, fit in zip(revenues, fitted))
        r2 = None if ss_tot == 0 else 1 - (ss_res / ss_tot)

        last_year = history[-1]["year"]
        forecast = []
        for step in range(1, 4):
            year = last_year + step
            value = max(0.0, predict(len(history) - 1 + step))
            forecast.append({"year": year, "revenue": value})

        if history[-1]["revenue"] > 0:
            cagr = ((forecast[-1]["revenue"] / history[-1]["revenue"]) ** (1 / len(forecast)) - 1) * 100
        else:
            cagr = None

        return {
            "model": model_name,
            "history": history,
            "forecast": forecast,
            "r2_score": self._round(r2, 3) if r2 is not None else None,
            "estimated_cagr_percent": self._round(cagr),
            "explanation": "Forecast is generated from historical annual revenue trend using a lightweight regression model.",
        }

    def _sentiment_analysis(self, news_items: list[dict], news_summary: dict) -> dict:
        if not news_items:
            return {
                "label": "Neutral",
                "score": 0,
                "positive_hits": 0,
                "negative_hits": 0,
                "highlights": [],
                "source_count": 0,
            }

        score = 0
        positive_hits = 0
        negative_hits = 0

        headline_scores: list[tuple[int, str]] = []
        for item in news_items:
            text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
            pos = sum(1 for term in POSITIVE_TERMS if term in text)
            neg = sum(1 for term in NEGATIVE_TERMS if term in text)
            positive_hits += pos
            negative_hits += neg
            headline_score = pos - neg
            score += headline_score
            title = item.get("title") or ""
            if title:
                headline_scores.append((headline_score, title.strip()))

        normalized = max(-100, min(100, score * 12))
        if normalized >= 20:
            label = "Positive"
        elif normalized <= -20:
            label = "Negative"
        else:
            label = "Neutral"

        highlights = [title for _, title in sorted(headline_scores, key=lambda entry: abs(entry[0]), reverse=True)[:5]]
        if not highlights:
            highlights = (news_summary.get("bullets") or [])[:5]

        return {
            "label": label,
            "score": normalized,
            "positive_hits": positive_hits,
            "negative_hits": negative_hits,
            "highlights": highlights,
            "source_count": len(news_items),
            "summary_sentiment": news_summary.get("sentiment"),
        }

    def _sma_last(self, closes: list[float], period: int) -> float | None:
        if len(closes) < period:
            return None
        window = closes[-period:]
        return sum(window) / period

    def _rsi_last(self, closes: list[float], period: int = 14) -> float | None:
        if len(closes) <= period:
            return None
        gains = 0.0
        losses = 0.0
        for i in range(1, period + 1):
            delta = closes[i] - closes[i - 1]
            if delta >= 0:
                gains += delta
            else:
                losses += abs(delta)
        avg_gain = gains / period
        avg_loss = losses / period
        for i in range(period + 1, len(closes)):
            delta = closes[i] - closes[i - 1]
            gain = delta if delta > 0 else 0.0
            loss = abs(delta) if delta < 0 else 0.0
            avg_gain = ((avg_gain * (period - 1)) + gain) / period
            avg_loss = ((avg_loss * (period - 1)) + loss) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _buy_sell_probabilities(
        self,
        dashboard: dict,
        risk: dict,
        sentiment: dict,
        earnings_surprise: dict,
    ) -> dict:
        valuation = dashboard.get("valuation_engine") or {}
        dcf_fcff = ((valuation.get("dcf") or {}).get("fcff") or {})
        relative = ((valuation.get("relative_valuation") or {}).get("implied_prices") or {})

        dcf_upside = self._as_number(dcf_fcff.get("upside_percent"))
        relative_upside = self._as_number(relative.get("composite_upside_percent"))

        valuation_score = 0.0
        if dcf_upside is not None:
            valuation_score += max(-1, min(1, dcf_upside / 30))
        if relative_upside is not None:
            valuation_score += max(-1, min(1, relative_upside / 30))
        valuation_score = max(-1, min(1, valuation_score / 2 if (dcf_upside is not None and relative_upside is not None) else valuation_score))

        history = dashboard.get("history") or []
        closes = [self._as_number(row.get("close")) for row in history if isinstance(row, dict)]
        closes = [value for value in closes if value is not None]
        close = closes[-1] if closes else None
        sma20 = self._sma_last(closes, 20) if closes else None
        sma50 = self._sma_last(closes, 50) if closes else None
        rsi = self._rsi_last(closes, 14) if closes else None
        one_month_change = None
        if len(closes) > 22 and closes[-22] != 0:
            one_month_change = ((closes[-1] - closes[-22]) / closes[-22]) * 100

        technical_score = 0.0
        if close is not None and sma20 is not None:
            technical_score += 0.35 if close > sma20 else -0.35
        if close is not None and sma50 is not None:
            technical_score += 0.35 if close > sma50 else -0.35
        if one_month_change is not None:
            technical_score += 0.15 if one_month_change > 0 else -0.15
        if rsi is not None:
            if rsi < 35:
                technical_score += 0.15
            elif rsi > 70:
                technical_score -= 0.15
        technical_score = max(-1, min(1, technical_score))

        sentiment_score = (self._as_number(sentiment.get("score")) or 0) / 100
        earnings_score = ((self._as_number(earnings_surprise.get("beat_probability")) or 50) - 50) / 50
        risk_score = (50 - (self._as_number(risk.get("risk_score")) or 50)) / 50

        raw = (
            valuation_score * 0.32
            + technical_score * 0.26
            + sentiment_score * 0.16
            + earnings_score * 0.14
            + risk_score * 0.12
        )
        raw = max(-1.0, min(1.0, raw))

        hold = max(10.0, min(45.0, 35 - abs(raw) * 20))
        remaining = 100 - hold
        direction = max(0.05, min(0.95, 0.5 + raw / 2))
        buy = remaining * direction
        sell = remaining - buy

        recommendation = "Hold / Watch"
        if buy >= 55:
            recommendation = "Buy Tilt"
        elif sell >= 55:
            recommendation = "Sell Tilt"

        rationale = [
            f"Valuation signal: {self._round(valuation_score, 3)}",
            f"Technical signal: {self._round(technical_score, 3)}",
            f"Sentiment signal: {self._round(sentiment_score, 3)}",
            f"Earnings signal: {self._round(earnings_score, 3)}",
            f"Risk adjustment: {self._round(risk_score, 3)}",
        ]

        return {
            "buy_probability": self._round(buy),
            "sell_probability": self._round(sell),
            "hold_probability": self._round(hold),
            "recommendation": recommendation,
            "confidence": self._round(55 + abs(raw) * 35),
            "rationale": rationale,
        }

    async def _fetch_transcript(self, symbol: str, quarter: str) -> str:
        if not settings.alpha_vantage_api_key:
            return ""

        params = {
            "function": "EARNINGS_CALL_TRANSCRIPT",
            "symbol": symbol.upper(),
            "quarter": quarter,
            "apikey": settings.alpha_vantage_api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.get("https://www.alphavantage.co/query", params=params)
                response.raise_for_status()
                payload = response.json()
        except Exception:
            return ""

        transcript = payload.get("transcript")
        if isinstance(transcript, str) and transcript.strip():
            return transcript.strip()
        return ""

    async def _earnings_call_summary(self, symbol: str, dashboard: dict, earnings_rows: list[dict]) -> dict:
        quarter_token = None
        if earnings_rows:
            first_date = earnings_rows[0].get("date")
            if isinstance(first_date, str) and len(first_date) >= 10:
                try:
                    dt = datetime.fromisoformat(first_date[:10])
                    quarter = (dt.month - 1) // 3 + 1
                    quarter_token = f"{dt.year}Q{quarter}"
                except Exception:
                    quarter_token = None
        if not quarter_token:
            now = datetime.now(timezone.utc)
            quarter = (now.month - 1) // 3 + 1
            quarter_token = f"{now.year}Q{quarter}"

        transcript_cache_key = f"transcript:{symbol.upper()}:{quarter_token}"
        transcript = await cache.remember(
            transcript_cache_key,
            lambda: self._fetch_transcript(symbol, quarter_token),
            ttl_seconds=24 * 3600,
        )

        if transcript:
            transcript_short = transcript[:9000]
            if ai_service.client:
                try:
                    prompt = (
                        "Summarize this earnings call transcript for beginners. "
                        "Return JSON with keys: summary, highlights (array of 3-5 bullets), risk_flags (array). "
                        f"Transcript: {transcript_short}"
                    )
                    response = ai_service.client.responses.create(model=settings.openai_model, input=prompt)
                    text = response.output_text
                    parsed = None
                    try:
                        import json

                        parsed = json.loads(text)
                    except Exception:
                        parsed = None
                    if isinstance(parsed, dict):
                        return {
                            "available": True,
                            "source": "alpha_vantage",
                            "quarter": quarter_token,
                            "summary": parsed.get("summary") or "Transcript summarized successfully.",
                            "highlights": parsed.get("highlights") or [],
                            "risk_flags": parsed.get("risk_flags") or [],
                        }
                except Exception:
                    pass

            sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", transcript_short) if len(sentence.strip()) > 40]
            keywords = ("guidance", "margin", "demand", "cost", "inventory", "risk", "outlook")
            preferred = [item for item in sentences if any(word in item.lower() for word in keywords)]
            bullets = (preferred[:4] or sentences[:4])[:5]
            return {
                "available": True,
                "source": "alpha_vantage",
                "quarter": quarter_token,
                "summary": bullets[0] if bullets else "Transcript found but could not be summarized in detail.",
                "highlights": bullets[:5],
                "risk_flags": [item for item in bullets if any(word in item.lower() for word in ("risk", "uncertain", "pressure", "headwind"))][:3],
            }

        latest, previous = self._extract_financial_values(dashboard)
        revenue_change = self._pct_change(latest.get("revenue"), previous.get("revenue"))
        income_change = self._pct_change(latest.get("net_income"), previous.get("net_income"))
        margin = self._safe_div(latest.get("net_income"), latest.get("revenue"))
        highlights = []
        if revenue_change is not None:
            highlights.append(f"Revenue trend: {self._round(revenue_change)}% YoY.")
        if income_change is not None:
            highlights.append(f"Net income trend: {self._round(income_change)}% YoY.")
        if margin is not None:
            highlights.append(f"Net margin estimate: {self._round(margin * 100)}%.")
        if not highlights:
            highlights = ["Transcript unavailable from free providers and limited earnings metrics were available."]

        return {
            "available": False,
            "source": "fallback_financials",
            "quarter": quarter_token,
            "summary": "Earnings call transcript is not available on current free feeds. Using latest earnings trend instead.",
            "highlights": highlights[:5],
            "risk_flags": [],
        }

    async def build(self, symbol: str) -> dict:
        key = f"smart-insights:{symbol.upper()}"
        return await cache.remember(
            key,
            lambda: self._build(symbol),
            ttl_seconds=900,
        )

    async def _build(self, symbol: str) -> dict:
        dashboard = await stock_service.dashboard(symbol)

        ai_summary_task = ai_service.stock_summary(symbol, dashboard, "beginner")
        news_summary_task = news_service.summarize(symbol)
        news_items_task = news_service.fetch_news(symbol)
        earnings_history_task = self._earnings_history(symbol)

        ai_summary, news_summary, news_items, earnings_rows = await asyncio.gather(
            ai_summary_task,
            news_summary_task,
            news_items_task,
            earnings_history_task,
        )

        risk = self._risk_analysis(dashboard)
        fraud = self._fraud_signals(dashboard)
        earnings_surprise = self._earnings_surprise_probability(earnings_rows, dashboard)
        revenue_forecast = self._revenue_forecast_ml(dashboard)
        sentiment = self._sentiment_analysis(news_items, news_summary)
        transcript_summary = await self._earnings_call_summary(symbol, dashboard, earnings_rows)
        buy_sell = self._buy_sell_probabilities(dashboard, risk, sentiment, earnings_surprise)

        return {
            "symbol": symbol.upper(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "ai_stock_summary": ai_summary,
            "eli15_summary": ai_summary.get("eli15_summary"),
            "earnings_call_transcript_summary": transcript_summary,
            "risk_analysis_plain_english": risk,
            "fraud_detection_signals": fraud,
            "earnings_surprise_probability": earnings_surprise,
            "forecast_revenue_ml": revenue_forecast,
            "sentiment_analysis_from_news": sentiment,
            "buy_sell_probability_score": buy_sell,
        }


smart_insights_service = SmartInsightsService()
