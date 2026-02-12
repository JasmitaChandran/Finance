from __future__ import annotations

import math
from typing import Any

from fastapi import HTTPException

from app.core.cache import cache
from app.services.providers.alpha_vantage_provider import AlphaVantageProvider
from app.services.providers.fmp_provider import FMPProvider
from app.services.providers.yahoo_provider import YahooFinanceProvider


class StockService:
    def __init__(self) -> None:
        self.providers = [YahooFinanceProvider(), FMPProvider(), AlphaVantageProvider()]

    def _sanitize_json(self, value):
        if isinstance(value, dict):
            return {k: self._sanitize_json(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self._sanitize_json(v) for v in value]

        # Normalize numpy/pandas scalar values into plain Python scalars when present.
        if hasattr(value, "item") and callable(getattr(value, "item")):
            try:
                return self._sanitize_json(value.item())
            except Exception:
                pass

        if isinstance(value, float) and not math.isfinite(value):
            return None
        return value

    def _is_finite_number(self, value) -> bool:
        try:
            return math.isfinite(float(value))
        except (TypeError, ValueError):
            return False

    def _as_number(self, value):
        if self._is_finite_number(value):
            return float(value)
        return None

    def _change_for_offset(self, history: list[dict], offset_days: int):
        if len(history) <= offset_days:
            return None
        latest = self._as_number(history[-1].get("close"))
        base = self._as_number(history[-1 - offset_days].get("close"))
        if latest is None or base is None or base == 0:
            return None
        return ((latest - base) / base) * 100

    @staticmethod
    def _norm_metric(name: str | None) -> str:
        if not name:
            return ""
        return "".join(ch for ch in str(name).lower() if ch.isalnum())

    def _safe_div(self, numerator, denominator):
        num = self._as_number(numerator)
        den = self._as_number(denominator)
        if num is None or den is None or den == 0:
            return None
        return num / den

    def _normalize_rate(self, value):
        numeric = self._as_number(value)
        if numeric is None:
            return None
        if abs(numeric) > 2:
            return numeric / 100
        return numeric

    def _statement_rows(self, financial_statements: dict[str, Any], section: str) -> list[dict]:
        block = financial_statements.get(section)
        if not isinstance(block, dict):
            return []
        rows = block.get("raw")
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)]

    def _statement_value(self, rows: list[dict], year: str | None, candidates: list[str]):
        if not year:
            return None
        candidate_set = {self._norm_metric(item) for item in candidates}
        for row in rows:
            metric = self._norm_metric(row.get("metric"))
            if metric not in candidate_set:
                continue
            values = row.get("values")
            if not isinstance(values, dict):
                continue
            return self._as_number(values.get(year))
        return None

    def _extract_statement_values(self, financial_statements: dict[str, Any], year: str | None) -> dict[str, float | None]:
        income_rows = self._statement_rows(financial_statements, "income_statement")
        balance_rows = self._statement_rows(financial_statements, "balance_sheet")
        cash_rows = self._statement_rows(financial_statements, "cash_flow")

        values = {
            "revenue": self._statement_value(
                income_rows,
                year,
                ["Total Revenue", "Operating Revenue", "Revenue", "Net Sales", "Sales"],
            ),
            "cost_of_revenue": self._statement_value(
                income_rows,
                year,
                ["Cost Of Revenue", "Cost of Revenue", "Cost Of Goods Sold", "Cost of Goods Sold"],
            ),
            "gross_profit": self._statement_value(income_rows, year, ["Gross Profit"]),
            "operating_income": self._statement_value(
                income_rows,
                year,
                ["Operating Income", "Operating Income Loss"],
            ),
            "ebit": self._statement_value(income_rows, year, ["EBIT", "Ebit"]),
            "ebitda": self._statement_value(income_rows, year, ["EBITDA", "Ebitda"]),
            "interest_expense": self._statement_value(
                income_rows,
                year,
                ["Interest Expense", "Interest Expense Non Operating"],
            ),
            "net_income": self._statement_value(
                income_rows,
                year,
                ["Net Income", "Net Income Common Stockholders", "Net Income Including Noncontrolling Interests"],
            ),
            "total_assets": self._statement_value(balance_rows, year, ["Total Assets"]),
            "current_assets": self._statement_value(balance_rows, year, ["Current Assets", "Total Current Assets"]),
            "current_liabilities": self._statement_value(
                balance_rows,
                year,
                ["Current Liabilities", "Total Current Liabilities"],
            ),
            "cash_and_equivalents": self._statement_value(
                balance_rows,
                year,
                ["Cash And Cash Equivalents", "Cash And Short Term Investments", "Cash", "Cash Cash Equivalents And Short Term Investments"],
            ),
            "inventory": self._statement_value(balance_rows, year, ["Inventory", "Inventories"]),
            "receivables": self._statement_value(
                balance_rows,
                year,
                ["Accounts Receivable", "Receivables", "Net Receivables"],
            ),
            "net_ppe": self._statement_value(
                balance_rows,
                year,
                ["Net PPE", "Property Plant Equipment Net", "Net Property Plant Equipment"],
            ),
            "total_liabilities": self._statement_value(
                balance_rows,
                year,
                ["Total Liabilities Net Minority Interest", "Total Liabilities", "Total Liab"],
            ),
            "long_term_debt": self._statement_value(
                balance_rows,
                year,
                ["Long Term Debt", "Long Term Debt And Capital Lease Obligation", "Long Term Debt Noncurrent"],
            ),
            "equity": self._statement_value(
                balance_rows,
                year,
                ["Stockholders Equity", "Shareholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"],
            ),
            "working_capital": self._statement_value(balance_rows, year, ["Working Capital"]),
            "retained_earnings": self._statement_value(
                balance_rows,
                year,
                ["Retained Earnings", "Retained Earnings Accumulated Deficit"],
            ),
            "shares_outstanding": self._statement_value(
                balance_rows,
                year,
                ["Ordinary Shares Number", "Share Issued", "Common Stock Shares Outstanding", "Basic Average Shares", "Diluted Average Shares"],
            ),
            "operating_cash_flow": self._statement_value(
                cash_rows,
                year,
                ["Operating Cash Flow", "Net Cash Provided By Operating Activities", "Net Cash Flow From Operating Activities", "Cash Flow From Operations"],
            ),
        }

        if values["working_capital"] is None:
            values["working_capital"] = self._as_number(values["current_assets"]) - self._as_number(values["current_liabilities"]) if (
                values.get("current_assets") is not None and values.get("current_liabilities") is not None
            ) else None

        return values

    def _build_ratio_dashboard(self, quote: dict, profile: dict, financial_statements: dict[str, Any]) -> dict:
        years_raw = financial_statements.get("years", []) if isinstance(financial_statements, dict) else []
        years = [str(year) for year in years_raw if year is not None]
        latest_year = years[0] if years else None
        previous_year = years[1] if len(years) > 1 else None

        latest = self._extract_statement_values(financial_statements, latest_year)
        previous = self._extract_statement_values(financial_statements, previous_year) if previous_year else {}

        revenue = latest.get("revenue")
        cost_of_revenue = latest.get("cost_of_revenue")
        gross_profit = latest.get("gross_profit")
        operating_income = latest.get("operating_income")
        ebit = latest.get("ebit")
        ebitda = latest.get("ebitda")
        net_income = latest.get("net_income")
        total_assets = latest.get("total_assets")
        current_assets = latest.get("current_assets")
        current_liabilities = latest.get("current_liabilities")
        cash_and_equivalents = latest.get("cash_and_equivalents")
        inventory = latest.get("inventory")
        receivables = latest.get("receivables")
        net_ppe = latest.get("net_ppe")
        total_liabilities = latest.get("total_liabilities")
        long_term_debt = latest.get("long_term_debt")
        equity = latest.get("equity")
        working_capital = latest.get("working_capital")
        retained_earnings = latest.get("retained_earnings")
        shares_outstanding = latest.get("shares_outstanding")
        operating_cash_flow = latest.get("operating_cash_flow")

        roa = self._safe_div(net_income, total_assets)
        roe = self._safe_div(net_income, equity)
        if roe is None:
            roe = self._normalize_rate(profile.get("roe"))
        roce = self._safe_div(ebit, (total_assets - current_liabilities) if total_assets is not None and current_liabilities is not None else None)
        if roce is None:
            roce = self._normalize_rate(profile.get("roce"))

        current_ratio = self._safe_div(current_assets, current_liabilities)
        quick_assets = None
        if current_assets is not None:
            quick_assets = current_assets - (inventory if inventory is not None else 0)
        quick_ratio = self._safe_div(quick_assets, current_liabilities)
        cash_ratio = self._safe_div(cash_and_equivalents, current_liabilities)
        operating_cash_flow_ratio = self._safe_div(operating_cash_flow, current_liabilities)
        working_capital_to_assets = self._safe_div(working_capital, total_assets)

        debt_to_equity = self._safe_div(total_liabilities, equity)
        if debt_to_equity is None:
            profile_dte = self._as_number(profile.get("debt_to_equity"))
            if profile_dte is not None:
                debt_to_equity = profile_dte / 100 if abs(profile_dte) > 10 else profile_dte
        debt_ratio = self._safe_div(total_liabilities, total_assets)
        equity_ratio = self._safe_div(equity, total_assets)
        interest_expense = latest.get("interest_expense")
        interest_coverage = self._safe_div(ebit, abs(interest_expense) if interest_expense is not None else None)
        long_term_debt_to_capital = self._safe_div(
            long_term_debt,
            (long_term_debt + equity) if long_term_debt is not None and equity is not None else None,
        )

        gross_margin = self._safe_div(gross_profit, revenue)
        operating_margin = self._safe_div(operating_income, revenue)
        net_margin = self._safe_div(net_income, revenue)
        ebitda_margin = self._safe_div(ebitda, revenue)

        asset_turnover = self._safe_div(revenue, total_assets)
        receivables_turnover = self._safe_div(revenue, receivables)
        inventory_turnover = self._safe_div(cost_of_revenue, inventory)
        fixed_asset_turnover = self._safe_div(revenue, net_ppe)
        working_capital_turnover = self._safe_div(revenue, working_capital)

        equity_multiplier = self._safe_div(total_assets, equity)
        dupont_roe = None
        if net_margin is not None and asset_turnover is not None and equity_multiplier is not None:
            dupont_roe = net_margin * asset_turnover * equity_multiplier

        market_cap = self._as_number(quote.get("market_cap"))
        altman_components = {
            "working_capital_to_assets": self._safe_div(working_capital, total_assets),
            "retained_earnings_to_assets": self._safe_div(retained_earnings, total_assets),
            "ebit_to_assets": self._safe_div(ebit, total_assets),
            "market_value_equity_to_total_liabilities": self._safe_div(market_cap, total_liabilities),
            "sales_to_assets": self._safe_div(revenue, total_assets),
        }
        altman_score = None
        if all(component is not None for component in altman_components.values()):
            altman_score = (
                1.2 * altman_components["working_capital_to_assets"]
                + 1.4 * altman_components["retained_earnings_to_assets"]
                + 3.3 * altman_components["ebit_to_assets"]
                + 0.6 * altman_components["market_value_equity_to_total_liabilities"]
                + 1.0 * altman_components["sales_to_assets"]
            )
        if altman_score is None:
            altman_zone = "Unknown"
        elif altman_score > 2.99:
            altman_zone = "Safe"
        elif altman_score >= 1.81:
            altman_zone = "Grey"
        else:
            altman_zone = "Distress"

        previous_roa = self._safe_div(previous.get("net_income"), previous.get("total_assets"))
        previous_debt_ratio = self._safe_div(previous.get("long_term_debt"), previous.get("total_assets"))
        current_debt_ratio = self._safe_div(long_term_debt, total_assets)
        previous_current_ratio = self._safe_div(previous.get("current_assets"), previous.get("current_liabilities"))
        previous_gross_margin = self._safe_div(previous.get("gross_profit"), previous.get("revenue"))
        previous_asset_turnover = self._safe_div(previous.get("revenue"), previous.get("total_assets"))

        piotroski_signals = {
            "positive_roa": (roa > 0) if roa is not None else None,
            "positive_operating_cash_flow": (operating_cash_flow > 0) if operating_cash_flow is not None else None,
            "improving_roa": (roa > previous_roa) if roa is not None and previous_roa is not None else None,
            "operating_cash_flow_exceeds_net_income": (operating_cash_flow > net_income) if operating_cash_flow is not None and net_income is not None else None,
            "lower_leverage": (current_debt_ratio < previous_debt_ratio) if current_debt_ratio is not None and previous_debt_ratio is not None else None,
            "improving_current_ratio": (current_ratio > previous_current_ratio) if current_ratio is not None and previous_current_ratio is not None else None,
            "no_share_dilution": (shares_outstanding <= previous.get("shares_outstanding")) if shares_outstanding is not None and previous.get("shares_outstanding") is not None else None,
            "improving_gross_margin": (gross_margin > previous_gross_margin) if gross_margin is not None and previous_gross_margin is not None else None,
            "improving_asset_turnover": (asset_turnover > previous_asset_turnover) if asset_turnover is not None and previous_asset_turnover is not None else None,
        }

        piotroski_score = sum(1 for signal in piotroski_signals.values() if signal is True)
        piotroski_available = sum(1 for signal in piotroski_signals.values() if signal is not None)
        if piotroski_available == 0:
            piotroski_score = None

        if piotroski_score is None:
            piotroski_label = "Unknown"
        elif piotroski_score >= 7:
            piotroski_label = "Strong"
        elif piotroski_score >= 4:
            piotroski_label = "Average"
        else:
            piotroski_label = "Weak"

        return {
            "year": latest_year,
            "prior_year": previous_year,
            "liquidity": {
                "current_ratio": current_ratio,
                "quick_ratio": quick_ratio,
                "cash_ratio": cash_ratio,
                "operating_cash_flow_ratio": operating_cash_flow_ratio,
                "working_capital_to_assets": working_capital_to_assets,
            },
            "solvency": {
                "debt_to_equity": debt_to_equity,
                "debt_ratio": debt_ratio,
                "equity_ratio": equity_ratio,
                "interest_coverage": interest_coverage,
                "long_term_debt_to_capital": long_term_debt_to_capital,
            },
            "profitability": {
                "gross_margin": gross_margin,
                "operating_margin": operating_margin,
                "net_margin": net_margin,
                "roa": roa,
                "roe": roe,
                "roce": roce,
                "ebitda_margin": ebitda_margin,
            },
            "efficiency": {
                "asset_turnover": asset_turnover,
                "receivables_turnover": receivables_turnover,
                "inventory_turnover": inventory_turnover,
                "fixed_asset_turnover": fixed_asset_turnover,
                "working_capital_turnover": working_capital_turnover,
            },
            "dupont_analysis": {
                "net_margin": net_margin,
                "asset_turnover": asset_turnover,
                "equity_multiplier": equity_multiplier,
                "roe": dupont_roe,
            },
            "altman_z_score": {
                "score": altman_score,
                "zone": altman_zone,
                "components": altman_components,
            },
            "piotroski_f_score": {
                "score": piotroski_score,
                "max_score": 9,
                "available_checks": piotroski_available,
                "label": piotroski_label,
                "signals": piotroski_signals,
            },
        }

    async def _from_providers(self, method_name: str, *args, **kwargs):
        last_error = None
        for provider in self.providers:
            try:
                method = getattr(provider, method_name)
                return await method(*args, **kwargs)
            except Exception as exc:  # pragma: no cover
                last_error = exc
                continue
        raise HTTPException(status_code=503, detail=f"Data providers unavailable: {last_error}")

    async def search(self, query: str) -> list[dict]:
        key = f"search:{query.lower()}"
        data = await cache.remember(key, lambda: self._from_providers("search", query), ttl_seconds=300)
        return self._sanitize_json(data)

    async def quote(self, symbol: str) -> dict:
        key = f"quote:{symbol.upper()}"
        data = await cache.remember(key, lambda: self._from_providers("get_quote", symbol), ttl_seconds=60)
        return self._sanitize_json(data)

    async def profile(self, symbol: str) -> dict:
        key = f"profile:{symbol.upper()}"
        data = await cache.remember(key, lambda: self._from_providers("get_profile", symbol), ttl_seconds=900)
        return self._sanitize_json(data)

    async def history(self, symbol: str, period: str = "6mo") -> list[dict]:
        key = f"history:{symbol.upper()}:{period}"
        data = await cache.remember(key, lambda: self._from_providers("get_history", symbol, period), ttl_seconds=300)
        safe_history = [
            row
            for row in data
            if isinstance(row, dict)
            and self._is_finite_number(row.get("close"))
            and self._is_finite_number(row.get("volume"))
        ]
        return self._sanitize_json(safe_history)

    async def financial_statements(self, symbol: str, years: int = 10) -> dict:
        key = f"financials:{symbol.upper()}:{years}"
        data = await cache.remember(
            key,
            lambda: self._from_providers("get_financials", symbol, years),
            ttl_seconds=6 * 3600,
        )
        return self._sanitize_json(data)

    async def dashboard(self, symbol: str) -> dict:
        quote = await self.quote(symbol)
        profile = await self.profile(symbol)
        history = await self.history(symbol)
        history_5y = await self.history(symbol, period="5y")
        try:
            financial_statements = await self.financial_statements(symbol, years=10)
        except HTTPException:
            financial_statements = {"years": [], "income_statement": {"raw": [], "common_size": []}, "balance_sheet": {"raw": [], "common_size": []}, "cash_flow": {"raw": [], "common_size": []}}

        ratios = {
            "pe": profile.get("trailing_pe"),
            "pb": profile.get("pb"),
            "peg": profile.get("peg"),
            "roe": profile.get("roe"),
            "roce": profile.get("roce"),
            "debt_to_equity": profile.get("debt_to_equity"),
            "profit_margin": profile.get("profit_margin"),
            "revenue_growth": profile.get("revenue_growth"),
            "dividend_yield": profile.get("dividend_yield"),
            "eps": profile.get("eps"),
            "book_value": profile.get("book_value"),
            "beta": profile.get("beta"),
        }

        highlights = {
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "market_cap": quote.get("market_cap"),
        }

        clean_profile = {
            "symbol": profile.get("symbol"),
            "name": profile.get("name"),
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "website": profile.get("website"),
            "description": profile.get("description"),
            "country": profile.get("country"),
        }

        perf = {
            "1d": self._change_for_offset(history_5y, 1),
            "1w": self._change_for_offset(history_5y, 5),
            "1m": self._change_for_offset(history_5y, 21),
            "1y": self._change_for_offset(history_5y, 252),
            "5y": self._change_for_offset(history_5y, 1260),
        }

        latest_row = history_5y[-1] if history_5y else {}
        ohlc = {
            "open": self._as_number(latest_row.get("open") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("open")),
            "high": self._as_number(latest_row.get("high") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("high")),
            "low": self._as_number(latest_row.get("low") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("low")),
            "close": self._as_number(latest_row.get("close") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("close")) or self._as_number(quote.get("price")),
            "adjusted_close": self._as_number(latest_row.get("adj_close") if isinstance(latest_row, dict) else None),
        }

        market_data = {
            "live_price": self._as_number(quote.get("price")),
            "changes_percent": perf,
            "volume": self._as_number(quote.get("volume")) or self._as_number(latest_row.get("volume") if isinstance(latest_row, dict) else None),
            "market_cap": self._as_number(quote.get("market_cap")),
            "week_52_high": self._as_number(profile.get("week_52_high")),
            "week_52_low": self._as_number(profile.get("week_52_low")),
            "beta": self._as_number(profile.get("beta")),
            "pe": self._as_number(profile.get("trailing_pe")),
            "pb": self._as_number(profile.get("pb")),
            "peg": self._as_number(profile.get("peg")),
            "dividend_yield": self._as_number(profile.get("dividend_yield")),
            "eps": self._as_number(profile.get("eps")),
            "book_value": self._as_number(profile.get("book_value")),
            "roe": self._as_number(profile.get("roe")),
            "roce": self._as_number(profile.get("roce")),
        }
        ratio_dashboard = self._build_ratio_dashboard(quote, profile, financial_statements)

        dashboard = {
            "quote": quote,
            "profile": clean_profile,
            "ratios": ratios,
            "financial_highlights": highlights,
            "history": history,
            "market_data": market_data,
            "ohlc": ohlc,
            "financial_statements": financial_statements,
            "ratio_dashboard": ratio_dashboard,
        }
        return self._sanitize_json(dashboard)


stock_service = StockService()
