from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from app.core.cache import cache
from app.services.providers.alpha_vantage_provider import AlphaVantageProvider
from app.services.providers.fmp_provider import FMPProvider
from app.services.providers.yahoo_provider import YahooFinanceProvider
from app.services.news_service import news_service
from app.services.universe_service import universe_service


class StockService:
    PANEL_CACHE_POLICIES = {
        "price": {"fresh_ttl_seconds": 45, "stale_ttl_seconds": 180},
        "summary": {"fresh_ttl_seconds": 120, "stale_ttl_seconds": 480},
        "news": {"fresh_ttl_seconds": 180, "stale_ttl_seconds": 900},
        "financials": {"fresh_ttl_seconds": 6 * 3600, "stale_ttl_seconds": 24 * 3600},
        "ratios": {"fresh_ttl_seconds": 15 * 60, "stale_ttl_seconds": 2 * 3600},
        "peers": {"fresh_ttl_seconds": 15 * 60, "stale_ttl_seconds": 2 * 3600},
        "events": {"fresh_ttl_seconds": 10 * 60, "stale_ttl_seconds": 60 * 60},
        "benchmark": {"fresh_ttl_seconds": 15 * 60, "stale_ttl_seconds": 2 * 3600},
        "relevance": {"fresh_ttl_seconds": 10 * 60, "stale_ttl_seconds": 60 * 60},
    }
    SECTOR_PEERS = {
        "technology": ["MSFT", "NVDA", "GOOGL", "META", "ORCL", "CRM", "ADBE", "INTC"],
        "communicationservices": ["GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T", "CHTR"],
        "consumercyclical": ["AMZN", "TSLA", "HD", "MCD", "NKE", "BKNG", "SBUX", "LOW"],
        "consumerdefensive": ["WMT", "COST", "PG", "KO", "PEP", "PM", "CL", "MDLZ"],
        "healthcare": ["UNH", "JNJ", "LLY", "PFE", "MRK", "ABT", "TMO", "DHR"],
        "financialservices": ["JPM", "BAC", "WFC", "MS", "GS", "V", "MA", "AXP"],
        "industrials": ["GE", "CAT", "HON", "UPS", "BA", "DE", "LMT", "RTX"],
        "energy": ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "OXY"],
        "realestate": ["AMT", "PLD", "CCI", "EQIX", "SPG", "O", "WELL", "DLR"],
        "utilities": ["NEE", "SO", "DUK", "AEP", "D", "XEL", "SRE", "EXC"],
        "basicmaterials": ["LIN", "APD", "NEM", "FCX", "ECL", "SHW", "NUE", "DOW"],
    }
    FALLBACK_PEERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "JPM", "V", "WMT", "XOM"]
    INDIA_SECTOR_PEERS = {
        "technology": ["TCS.NS", "INFY.NS", "HCLTECH.NS", "WIPRO.NS", "TECHM.NS", "LTIM.NS"],
        "financialservices": ["HDFCBANK.NS", "ICICIBANK.NS", "KOTAKBANK.NS", "AXISBANK.NS", "SBIN.NS", "BAJFINANCE.NS"],
        "energy": ["RELIANCE.NS", "ONGC.NS", "IOC.NS", "BPCL.NS", "HINDPETRO.NS", "GAIL.NS"],
        "consumercyclical": ["MARUTI.NS", "TATAMOTORS.NS", "M&M.NS", "EICHERMOT.NS", "TRENT.NS"],
        "consumerdefensive": ["ITC.NS", "HINDUNILVR.NS", "NESTLEIND.NS", "DABUR.NS", "BRITANNIA.NS"],
        "healthcare": ["SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS"],
        "industrials": ["LT.NS", "SIEMENS.NS", "ABB.NS", "HAL.NS", "BEL.NS"],
        "utilities": ["NTPC.NS", "POWERGRID.NS", "TATAPOWER.NS", "ADANIPOWER.NS"],
        "basicmaterials": ["ULTRACEMCO.NS", "JSWSTEEL.NS", "TATASTEEL.NS", "HINDALCO.NS", "GRASIM.NS"],
        "communicationservices": ["BHARTIARTL.NS", "TATACOMM.NS", "INDUSTOWER.NS"],
    }
    FALLBACK_PEERS_INDIA = [
        "RELIANCE.NS",
        "TCS.NS",
        "HDFCBANK.NS",
        "ICICIBANK.NS",
        "INFY.NS",
        "ITC.NS",
        "LT.NS",
        "SBIN.NS",
        "BHARTIARTL.NS",
        "HINDUNILVR.NS",
    ]
    MARKET_HEATMAP_SYMBOLS = [
        "AAPL",
        "MSFT",
        "NVDA",
        "AMZN",
        "GOOGL",
        "META",
        "TSLA",
        "BRK-B",
        "JPM",
        "V",
        "WMT",
        "XOM",
        "LLY",
        "AVGO",
        "MA",
        "UNH",
        "JNJ",
        "PG",
        "COST",
        "HD",
        "MRK",
        "ABBV",
        "PEP",
        "KO",
        "CVX",
        "BAC",
        "WFC",
        "ADBE",
        "CRM",
        "NFLX",
        "ORCL",
        "AMD",
        "QCOM",
        "INTC",
        "CSCO",
        "IBM",
        "TXN",
        "AMAT",
        "GE",
        "CAT",
        "RTX",
        "LMT",
        "NKE",
        "MCD",
        "SBUX",
        "LOW",
        "PM",
        "COP",
        "PFE",
        "DHR",
        "ABT",
        "SPGI",
        "BLK",
        "GS",
        "MS",
        "C",
        "T",
        "VZ",
        "DIS",
        "UBER",
        "SHOP",
        "NOW",
        "PLTR",
        "PANW",
        "MU",
        "SNPS",
        "AMGN",
        "ISRG",
        "GILD",
        "BKNG",
        "ADI",
        "MDLZ",
        "DE",
        "ETN",
        "NEE",
        "SO",
        "DUK",
        "AEP",
    ]

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
            "free_cash_flow": self._statement_value(
                cash_rows,
                year,
                ["Free Cash Flow", "FreeCashFlow"],
            ),
            "capital_expenditure": self._statement_value(
                cash_rows,
                year,
                ["Capital Expenditure", "Capital Expenditures", "Purchase Of PPE", "Purchase Of Property Plant And Equipment"],
            ),
            "depreciation_amortization": self._statement_value(
                cash_rows,
                year,
                ["Depreciation And Amortization", "Depreciation Amortization Depletion", "Depreciation"],
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
        average_equity = None
        previous_equity = previous.get("equity")
        if equity is not None and previous_equity is not None:
            average_equity = (equity + previous_equity) / 2
        elif equity is not None:
            average_equity = equity
        roe = self._safe_div(net_income, average_equity)
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

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    def _median(self, values: list[float | int | None]) -> float | None:
        nums = []
        for item in values:
            numeric = self._as_number(item)
            if numeric is not None:
                nums.append(numeric)
        if not nums:
            return None
        nums.sort()
        mid = len(nums) // 2
        if len(nums) % 2 == 1:
            return nums[mid]
        return (nums[mid - 1] + nums[mid]) / 2

    def _sector_key(self, profile: dict) -> str:
        sector = profile.get("sector") or profile.get("industry") or ""
        return self._norm_metric(sector)

    @staticmethod
    def _is_india_symbol(symbol: str) -> bool:
        upper = str(symbol or "").upper()
        return upper.endswith(".NS") or upper.endswith(".BO")

    def _select_peer_symbols(self, symbol: str, profile: dict) -> list[str]:
        key = self._sector_key(profile)
        if self._is_india_symbol(symbol):
            peers = self.INDIA_SECTOR_PEERS.get(key, self.FALLBACK_PEERS_INDIA)
        else:
            peers = self.SECTOR_PEERS.get(key, self.FALLBACK_PEERS)
        dedup: list[str] = []
        upper_symbol = symbol.upper()
        for peer in peers:
            candidate = peer.upper()
            if candidate == upper_symbol:
                continue
            if self._is_india_symbol(upper_symbol) and not self._is_india_symbol(candidate):
                continue
            if not self._is_india_symbol(upper_symbol) and self._is_india_symbol(candidate):
                continue
            if candidate not in dedup:
                dedup.append(candidate)
        return dedup[:8]

    async def _from_providers_with_meta(self, method_name: str, *args, **kwargs) -> dict:
        errors: list[str] = []
        attempted: list[str] = []
        for provider in self.providers:
            ready = getattr(provider, "_ready", None)
            if callable(ready):
                try:
                    if not ready():
                        continue
                except Exception:
                    pass
            attempted.append(provider.name)
            try:
                method = getattr(provider, method_name)
                data = await method(*args, **kwargs)
                return {
                    "data": data,
                    "meta": {
                        "source": provider.name,
                        "fallback_used": bool(errors),
                        "attempted_providers": attempted,
                        "provider_errors": errors[:5],
                    },
                }
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover
                errors.append(f"{provider.name}: {exc}")
                continue
        detail = errors[0] if errors else "No configured providers are available."
        raise HTTPException(status_code=503, detail=f"Data providers unavailable: {detail}")

    async def _cached_provider_call_with_meta(self, cache_key: str, ttl_seconds: int, method_name: str, *args, **kwargs) -> tuple[Any, dict]:
        cached = await cache.get(cache_key)
        if isinstance(cached, dict) and "data" in cached and isinstance(cached.get("meta"), dict):
            meta = dict(cached.get("meta") or {})
            meta["cache_status"] = "hit"
            return cached.get("data"), meta

        wrapped = await self._from_providers_with_meta(method_name, *args, **kwargs)
        meta = dict(wrapped.get("meta") or {})
        meta["cache_status"] = "miss"
        meta["cached_at"] = datetime.now(timezone.utc).isoformat()
        payload = {"data": wrapped.get("data"), "meta": meta}
        await cache.set(cache_key, payload, ttl_seconds=ttl_seconds)
        return wrapped.get("data"), meta

    def _panel_policy(self, panel: str) -> dict[str, int]:
        policy = self.PANEL_CACHE_POLICIES.get(panel, {"fresh_ttl_seconds": 120, "stale_ttl_seconds": 300})
        fresh_ttl = max(1, int(policy.get("fresh_ttl_seconds", 120)))
        stale_ttl = max(0, int(policy.get("stale_ttl_seconds", 300)))
        return {"fresh_ttl_seconds": fresh_ttl, "stale_ttl_seconds": stale_ttl}

    def _parse_datetime(self, value: str | None) -> datetime | None:
        if not value or not isinstance(value, str):
            return None
        try:
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    def _panel_freshness_meta(self, panel: str, cached_meta: dict | None, now: datetime) -> dict:
        policy = self._panel_policy(panel)
        fresh_ttl = policy["fresh_ttl_seconds"]
        stale_ttl = policy["stale_ttl_seconds"]
        cached_at = self._parse_datetime((cached_meta or {}).get("cached_at"))
        age_seconds = None
        if cached_at is not None:
            age_seconds = max(0, int((now - cached_at).total_seconds()))

        freshness_status = "fresh"
        if age_seconds is not None and age_seconds > fresh_ttl:
            freshness_status = "stale"
        if age_seconds is not None and age_seconds > fresh_ttl + stale_ttl:
            freshness_status = "expired"

        fresh_until = None
        stale_until = None
        if cached_at is not None:
            fresh_until = (cached_at + timedelta(seconds=fresh_ttl)).isoformat()
            stale_until = (cached_at + timedelta(seconds=fresh_ttl + stale_ttl)).isoformat()

        return {
            "fresh_ttl_seconds": fresh_ttl,
            "stale_ttl_seconds": stale_ttl,
            "age_seconds": age_seconds,
            "freshness_status": freshness_status,
            "fresh_until": fresh_until,
            "stale_while_revalidate_until": stale_until,
            "revalidate_recommended": freshness_status == "stale",
        }

    async def _panel_swr(
        self,
        symbol: str,
        panel: str,
        variant_key: str,
        producer,
    ) -> dict:
        upper_symbol = str(symbol or "").upper()
        cache_key = f"panel:{panel}:{upper_symbol}:{variant_key}"
        policy = self._panel_policy(panel)
        fresh_ttl = policy["fresh_ttl_seconds"]
        stale_ttl = policy["stale_ttl_seconds"]
        hard_ttl = fresh_ttl + stale_ttl
        now = datetime.now(timezone.utc)

        cached = await cache.get(cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("meta"), dict) and "data" in cached:
            base_meta = dict(cached.get("meta") or {})
            freshness = self._panel_freshness_meta(panel, base_meta, now)
            if freshness["freshness_status"] != "expired":
                meta = {
                    **base_meta,
                    **freshness,
                    "cache_status": "hit_stale" if freshness["freshness_status"] == "stale" else "hit_fresh",
                    "served_at": now.isoformat(),
                }
                return {"symbol": upper_symbol, "panel": panel, "data": cached.get("data"), "meta": meta}

        built = await producer()
        built_data = built.get("data") if isinstance(built, dict) else built
        built_sources = built.get("sources") if isinstance(built, dict) else None
        built_warnings = built.get("warnings") if isinstance(built, dict) else None
        built_errors = built.get("provider_errors") if isinstance(built, dict) else None
        built_tags = built.get("tags") if isinstance(built, dict) else None

        stored_meta = {
            "generated_at": now.isoformat(),
            "cached_at": now.isoformat(),
            "sources": built_sources if isinstance(built_sources, dict) else {},
            "warnings": built_warnings if isinstance(built_warnings, list) else [],
            "provider_errors": built_errors if isinstance(built_errors, list) else [],
            "tags": built_tags if isinstance(built_tags, dict) else {},
        }
        freshness = self._panel_freshness_meta(panel, stored_meta, now)
        response_meta = {
            **stored_meta,
            **freshness,
            "cache_status": "miss",
            "served_at": now.isoformat(),
        }
        await cache.set(cache_key, {"data": built_data, "meta": stored_meta}, ttl_seconds=hard_ttl)
        return {"symbol": upper_symbol, "panel": panel, "data": built_data, "meta": response_meta}

    def _collect_source_warnings(self, source_meta_by_key: dict[str, dict]) -> list[dict[str, str]]:
        warnings: list[dict[str, str]] = []
        for key, meta in source_meta_by_key.items():
            if not isinstance(meta, dict):
                continue
            if meta.get("fallback_used"):
                source = meta.get("source") or "fallback"
                warnings.append({"section": key, "message": f"Fallback provider path used. Current source: {source}."})
        return warnings

    def _yahoo_provider(self) -> YahooFinanceProvider | None:
        for provider in self.providers:
            if isinstance(provider, YahooFinanceProvider):
                return provider
        return None

    async def _event_feed(self, symbol: str) -> dict:
        cache_key = f"events:{symbol.upper()}"
        cached = await cache.get(cache_key)
        if isinstance(cached, dict) and "items" in cached:
            return cached
        provider = self._yahoo_provider()
        if not provider or not hasattr(provider, "get_events"):
            return {"items": [], "corporate_actions": [], "calendar": {}, "available_types": [], "source": "unavailable"}
        try:
            payload = await provider.get_events(symbol)  # type: ignore[attr-defined]
        except Exception:
            payload = {"items": [], "corporate_actions": [], "calendar": {}, "available_types": []}
        result = {
            **(payload if isinstance(payload, dict) else {}),
            "source": "yahoo",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        await cache.set(cache_key, result, ttl_seconds=600)
        return result

    def _project_dcf(
        self,
        base_cash_flow: float | None,
        growth_rate: float,
        discount_rate: float,
        terminal_growth_rate: float,
        projection_years: int,
        shares_outstanding: float | None,
        net_debt: float | None,
        market_price: float | None,
        mode: str,
    ) -> dict:
        if base_cash_flow is None or shares_outstanding is None or shares_outstanding <= 0:
            return {
                "projection": [],
                "present_value_of_cash_flows": None,
                "terminal_value": None,
                "enterprise_value": None,
                "equity_value": None,
                "intrinsic_value_per_share": None,
                "upside_percent": None,
            }

        discount = self._as_number(discount_rate)
        growth = self._as_number(growth_rate)
        terminal_growth = self._as_number(terminal_growth_rate)
        if (
            discount is None
            or growth is None
            or terminal_growth is None
            or discount <= -0.9
            or terminal_growth <= -0.9
            or discount <= terminal_growth + 0.002
            or base_cash_flow <= 0
        ):
            return {
                "projection": [],
                "present_value_of_cash_flows": None,
                "terminal_value": None,
                "enterprise_value": None,
                "equity_value": None,
                "intrinsic_value_per_share": None,
                "upside_percent": None,
            }

        pv_cash_flows = 0.0
        projection = []
        last_cash_flow = base_cash_flow

        for year_index in range(1, projection_years + 1):
            projected = base_cash_flow * ((1 + growth) ** year_index)
            discount_factor = (1 + discount) ** year_index
            pv = projected / discount_factor
            projection.append(
                {
                    "year_index": year_index,
                    "cash_flow": projected,
                    "present_value": pv,
                }
            )
            pv_cash_flows += pv
            last_cash_flow = projected

        terminal_cash_flow = last_cash_flow * (1 + terminal_growth)
        terminal_value = terminal_cash_flow / (discount - terminal_growth)
        present_value_terminal = terminal_value / ((1 + discount) ** projection_years)

        if mode == "fcff":
            enterprise_value = pv_cash_flows + present_value_terminal
            equity_value = enterprise_value - (net_debt or 0.0)
        else:
            equity_value = pv_cash_flows + present_value_terminal
            enterprise_value = equity_value + (net_debt or 0.0)

        intrinsic = self._safe_div(equity_value, shares_outstanding)
        upside = None
        if intrinsic is not None and market_price is not None and market_price > 0:
            upside = ((intrinsic - market_price) / market_price) * 100

        return {
            "projection": projection,
            "present_value_of_cash_flows": pv_cash_flows,
            "terminal_value": terminal_value,
            "present_value_terminal": present_value_terminal,
            "enterprise_value": enterprise_value,
            "equity_value": equity_value,
            "intrinsic_value_per_share": intrinsic,
            "upside_percent": upside,
        }

    def _reverse_dcf_growth(
        self,
        base_cash_flow: float | None,
        discount_rate: float,
        terminal_growth_rate: float,
        projection_years: int,
        shares_outstanding: float | None,
        net_debt: float | None,
        market_price: float | None,
        mode: str,
    ) -> float | None:
        if (
            base_cash_flow is None
            or base_cash_flow <= 0
            or shares_outstanding is None
            or shares_outstanding <= 0
            or market_price is None
            or market_price <= 0
        ):
            return None

        low, high = -0.30, 0.45
        for _ in range(70):
            mid = (low + high) / 2
            result = self._project_dcf(
                base_cash_flow=base_cash_flow,
                growth_rate=mid,
                discount_rate=discount_rate,
                terminal_growth_rate=terminal_growth_rate,
                projection_years=projection_years,
                shares_outstanding=shares_outstanding,
                net_debt=net_debt,
                market_price=market_price,
                mode=mode,
            )
            price = self._as_number(result.get("intrinsic_value_per_share"))
            if price is None:
                return None
            if price > market_price:
                high = mid
            else:
                low = mid
        return (low + high) / 2

    def _sensitivity_grid(
        self,
        base_cash_flow: float | None,
        growth_rate: float,
        discount_rate: float,
        terminal_growth_rate: float,
        projection_years: int,
        shares_outstanding: float | None,
        net_debt: float | None,
        market_price: float | None,
        mode: str,
    ) -> dict:
        wacc_points = []
        for delta in [-0.02, -0.01, 0.0, 0.01, 0.02]:
            candidate = self._clamp(discount_rate + delta, 0.05, 0.25)
            if candidate > terminal_growth_rate + 0.002 and candidate not in wacc_points:
                wacc_points.append(candidate)
        if not wacc_points:
            wacc_points = [max(discount_rate, terminal_growth_rate + 0.01)]

        growth_points = []
        for delta in [-0.02, -0.01, 0.0, 0.01, 0.02]:
            candidate = self._clamp(growth_rate + delta, -0.15, 0.25)
            if candidate not in growth_points:
                growth_points.append(candidate)
        growth_points.sort(reverse=True)

        rows = []
        for growth in growth_points:
            row_cells = []
            for wacc in sorted(wacc_points):
                result = self._project_dcf(
                    base_cash_flow=base_cash_flow,
                    growth_rate=growth,
                    discount_rate=wacc,
                    terminal_growth_rate=terminal_growth_rate,
                    projection_years=projection_years,
                    shares_outstanding=shares_outstanding,
                    net_debt=net_debt,
                    market_price=market_price,
                    mode=mode,
                )
                row_cells.append(
                    {
                        "wacc": wacc,
                        "intrinsic_value_per_share": result.get("intrinsic_value_per_share"),
                        "upside_percent": result.get("upside_percent"),
                    }
                )
            rows.append({"growth": growth, "values": row_cells})

        return {"wacc_values": sorted(wacc_points), "growth_values": growth_points, "rows": rows}

    async def _peer_snapshot(self, symbol: str, profile: dict, market_price: float | None) -> dict:
        peer_symbols = self._select_peer_symbols(symbol, profile)

        async def _load_peer(peer_symbol: str):
            try:
                quote, peer_profile = await asyncio.gather(self.quote(peer_symbol), self.profile(peer_symbol))
            except Exception:
                return None

            pe = self._as_number(peer_profile.get("trailing_pe"))
            pb = self._as_number(peer_profile.get("pb"))
            peg = self._as_number(peer_profile.get("peg"))
            if pe is None and pb is None and peg is None:
                return None

            return {
                "symbol": peer_symbol,
                "name": peer_profile.get("name") or quote.get("name") or peer_symbol,
                "sector": peer_profile.get("sector"),
                "industry": peer_profile.get("industry"),
                "price": self._as_number(quote.get("price")),
                "market_cap": self._as_number(quote.get("market_cap")),
                "pe": pe,
                "pb": pb,
                "peg": peg,
            }

        peer_results = await asyncio.gather(*[_load_peer(peer_symbol) for peer_symbol in peer_symbols])
        peers = [peer for peer in peer_results if isinstance(peer, dict)]

        peer_medians = {
            "pe": self._median([peer.get("pe") for peer in peers]),
            "pb": self._median([peer.get("pb") for peer in peers]),
            "peg": self._median([peer.get("peg") for peer in peers]),
        }

        company_metrics = {
            "pe": self._as_number(profile.get("trailing_pe")),
            "pb": self._as_number(profile.get("pb")),
            "peg": self._as_number(profile.get("peg")),
        }

        premium_discount = {}
        for metric in ["pe", "pb", "peg"]:
            company_value = company_metrics.get(metric)
            industry_value = peer_medians.get(metric)
            if company_value is None or industry_value in (None, 0):
                premium_discount[metric] = None
            else:
                premium_discount[metric] = ((company_value - industry_value) / industry_value) * 100

        eps = self._as_number(profile.get("eps"))
        book_value = self._as_number(profile.get("book_value"))
        revenue_growth = self._normalize_rate(profile.get("revenue_growth"))
        growth_percent = revenue_growth * 100 if revenue_growth is not None else None

        pe_implied_price = None
        if eps is not None and eps > 0 and peer_medians["pe"] is not None:
            pe_implied_price = eps * peer_medians["pe"]

        pb_implied_price = None
        if book_value is not None and book_value > 0 and peer_medians["pb"] is not None:
            pb_implied_price = book_value * peer_medians["pb"]

        peg_implied_price = None
        if (
            eps is not None
            and eps > 0
            and growth_percent is not None
            and growth_percent > 0
            and peer_medians["peg"] is not None
        ):
            implied_pe = peer_medians["peg"] * growth_percent
            peg_implied_price = eps * implied_pe

        implied_prices = [price for price in [pe_implied_price, pb_implied_price, peg_implied_price] if price is not None]
        composite_fair_price = sum(implied_prices) / len(implied_prices) if implied_prices else None
        composite_upside = None
        if composite_fair_price is not None and market_price is not None and market_price > 0:
            composite_upside = ((composite_fair_price - market_price) / market_price) * 100

        return {
            "peers": peers,
            "peer_medians": peer_medians,
            "company_multiples": company_metrics,
            "implied_prices": {
                "pe_based_price": pe_implied_price,
                "pb_based_price": pb_implied_price,
                "peg_based_price": peg_implied_price,
                "composite_fair_price": composite_fair_price,
                "composite_upside_percent": composite_upside,
            },
            "industry_multiple_comparison": {
                "company": company_metrics,
                "industry_median": peer_medians,
                "premium_discount_percent": premium_discount,
            },
        }

    async def _dashboard_peer_snapshot(self, symbol: str, quote: dict, profile: dict) -> dict:
        company_symbol = str(symbol or "").upper()
        company_market_cap = self._as_number(quote.get("market_cap"))
        company_sector = self._sector_key(profile)
        company_industry = self._norm_metric(profile.get("industry"))
        target_suffix = ".NS" if company_symbol.endswith(".NS") else ".BO" if company_symbol.endswith(".BO") else ""
        peer_symbols = self._select_peer_symbols(company_symbol, profile)

        async def _load(peer_symbol: str):
            try:
                peer_quote, peer_profile = await asyncio.gather(self.quote(peer_symbol), self.profile(peer_symbol))
            except Exception:
                return None

            peer_sector_key = self._sector_key(peer_profile)
            peer_industry_key = self._norm_metric(peer_profile.get("industry"))
            peer_market_cap = self._as_number(peer_quote.get("market_cap"))
            cap_distance_pct = None
            if company_market_cap and company_market_cap > 0 and peer_market_cap and peer_market_cap > 0:
                cap_distance_pct = abs(peer_market_cap - company_market_cap) / company_market_cap * 100

            completeness = sum(
                1
                for value in (
                    peer_profile.get("trailing_pe"),
                    peer_profile.get("roe"),
                    peer_profile.get("revenue_growth"),
                    peer_quote.get("market_cap"),
                )
                if self._as_number(value) is not None
            )

            score = 0.0
            if peer_industry_key and company_industry and peer_industry_key == company_industry:
                score += 45
            if peer_sector_key and company_sector and peer_sector_key == company_sector:
                score += 30
            if cap_distance_pct is not None:
                score += max(0, 25 - min(cap_distance_pct, 250) / 10)
            score += completeness * 3

            return {
                "symbol": str(peer_quote.get("symbol") or peer_symbol).upper(),
                "name": peer_profile.get("name") or peer_quote.get("name") or peer_symbol,
                "sector": peer_profile.get("sector"),
                "industry": peer_profile.get("industry"),
                "currency": peer_quote.get("currency"),
                "price": self._as_number(peer_quote.get("price")),
                "market_cap": peer_market_cap,
                "pe": self._as_number(peer_profile.get("trailing_pe")),
                "roe": self._normalize_rate(peer_profile.get("roe")),
                "revenue_growth": self._normalize_rate(peer_profile.get("revenue_growth")),
                "profit_margin": self._normalize_rate(peer_profile.get("profit_margin")),
                "similarity_score": round(score, 2),
                "sector_match": peer_sector_key == company_sector if company_sector else None,
                "industry_match": peer_industry_key == company_industry if company_industry else None,
                "market_cap_distance_percent": cap_distance_pct,
            }

        peer_rows = await asyncio.gather(*[_load(peer_symbol) for peer_symbol in peer_symbols[:10]])
        items = [row for row in peer_rows if isinstance(row, dict)]

        if target_suffix:
            items = [row for row in items if str(row.get("symbol") or "").upper().endswith(target_suffix)]

        items.sort(
            key=lambda row: (
                -(self._as_number(row.get("similarity_score")) or 0),
                self._as_number(row.get("market_cap_distance_percent")) or 1e9,
                str(row.get("symbol") or ""),
            )
        )
        ranked = []
        for idx, row in enumerate(items[:5], start=1):
            ranked.append({**row, "benchmark_rank": idx})

        benchmark = {
            "peer_count": len(items),
            "sector_median_pe": self._median([row.get("pe") for row in items]),
            "sector_median_roe": self._median([row.get("roe") for row in items]),
            "sector_median_revenue_growth": self._median([row.get("revenue_growth") for row in items]),
            "sector_median_market_cap": self._median([row.get("market_cap") for row in items]),
            "company_pe": self._as_number(profile.get("trailing_pe")),
            "company_roe": self._normalize_rate(profile.get("roe")),
            "company_revenue_growth": self._normalize_rate(profile.get("revenue_growth")),
        }

        return {"items": ranked, "benchmark": benchmark}

    def _quarterly_results_highlights(self, financial_statements: dict[str, Any], ratio_dashboard: dict[str, Any]) -> list[str]:
        years = [str(year) for year in (financial_statements.get("years") or []) if year is not None]
        latest_year = years[0] if years else None
        prev_year = years[1] if len(years) > 1 else None
        if not latest_year:
            return []
        latest = self._extract_statement_values(financial_statements, latest_year)
        previous = self._extract_statement_values(financial_statements, prev_year) if prev_year else {}
        items: list[str] = []

        def yoy_line(label: str, key: str):
            current = self._as_number(latest.get(key))
            old = self._as_number(previous.get(key))
            if current is None or old in (None, 0):
                return None
            change = ((current - old) / old) * 100
            return f"{label}: {change:+.1f}% YoY"

        for label, key in (("Revenue", "revenue"), ("Operating income", "operating_income"), ("Net income", "net_income"), ("Operating cash flow", "operating_cash_flow")):
            line = yoy_line(label, key)
            if line:
                items.append(line)

        profitability = ratio_dashboard.get("profitability", {}) if isinstance(ratio_dashboard, dict) else {}
        net_margin = self._as_number(profitability.get("net_margin"))
        roe = self._as_number(profitability.get("roe"))
        if net_margin is not None:
            items.append(f"Net margin: {net_margin * 100:.1f}%")
        if roe is not None:
            items.append(f"ROE: {roe * 100:.1f}%")

        return items[:6]

    def _build_india_context(self, symbol: str, profile: dict, financial_statements: dict[str, Any], ratio_dashboard: dict[str, Any], event_feed: dict) -> dict | None:
        if not self._is_india_symbol(symbol):
            return None

        insiders = self._normalize_rate(profile.get("held_percent_insiders"))
        institutions = self._normalize_rate(profile.get("held_percent_institutions"))
        public_est = None
        if insiders is not None or institutions is not None:
            public_est = max(0.0, 1.0 - (insiders or 0.0) - (institutions or 0.0))

        calendar = event_feed.get("calendar") if isinstance(event_feed, dict) else {}
        actions = event_feed.get("corporate_actions") if isinstance(event_feed, dict) else []

        return {
            "exchange": "NSE" if str(symbol).upper().endswith(".NS") else "BSE" if str(symbol).upper().endswith(".BO") else None,
            "ownership_proxies": {
                "promoter_or_insider_holding_percent": insiders * 100 if insiders is not None else None,
                "institutional_holding_percent": institutions * 100 if institutions is not None else None,
                "public_float_estimated_percent": public_est * 100 if public_est is not None else None,
                "source": "yahoo_info_proxy",
                "notes": "Promoter/FII/DII are approximated using available insider/institutional holdings when exact Indian registry data is unavailable.",
            },
            "pledged_shares_percent": {
                "value": None,
                "available": False,
                "source": None,
                "notes": "Pledged shares requires a dedicated India-specific shareholding dataset.",
            },
            "fii_dii_trend": {
                "available": False,
                "source": None,
                "notes": "FII/DII trend requires a dedicated Indian ownership flow feed.",
            },
            "quarterly_results_highlights": self._quarterly_results_highlights(financial_statements, ratio_dashboard),
            "corporate_actions": actions[:10] if isinstance(actions, list) else [],
            "upcoming_events": {
                "earnings_date": calendar.get("earnings_date") if isinstance(calendar, dict) else None,
                "ex_dividend_date": calendar.get("ex_dividend_date") if isinstance(calendar, dict) else None,
                "dividend_date": calendar.get("dividend_date") if isinstance(calendar, dict) else None,
                "earnings_estimates": calendar.get("earnings_estimates") if isinstance(calendar, dict) else None,
            },
        }

    async def _build_valuation_engine(self, symbol: str, quote: dict, profile: dict, financial_statements: dict[str, Any]) -> dict:
        years_raw = financial_statements.get("years", []) if isinstance(financial_statements, dict) else []
        years = [str(year) for year in years_raw if year is not None]
        latest_year = years[0] if years else None
        latest = self._extract_statement_values(financial_statements, latest_year)

        market_price = self._as_number(quote.get("price"))
        market_cap = self._as_number(quote.get("market_cap"))
        shares_outstanding = self._as_number(latest.get("shares_outstanding"))
        if (shares_outstanding is None or shares_outstanding <= 0) and market_price and market_cap and market_price > 0:
            shares_outstanding = market_cap / market_price

        long_term_debt = self._as_number(latest.get("long_term_debt"))
        cash_and_equivalents = self._as_number(latest.get("cash_and_equivalents"))
        net_debt = None
        if long_term_debt is not None and cash_and_equivalents is not None:
            net_debt = long_term_debt - cash_and_equivalents
        elif long_term_debt is not None:
            net_debt = long_term_debt
        elif cash_and_equivalents is not None:
            net_debt = -cash_and_equivalents

        tax_rate = 0.21
        revenue_growth = self._normalize_rate(profile.get("revenue_growth"))
        if revenue_growth is None:
            revenue_growth = 0.05
        growth_rate = self._clamp(revenue_growth, -0.05, 0.20)

        beta = self._as_number(profile.get("beta"))
        if beta is None or beta <= 0:
            beta = 1.0
        risk_free_rate = 0.043
        market_risk_premium = 0.055
        cost_of_equity = risk_free_rate + beta * market_risk_premium

        debt_to_equity = self._as_number(profile.get("debt_to_equity"))
        if debt_to_equity is not None and abs(debt_to_equity) > 10:
            debt_to_equity = debt_to_equity / 100
        if debt_to_equity is None or debt_to_equity < 0:
            debt_to_equity = 0.4
        debt_weight = debt_to_equity / (1 + debt_to_equity)
        cost_of_debt = 0.05
        wacc = cost_of_equity * (1 - debt_weight) + cost_of_debt * (1 - tax_rate) * debt_weight
        wacc = self._clamp(wacc, 0.06, 0.18)

        terminal_growth_rate = self._clamp(max(0.015, growth_rate * 0.45), 0.01, 0.04)
        projection_years = 5

        operating_cash_flow = self._as_number(latest.get("operating_cash_flow"))
        free_cash_flow = self._as_number(latest.get("free_cash_flow"))
        capex = self._as_number(latest.get("capital_expenditure"))
        depreciation_amortization = self._as_number(latest.get("depreciation_amortization")) or 0.0
        ebit = self._as_number(latest.get("ebit"))
        interest_expense = self._as_number(latest.get("interest_expense"))

        fcfe_base = free_cash_flow
        if fcfe_base is None and operating_cash_flow is not None:
            if capex is None:
                fcfe_base = operating_cash_flow
            else:
                fcfe_base = operating_cash_flow - abs(capex)

        fcff_base = None
        if operating_cash_flow is not None:
            if capex is None:
                fcff_base = operating_cash_flow
            else:
                fcff_base = operating_cash_flow - abs(capex)
        elif free_cash_flow is not None:
            fcff_base = free_cash_flow
        elif ebit is not None:
            capex_spend = abs(capex) if capex is not None else 0.0
            fcff_base = ebit * (1 - tax_rate) + depreciation_amortization - capex_spend

        if fcff_base is not None and interest_expense is not None:
            fcff_base = fcff_base + abs(interest_expense) * (1 - tax_rate)
        if fcfe_base is None:
            fcfe_base = fcff_base

        fcff_default = self._project_dcf(
            base_cash_flow=fcff_base,
            growth_rate=growth_rate,
            discount_rate=wacc,
            terminal_growth_rate=terminal_growth_rate,
            projection_years=projection_years,
            shares_outstanding=shares_outstanding,
            net_debt=net_debt,
            market_price=market_price,
            mode="fcff",
        )
        fcfe_default = self._project_dcf(
            base_cash_flow=fcfe_base,
            growth_rate=growth_rate,
            discount_rate=wacc,
            terminal_growth_rate=terminal_growth_rate,
            projection_years=projection_years,
            shares_outstanding=shares_outstanding,
            net_debt=net_debt,
            market_price=market_price,
            mode="fcfe",
        )

        reverse_fcff = self._reverse_dcf_growth(
            base_cash_flow=fcff_base,
            discount_rate=wacc,
            terminal_growth_rate=terminal_growth_rate,
            projection_years=projection_years,
            shares_outstanding=shares_outstanding,
            net_debt=net_debt,
            market_price=market_price,
            mode="fcff",
        )
        reverse_fcfe = self._reverse_dcf_growth(
            base_cash_flow=fcfe_base,
            discount_rate=wacc,
            terminal_growth_rate=terminal_growth_rate,
            projection_years=projection_years,
            shares_outstanding=shares_outstanding,
            net_debt=net_debt,
            market_price=market_price,
            mode="fcfe",
        )

        sensitivity = {
            "fcff": self._sensitivity_grid(
                base_cash_flow=fcff_base,
                growth_rate=growth_rate,
                discount_rate=wacc,
                terminal_growth_rate=terminal_growth_rate,
                projection_years=projection_years,
                shares_outstanding=shares_outstanding,
                net_debt=net_debt,
                market_price=market_price,
                mode="fcff",
            ),
            "fcfe": self._sensitivity_grid(
                base_cash_flow=fcfe_base,
                growth_rate=growth_rate,
                discount_rate=wacc,
                terminal_growth_rate=terminal_growth_rate,
                projection_years=projection_years,
                shares_outstanding=shares_outstanding,
                net_debt=net_debt,
                market_price=market_price,
                mode="fcfe",
            ),
        }

        peer_cache_key = f"valuation:peers:{symbol.upper()}:{self._sector_key(profile) or 'general'}"
        relative_valuation = await cache.remember(
            peer_cache_key,
            lambda: self._peer_snapshot(symbol, profile, market_price),
            ttl_seconds=3600,
        )

        return {
            "inputs": {
                "symbol": symbol.upper(),
                "base_year": latest_year,
                "currency": quote.get("currency") or "USD",
                "market_price": market_price,
                "market_cap": market_cap,
                "shares_outstanding": shares_outstanding,
                "net_debt": net_debt,
                "fcff_base": fcff_base,
                "fcfe_base": fcfe_base,
                "growth_rate": growth_rate,
                "terminal_growth_rate": terminal_growth_rate,
                "wacc": wacc,
                "cost_of_equity": cost_of_equity,
                "cost_of_debt": cost_of_debt,
                "tax_rate": tax_rate,
                "projection_years": projection_years,
            },
            "dcf": {
                "fcff": fcff_default,
                "fcfe": fcfe_default,
            },
            "reverse_dcf": {
                "fcff_required_growth_rate": reverse_fcff,
                "fcfe_required_growth_rate": reverse_fcfe,
            },
            "sensitivity": sensitivity,
            "relative_valuation": relative_valuation,
        }

    def _normalize_mode(self, mode: str | None) -> str:
        return "beginner" if str(mode or "").lower() == "beginner" else "pro"

    def _normalize_relevance_view(self, view: str | None) -> str:
        normalized = str(view or "long_term").strip().lower()
        if normalized in {"swing", "swing_trading", "swing-trading"}:
            return "swing"
        if normalized in {"dividend", "income", "dividend_income"}:
            return "dividend"
        return "long_term"

    def _market_scope_from_symbol(self, symbol: str) -> str:
        return "india" if self._is_india_symbol(symbol) else "us"

    def _section_priorities(self, mode: str, view: str, market: str) -> list[dict]:
        if mode == "beginner":
            priorities = [
                ("price", "Price & trend", 100),
                ("risk", "Risk summary", 96),
                ("valuation", "Valuation verdict", 92),
                ("profitability", "Business quality", 88),
                ("news", "News sentiment", 84),
                ("actions", "What to watch next", 80),
            ]
        else:
            priorities = [
                ("price", "Price/volume", 100),
                ("ratios", "Ratios dashboard", 96),
                ("financials", "Financial statements", 92),
                ("valuation", "Valuation engine", 90),
                ("peers", "Peers & benchmark", 88),
                ("events", "Events / corporate actions", 84),
                ("news", "News & sentiment", 80),
            ]
        if view == "dividend":
            priorities.insert(2, ("income", "Dividend profile", 94))
        if market == "india":
            priorities.append(("india_context", "India-specific context", 82))
        return [{"id": item_id, "label": label, "priority": score} for item_id, label, score in priorities]

    def _materiality_ranking(
        self,
        symbol: str,
        profile: dict,
        market_data: dict,
        ratios: dict,
        benchmark: dict | None,
        mode: str,
        view: str,
    ) -> list[dict]:
        company_pe = self._as_number(ratios.get("pe"))
        company_roe = self._as_number(ratios.get("roe"))
        company_growth = self._normalize_rate(ratios.get("revenue_growth"))
        company_margin = self._normalize_rate(ratios.get("profit_margin"))
        company_de = self._as_number(ratios.get("debt_to_equity"))
        company_beta = self._as_number(ratios.get("beta"))
        company_dividend = self._normalize_rate(ratios.get("dividend_yield"))
        perf = market_data.get("changes_percent") if isinstance(market_data, dict) else {}
        perf_1m = self._as_number((perf or {}).get("1m"))
        perf_1y = self._as_number((perf or {}).get("1y"))

        benchmark = benchmark or {}
        benchmark_pe = self._as_number(benchmark.get("sector_median_pe"))
        benchmark_roe = self._as_number(benchmark.get("sector_median_roe"))
        benchmark_growth = self._as_number(benchmark.get("sector_median_revenue_growth"))

        weights_by_view = {
            "long_term": {
                "roe": 28,
                "growth": 24,
                "valuation_pe": 18,
                "debt_to_equity": 16,
                "margin": 16,
                "beta": 8,
                "trend_1y": 10,
            },
            "swing": {
                "trend_1m": 28,
                "trend_1y": 16,
                "beta": 14,
                "valuation_pe": 8,
                "roe": 8,
                "growth": 10,
                "margin": 8,
                "debt_to_equity": 8,
            },
            "dividend": {
                "dividend_yield": 26,
                "valuation_pe": 14,
                "debt_to_equity": 20,
                "margin": 16,
                "roe": 14,
                "beta": 8,
                "trend_1y": 8,
            },
        }
        weights = weights_by_view.get(view, weights_by_view["long_term"])

        sector = str(profile.get("sector") or "").lower()
        if "financial" in sector and "debt_to_equity" in weights:
            # D/E is less comparable for banks/NBFCs; reduce overemphasis.
            weights = dict(weights)
            weights["debt_to_equity"] = max(4, int(weights["debt_to_equity"] * 0.35))
            weights["roe"] = weights.get("roe", 0) + 6

        candidates = [
            {
                "key": "valuation_pe",
                "label": "Valuation (P/E)",
                "category": "valuation",
                "value": company_pe,
                "unit": "x",
                "benchmark_value": benchmark_pe,
                "benchmark_label": "Sector median P/E",
                "higher_is_better": False,
                "base_weight": weights.get("valuation_pe", 0),
                "reason_template": "P/E vs sector median helps judge valuation stretch.",
            },
            {
                "key": "roe",
                "label": "ROE",
                "category": "profitability",
                "value": company_roe,
                "unit": "%",
                "scale_percent": True,
                "benchmark_value": benchmark_roe,
                "benchmark_label": "Sector median ROE",
                "higher_is_better": True,
                "base_weight": weights.get("roe", 0),
                "reason_template": "ROE reflects how efficiently management uses equity capital.",
            },
            {
                "key": "growth",
                "label": "Revenue Growth (YoY)",
                "category": "growth",
                "value": company_growth,
                "unit": "%",
                "scale_percent": True,
                "benchmark_value": benchmark_growth,
                "benchmark_label": "Sector median growth",
                "higher_is_better": True,
                "base_weight": weights.get("growth", 0),
                "reason_template": "Revenue growth is a core signal for durability and market share momentum.",
            },
            {
                "key": "margin",
                "label": "Profit Margin",
                "category": "profitability",
                "value": company_margin,
                "unit": "%",
                "scale_percent": True,
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": True,
                "base_weight": weights.get("margin", 0),
                "reason_template": "Margins show pricing power and operating discipline.",
            },
            {
                "key": "debt_to_equity",
                "label": "Debt/Equity",
                "category": "risk",
                "value": company_de,
                "unit": "x",
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": False,
                "base_weight": weights.get("debt_to_equity", 0),
                "reason_template": "Leverage can amplify upside and downside; lower is usually safer.",
            },
            {
                "key": "beta",
                "label": "Beta",
                "category": "risk",
                "value": company_beta,
                "unit": "x",
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": False,
                "base_weight": weights.get("beta", 0),
                "reason_template": "Beta estimates sensitivity to market moves and short-term volatility.",
            },
            {
                "key": "trend_1m",
                "label": "Price Change (1M)",
                "category": "momentum",
                "value": perf_1m,
                "unit": "%",
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": True,
                "base_weight": weights.get("trend_1m", 0),
                "reason_template": "Recent trend helps confirm momentum and timing context.",
            },
            {
                "key": "trend_1y",
                "label": "Price Change (1Y)",
                "category": "momentum",
                "value": perf_1y,
                "unit": "%",
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": True,
                "base_weight": weights.get("trend_1y", 0),
                "reason_template": "Longer trend indicates whether the stock is compounding or mean-reverting.",
            },
            {
                "key": "dividend_yield",
                "label": "Dividend Yield",
                "category": "income",
                "value": company_dividend,
                "unit": "%",
                "scale_percent": True,
                "benchmark_value": None,
                "benchmark_label": None,
                "higher_is_better": True,
                "base_weight": weights.get("dividend_yield", 0),
                "reason_template": "Yield matters most when screening for income-oriented strategies.",
            },
        ]

        ranked: list[dict] = []
        for item in candidates:
            value = self._as_number(item.get("value"))
            if value is None:
                continue
            benchmark_value = self._as_number(item.get("benchmark_value"))
            delta_percent = None
            if benchmark_value not in (None, 0):
                delta_percent = ((value - benchmark_value) / abs(benchmark_value)) * 100
            normalized_magnitude = 0.0
            if delta_percent is not None:
                normalized_magnitude = min(100.0, abs(delta_percent))
            else:
                normalized_magnitude = min(
                    100.0,
                    abs((value * 100) if item.get("unit") == "%" and item.get("scale_percent") else value),
                )
            score = float(item.get("base_weight") or 0) + normalized_magnitude * 0.35
            if item.get("category") == "risk" and view == "swing":
                score += 4
            verdict = "neutral"
            higher_is_better = bool(item.get("higher_is_better"))
            if delta_percent is not None:
                strong = delta_percent > 10 if higher_is_better else delta_percent < -10
                weak = delta_percent < -10 if higher_is_better else delta_percent > 10
            else:
                strong = False
                weak = False
                if item["key"] == "debt_to_equity" and value > 2.0:
                    weak = True
                if item["key"] == "debt_to_equity" and value <= 1.0:
                    strong = True
                if item["key"] == "beta" and value > 1.5:
                    weak = True
                if item["key"] == "beta" and value < 0.9:
                    strong = True
            if strong:
                verdict = "strong"
            elif weak:
                verdict = "watch"

            display_value = value
            if item.get("scale_percent"):
                display_value = value * 100

            ranked.append(
                {
                    "key": item["key"],
                    "label": item["label"],
                    "category": item["category"],
                    "value": display_value,
                    "unit": item.get("unit"),
                    "benchmark_value": (benchmark_value * 100 if item.get("scale_percent") and benchmark_value is not None else benchmark_value),
                    "benchmark_label": item.get("benchmark_label"),
                    "delta_percent": delta_percent,
                    "priority_score": round(score, 2),
                    "importance": "high" if score >= 40 else "medium" if score >= 22 else "low",
                    "verdict": verdict,
                    "why_it_matters": item.get("reason_template"),
                }
            )

        ranked.sort(key=lambda row: (-float(row.get("priority_score") or 0.0), str(row.get("label") or "")))
        return ranked[: (6 if mode == "beginner" else 10)]

    def _build_relevance_payload_from_context(
        self,
        symbol: str,
        profile: dict,
        market_data: dict,
        ratios: dict,
        benchmark: dict | None,
        mode: str,
        view: str,
    ) -> dict:
        market = self._market_scope_from_symbol(symbol)
        materiality = self._materiality_ranking(
            symbol=symbol,
            profile=profile,
            market_data=market_data,
            ratios=ratios,
            benchmark=benchmark,
            mode=mode,
            view=view,
        )
        relevance_filters = [
            {
                "id": "long_term",
                "label": "Long-term investor",
                "active": view == "long_term",
                "description": "Prioritizes durability, growth quality, profitability, and valuation context.",
            },
            {
                "id": "swing",
                "label": "Swing trader",
                "active": view == "swing",
                "description": "Prioritizes recent trend, volatility, and momentum/risk context.",
            },
            {
                "id": "dividend",
                "label": "Dividend investor",
                "active": view == "dividend",
                "description": "Prioritizes yield, balance-sheet safety, and cash generation quality.",
            },
        ]
        return {
            "mode": mode,
            "view": view,
            "market": market,
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "section_priorities": self._section_priorities(mode, view, market),
            "materiality_ranking": materiality,
            "headline_metrics": materiality[:3],
            "relevance_filters": relevance_filters,
        }

    async def _build_price_panel(self, symbol: str, period: str = "6mo") -> dict:
        upper_symbol = symbol.upper()
        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        history, history_meta = await self._cached_provider_call_with_meta(f"meta:history:{upper_symbol}:{period}", 300, "get_history", symbol, period)
        history_5y, history_5y_meta = await self._cached_provider_call_with_meta(f"meta:history:{upper_symbol}:5y", 300, "get_history", symbol, "5y")

        safe_history = [row for row in (history or []) if isinstance(row, dict) and self._is_finite_number(row.get("close")) and self._is_finite_number(row.get("volume"))]
        safe_history_5y = [
            row
            for row in (history_5y or [])
            if isinstance(row, dict) and self._is_finite_number(row.get("close")) and self._is_finite_number(row.get("volume"))
        ]
        latest_row = safe_history_5y[-1] if safe_history_5y else {}
        changes_percent = {
            "1d": self._change_for_offset(safe_history_5y, 1),
            "1w": self._change_for_offset(safe_history_5y, 5),
            "1m": self._change_for_offset(safe_history_5y, 21),
            "1y": self._change_for_offset(safe_history_5y, 252),
            "5y": self._change_for_offset(safe_history_5y, 1260),
        }
        ohlc = {
            "open": self._as_number(latest_row.get("open") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("open")),
            "high": self._as_number(latest_row.get("high") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("high")),
            "low": self._as_number(latest_row.get("low") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("low")),
            "close": self._as_number(latest_row.get("close") if isinstance(latest_row, dict) else None) or self._as_number(quote.get("close")) or self._as_number(quote.get("price")),
            "adjusted_close": self._as_number(latest_row.get("adj_close") if isinstance(latest_row, dict) else None),
        }
        market_data = {
            "live_price": self._as_number(quote.get("price")),
            "changes_percent": changes_percent,
            "volume": self._as_number(quote.get("volume")) or self._as_number(latest_row.get("volume") if isinstance(latest_row, dict) else None),
            "market_cap": self._as_number(quote.get("market_cap")),
            "week_52_high": self._as_number(profile.get("week_52_high")),
            "week_52_low": self._as_number(profile.get("week_52_low")),
            "beta": self._as_number(profile.get("beta")),
        }
        source_meta = {
            "quote": {**(quote_meta or {}), "ttl_seconds": 60},
            "profile": {**(profile_meta or {}), "ttl_seconds": 900},
            f"history_{period}": {**(history_meta or {}), "ttl_seconds": 300},
            "history_5y": {**(history_5y_meta or {}), "ttl_seconds": 300},
        }
        return {
            "data": {
                "quote": quote,
                "history_period": period,
                "history": safe_history,
                "ohlc": ohlc,
                "market_data": market_data,
            },
            "sources": source_meta,
            "warnings": self._collect_source_warnings(source_meta),
        }

    async def _build_financials_panel(self, symbol: str, years: int = 10) -> dict:
        upper_symbol = symbol.upper()
        financials, financials_meta = await self._cached_provider_call_with_meta(
            f"meta:financials:{upper_symbol}:{years}",
            6 * 3600,
            "get_financials",
            symbol,
            years,
        )
        source_meta = {"financials": {**(financials_meta or {}), "ttl_seconds": 6 * 3600}}
        return {"data": financials, "sources": source_meta, "warnings": self._collect_source_warnings(source_meta)}

    async def _build_ratios_panel(self, symbol: str, years: int = 10) -> dict:
        upper_symbol = symbol.upper()
        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        try:
            financials, financials_meta = await self._cached_provider_call_with_meta(
                f"meta:financials:{upper_symbol}:{years}", 6 * 3600, "get_financials", symbol, years
            )
        except HTTPException:
            financials = {"years": []}
            financials_meta = {"source": None, "fallback_used": True, "provider_errors": ["financials unavailable"], "attempted_providers": []}

        ratio_dashboard = self._build_ratio_dashboard(quote, profile, financials)
        profitability = ratio_dashboard.get("profitability", {}) if isinstance(ratio_dashboard, dict) else {}
        solvency = ratio_dashboard.get("solvency", {}) if isinstance(ratio_dashboard, dict) else {}
        normalized_de = self._as_number(solvency.get("debt_to_equity"))
        if normalized_de is None:
            profile_de = self._as_number(profile.get("debt_to_equity"))
            if profile_de is not None:
                normalized_de = profile_de / 100 if abs(profile_de) > 10 else profile_de
        ratios = {
            "pe": self._as_number(profile.get("trailing_pe")),
            "pb": self._as_number(profile.get("pb")),
            "peg": self._as_number(profile.get("peg")),
            "roe": self._as_number(profitability.get("roe")) if profitability.get("roe") is not None else self._normalize_rate(profile.get("roe")),
            "roce": self._as_number(profitability.get("roce")) if profitability.get("roce") is not None else self._normalize_rate(profile.get("roce")),
            "debt_to_equity": normalized_de,
            "profit_margin": self._as_number(profitability.get("net_margin")) if profitability.get("net_margin") is not None else self._normalize_rate(profile.get("profit_margin")),
            "revenue_growth": self._normalize_rate(profile.get("revenue_growth")),
            "dividend_yield": self._normalize_rate(profile.get("dividend_yield")),
            "eps": self._as_number(profile.get("eps")),
            "book_value": self._as_number(profile.get("book_value")),
            "beta": self._as_number(profile.get("beta")),
        }
        source_meta = {
            "quote": {**(quote_meta or {}), "ttl_seconds": 60},
            "profile": {**(profile_meta or {}), "ttl_seconds": 900},
            "financials": {**(financials_meta or {}), "ttl_seconds": 6 * 3600},
        }
        return {
            "data": {"ratios": ratios, "ratio_dashboard": ratio_dashboard},
            "sources": source_meta,
            "warnings": self._collect_source_warnings(source_meta),
        }

    async def _build_peers_panel(self, symbol: str) -> dict:
        upper_symbol = symbol.upper()
        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        peer_snapshot = await self._dashboard_peer_snapshot(symbol, quote, profile)
        source_meta = {"quote": {**(quote_meta or {}), "ttl_seconds": 60}, "profile": {**(profile_meta or {}), "ttl_seconds": 900}}
        return {"data": peer_snapshot, "sources": source_meta, "warnings": self._collect_source_warnings(source_meta)}

    async def _build_events_panel(self, symbol: str) -> dict:
        event_feed = await self._event_feed(symbol)
        return {
            "data": event_feed,
            "sources": {"events": {"source": event_feed.get("source"), "fallback_used": False, "ttl_seconds": 600}},
            "warnings": [],
        }

    async def _build_news_panel(self, symbol: str) -> dict:
        summary = await news_service.summarize(symbol)
        items: list[dict] = []
        errors: list[str] = []
        try:
            items = await news_service.fetch_news(symbol)
        except Exception as exc:
            errors.append(f"news_feed: {exc}")
        return {
            "data": {"summary": summary, "items": items[:10]},
            "sources": {"news": {"source": "yahoo", "fallback_used": False, "ttl_seconds": 300}},
            "warnings": [],
            "provider_errors": errors,
        }

    async def _build_summary_panel(self, symbol: str, mode: str = "pro") -> dict:
        mode = self._normalize_mode(mode)
        price_panel, ratios_panel, peers_panel = await asyncio.gather(
            self._build_price_panel(symbol, period="6mo"),
            self._build_ratios_panel(symbol, years=10),
            self._build_peers_panel(symbol),
        )
        quote = ((price_panel.get("data") or {}).get("quote") or {}) if isinstance(price_panel, dict) else {}
        market_data = ((price_panel.get("data") or {}).get("market_data") or {}) if isinstance(price_panel, dict) else {}
        ratios_bundle = (ratios_panel.get("data") or {}) if isinstance(ratios_panel, dict) else {}
        ratios = ratios_bundle.get("ratios") or {}
        ratio_dashboard = ratios_bundle.get("ratio_dashboard") or {}
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{symbol.upper()}", 900, "get_profile", symbol)
        benchmark = ((peers_panel.get("data") or {}).get("benchmark") or {}) if isinstance(peers_panel, dict) else {}
        relevance = self._build_relevance_payload_from_context(
            symbol=symbol,
            profile=profile,
            market_data=market_data,
            ratios=ratios,
            benchmark=benchmark,
            mode=mode,
            view="long_term",
        )
        summary_data = {
            "quote": quote,
            "profile": {
                "symbol": profile.get("symbol"),
                "name": profile.get("name"),
                "sector": profile.get("sector"),
                "industry": profile.get("industry"),
                "country": profile.get("country"),
                "exchange": profile.get("exchange"),
            },
            "market_data": market_data,
            "ratios": ratios,
            "ratio_dashboard": ratio_dashboard if mode == "pro" else None,
            "financial_highlights": {
                "sector": profile.get("sector"),
                "industry": profile.get("industry"),
                "market_cap": quote.get("market_cap"),
            },
            "benchmark_context": benchmark,
            "materiality": relevance.get("materiality_ranking"),
            "section_priorities": relevance.get("section_priorities"),
        }
        source_meta = {
            **(price_panel.get("sources") or {}),
            **(ratios_panel.get("sources") or {}),
            **(peers_panel.get("sources") or {}),
            "profile": {**(profile_meta or {}), "ttl_seconds": 900},
        }
        warnings = []
        warnings.extend(price_panel.get("warnings") or [])
        warnings.extend(ratios_panel.get("warnings") or [])
        warnings.extend(peers_panel.get("warnings") or [])
        return {"data": summary_data, "sources": source_meta, "warnings": warnings}

    async def _build_benchmark_context(self, symbol: str) -> dict:
        upper_symbol = symbol.upper()
        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        peer_snapshot = await self._dashboard_peer_snapshot(symbol, quote, profile)
        relative = await self._peer_snapshot(symbol, profile, self._as_number(quote.get("price")))
        data = {
            "symbol": upper_symbol,
            "market": self._market_scope_from_symbol(symbol),
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "company": {
                "price": self._as_number(quote.get("price")),
                "market_cap": self._as_number(quote.get("market_cap")),
                "pe": self._as_number(profile.get("trailing_pe")),
                "roe": self._normalize_rate(profile.get("roe")),
                "revenue_growth": self._normalize_rate(profile.get("revenue_growth")),
            },
            "peer_snapshot": peer_snapshot,
            "relative_valuation": relative.get("industry_multiple_comparison") if isinstance(relative, dict) else None,
            "peer_medians": relative.get("peer_medians") if isinstance(relative, dict) else None,
        }
        source_meta = {"quote": {**(quote_meta or {}), "ttl_seconds": 60}, "profile": {**(profile_meta or {}), "ttl_seconds": 900}}
        return {"data": data, "sources": source_meta, "warnings": self._collect_source_warnings(source_meta)}

    async def _build_relevance_context(self, symbol: str, mode: str = "beginner", view: str = "long_term") -> dict:
        mode = self._normalize_mode(mode)
        view = self._normalize_relevance_view(view)
        upper_symbol = symbol.upper()
        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        try:
            financials, financials_meta = await self._cached_provider_call_with_meta(f"meta:financials:{upper_symbol}:10", 6 * 3600, "get_financials", symbol, 10)
        except HTTPException:
            financials = {"years": []}
            financials_meta = {"source": None, "fallback_used": True, "provider_errors": ["financials unavailable"], "attempted_providers": []}
        history_5y, history_meta = await self._cached_provider_call_with_meta(f"meta:history:{upper_symbol}:5y", 300, "get_history", symbol, "5y")
        safe_history_5y = [
            row
            for row in (history_5y or [])
            if isinstance(row, dict) and self._is_finite_number(row.get("close")) and self._is_finite_number(row.get("volume"))
        ]
        market_data = {
            "changes_percent": {
                "1d": self._change_for_offset(safe_history_5y, 1),
                "1w": self._change_for_offset(safe_history_5y, 5),
                "1m": self._change_for_offset(safe_history_5y, 21),
                "1y": self._change_for_offset(safe_history_5y, 252),
                "5y": self._change_for_offset(safe_history_5y, 1260),
            },
            "market_cap": self._as_number(quote.get("market_cap")),
            "live_price": self._as_number(quote.get("price")),
            "volume": self._as_number(quote.get("volume")),
        }
        ratio_dashboard = self._build_ratio_dashboard(quote, profile, financials)
        profitability = ratio_dashboard.get("profitability", {}) if isinstance(ratio_dashboard, dict) else {}
        solvency = ratio_dashboard.get("solvency", {}) if isinstance(ratio_dashboard, dict) else {}
        ratios = {
            "pe": self._as_number(profile.get("trailing_pe")),
            "roe": profitability.get("roe") if profitability.get("roe") is not None else self._normalize_rate(profile.get("roe")),
            "revenue_growth": self._normalize_rate(profile.get("revenue_growth")),
            "profit_margin": profitability.get("net_margin") if profitability.get("net_margin") is not None else self._normalize_rate(profile.get("profit_margin")),
            "debt_to_equity": solvency.get("debt_to_equity"),
            "beta": self._as_number(profile.get("beta")),
            "dividend_yield": self._normalize_rate(profile.get("dividend_yield")),
        }
        peer_snapshot = await self._dashboard_peer_snapshot(symbol, quote, profile)
        benchmark = peer_snapshot.get("benchmark") if isinstance(peer_snapshot, dict) else {}
        data = self._build_relevance_payload_from_context(
            symbol=symbol,
            profile=profile,
            market_data=market_data,
            ratios=ratios,
            benchmark=benchmark,
            mode=mode,
            view=view,
        )
        data["benchmark_context"] = benchmark
        source_meta = {
            "quote": {**(quote_meta or {}), "ttl_seconds": 60},
            "profile": {**(profile_meta or {}), "ttl_seconds": 900},
            "history_5y": {**(history_meta or {}), "ttl_seconds": 300},
            "financials": {**(financials_meta or {}), "ttl_seconds": 6 * 3600},
        }
        return {"data": data, "sources": source_meta, "warnings": self._collect_source_warnings(source_meta)}

    async def panel(self, symbol: str, panel: str, mode: str = "pro", period: str = "6mo", years: int = 10) -> dict:
        panel_key = str(panel or "").strip().lower()
        mode = self._normalize_mode(mode)
        period = str(period or "6mo").strip().lower()
        years = max(3, min(15, int(years)))

        if panel_key == "price":
            return await self._panel_swr(symbol, "price", f"period={period}", lambda: self._build_price_panel(symbol, period=period))
        if panel_key == "summary":
            return await self._panel_swr(symbol, "summary", f"mode={mode}", lambda: self._build_summary_panel(symbol, mode=mode))
        if panel_key == "news":
            return await self._panel_swr(symbol, "news", "default", lambda: self._build_news_panel(symbol))
        if panel_key == "financials":
            return await self._panel_swr(symbol, "financials", f"years={years}", lambda: self._build_financials_panel(symbol, years=years))
        if panel_key == "ratios":
            return await self._panel_swr(symbol, "ratios", f"years={years}", lambda: self._build_ratios_panel(symbol, years=years))
        if panel_key == "peers":
            return await self._panel_swr(symbol, "peers", "default", lambda: self._build_peers_panel(symbol))
        if panel_key == "events":
            return await self._panel_swr(symbol, "events", "default", lambda: self._build_events_panel(symbol))
        raise HTTPException(status_code=404, detail=f"Unsupported panel '{panel}'.")

    async def benchmark_context(self, symbol: str) -> dict:
        return await self._panel_swr(symbol, "benchmark", "default", lambda: self._build_benchmark_context(symbol))

    async def relevance_context(self, symbol: str, mode: str = "beginner", view: str = "long_term") -> dict:
        normalized_mode = self._normalize_mode(mode)
        normalized_view = self._normalize_relevance_view(view)
        return await self._panel_swr(
            symbol,
            "relevance",
            f"mode={normalized_mode}:view={normalized_view}",
            lambda: self._build_relevance_context(symbol, mode=normalized_mode, view=normalized_view),
        )

    async def _from_providers(self, method_name: str, *args, **kwargs):
        errors: list[str] = []
        for provider in self.providers:
            ready = getattr(provider, "_ready", None)
            if callable(ready):
                try:
                    if not ready():
                        continue
                except Exception:
                    pass
            try:
                method = getattr(provider, method_name)
                return await method(*args, **kwargs)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover
                errors.append(f"{provider.name}: {exc}")
                continue
        detail = errors[0] if errors else "No configured providers are available."
        raise HTTPException(status_code=503, detail=f"Data providers unavailable: {detail}")

    async def search(self, query: str) -> list[dict]:
        key = f"search:{query.lower()}"
        try:
            provider_items = await cache.remember(key, lambda: self._from_providers("search", query), ttl_seconds=300)
        except Exception:
            provider_items = []
        items = [item for item in provider_items if isinstance(item, dict)]

        # Merge local universe suggestions so NSE/BSE symbols are consistently discoverable.
        try:
            universe = await universe_service.list_stocks(query=query, offset=0, limit=20)
            items.extend(universe.get("items", []))
        except Exception:
            pass

        normalized_query = query.strip().upper()
        looks_like_plain_india_symbol = (
            normalized_query
            and "." not in normalized_query
            and 1 <= len(normalized_query) <= 15
            and normalized_query[0].isalpha()
            and all(ch.isalnum() for ch in normalized_query)
        )
        if looks_like_plain_india_symbol:
            for suffix, exchange in ((".NS", "NSE"), (".BO", "BSE")):
                symbol = f"{normalized_query}{suffix}"
                items.append(
                    {
                        "symbol": symbol,
                        "name": f"{normalized_query} ({exchange})",
                        "exchange": exchange,
                        "country": "IN",
                        "currency": "INR",
                    }
                )

        dedup: dict[str, dict] = {}
        for item in items:
            symbol = str(item.get("symbol") or "").upper().strip()
            if not symbol:
                continue
            exchange = item.get("exchange")
            if isinstance(exchange, str) and exchange.upper() == "NSI":
                exchange = "NSE"
            candidate = {
                "symbol": symbol,
                "name": item.get("name") or symbol,
                "exchange": exchange,
                "country": item.get("country"),
                "currency": item.get("currency"),
            }
            if symbol not in dedup:
                dedup[symbol] = candidate
                continue
            # Keep the first hit for ranking order, but backfill missing metadata from later sources
            # (local universe is especially useful for NSE/BSE currency/country info).
            existing = dedup[symbol]
            for key in ("exchange", "country", "currency"):
                if not existing.get(key) and candidate.get(key):
                    existing[key] = candidate[key]
            existing_name = str(existing.get("name") or "").strip()
            if (not existing_name or existing_name == symbol) and candidate.get("name"):
                existing["name"] = candidate["name"]
        merged = list(dedup.values())

        def score(item: dict) -> tuple[int, int, str]:
            symbol = str(item.get("symbol") or "")
            name = str(item.get("name") or "")
            s = 0
            if normalized_query and symbol == normalized_query:
                s += 100
            if normalized_query and symbol.startswith(normalized_query):
                s += 40
            if normalized_query and normalized_query in name.upper():
                s += 25
            if symbol.endswith(".NS"):
                s += 8
            if symbol.endswith(".BO"):
                s += 6
            return (-s, len(symbol), symbol)

        merged.sort(key=score)
        return self._sanitize_json(merged[:20])

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

    async def dashboard(self, symbol: str, mode: str = "pro") -> dict:
        mode = self._normalize_mode(mode)
        upper_symbol = symbol.upper()

        quote, quote_meta = await self._cached_provider_call_with_meta(f"meta:quote:{upper_symbol}", 60, "get_quote", symbol)
        profile, profile_meta = await self._cached_provider_call_with_meta(f"meta:profile:{upper_symbol}", 900, "get_profile", symbol)
        history, history_meta = await self._cached_provider_call_with_meta(f"meta:history:{upper_symbol}:6mo", 300, "get_history", symbol, "6mo")
        history_5y, history_5y_meta = await self._cached_provider_call_with_meta(f"meta:history:{upper_symbol}:5y", 300, "get_history", symbol, "5y")
        try:
            financial_statements, financials_meta = await self._cached_provider_call_with_meta(f"meta:financials:{upper_symbol}:10", 6 * 3600, "get_financials", symbol, 10)
        except HTTPException:
            financial_statements = {"years": [], "income_statement": {"raw": [], "common_size": []}, "balance_sheet": {"raw": [], "common_size": []}, "cash_flow": {"raw": [], "common_size": []}}
            financials_meta = {
                "source": None,
                "fallback_used": True,
                "attempted_providers": [],
                "provider_errors": ["financials: provider unavailable"],
                "cache_status": "miss",
            }

        # Normalize history in case cached wrapper contains non-sanitized rows.
        history = [
            row
            for row in (history or [])
            if isinstance(row, dict) and self._is_finite_number(row.get("close")) and self._is_finite_number(row.get("volume"))
        ]
        history_5y = [
            row
            for row in (history_5y or [])
            if isinstance(row, dict) and self._is_finite_number(row.get("close")) and self._is_finite_number(row.get("volume"))
        ]

        ratio_dashboard = self._build_ratio_dashboard(quote, profile, financial_statements)
        profitability = ratio_dashboard.get("profitability", {}) if isinstance(ratio_dashboard, dict) else {}
        solvency = ratio_dashboard.get("solvency", {}) if isinstance(ratio_dashboard, dict) else {}

        normalized_debt_to_equity = self._as_number(solvency.get("debt_to_equity"))
        if normalized_debt_to_equity is None:
            profile_debt_to_equity = self._as_number(profile.get("debt_to_equity"))
            if profile_debt_to_equity is not None:
                normalized_debt_to_equity = profile_debt_to_equity / 100 if abs(profile_debt_to_equity) > 10 else profile_debt_to_equity

        ratios = {
            "pe": profile.get("trailing_pe"),
            "pb": profile.get("pb"),
            "peg": profile.get("peg"),
            "roe": profitability.get("roe") if profitability.get("roe") is not None else profile.get("roe"),
            "roce": profitability.get("roce") if profitability.get("roce") is not None else profile.get("roce"),
            "debt_to_equity": normalized_debt_to_equity,
            "profit_margin": profitability.get("net_margin") if profitability.get("net_margin") is not None else profile.get("profit_margin"),
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
            "roe": self._as_number(ratios.get("roe")),
            "roce": self._as_number(ratios.get("roce")),
            "debt_to_equity": self._as_number(ratios.get("debt_to_equity")),
        }
        peer_task = asyncio.create_task(self._dashboard_peer_snapshot(symbol, quote, profile))
        event_task = asyncio.create_task(self._event_feed(symbol))
        valuation_task = asyncio.create_task(self._build_valuation_engine(symbol, quote, profile, financial_statements)) if mode == "pro" else None
        peer_snapshot, event_feed = await asyncio.gather(peer_task, event_task)
        valuation_engine = await valuation_task if valuation_task is not None else None
        india_context = self._build_india_context(symbol, profile, financial_statements, ratio_dashboard, event_feed)

        backend_warnings: list[dict[str, str]] = []
        for section, meta in (
            ("Quote", quote_meta),
            ("Profile", profile_meta),
            ("Price history", history_meta),
            ("5Y history", history_5y_meta),
            ("Financial statements", financials_meta),
        ):
            if not isinstance(meta, dict):
                continue
            if meta.get("fallback_used"):
                source = meta.get("source") or "fallback"
                backend_warnings.append(
                    {
                        "section": section,
                        "message": f"Fallback path used. Current source: {source}.",
                    }
                )

        omitted_sections = []
        if mode != "pro":
            omitted_sections = ["valuation_engine", "financial_statements.raw_heavy_payload"]

        dashboard = {
            "quote": quote,
            "profile": clean_profile,
            "ratios": ratios,
            "financial_highlights": highlights,
            "history": history,
            "market_data": market_data,
            "ohlc": ohlc,
            "financial_statements": financial_statements if mode == "pro" else None,
            "ratio_dashboard": ratio_dashboard,
            "valuation_engine": valuation_engine,
            "peer_snapshot": peer_snapshot,
            "event_feed": event_feed,
            "india_context": india_context,
            "payload_profile": {
                "mode": mode,
                "included_sections": [
                    "quote",
                    "profile",
                    "ratios",
                    "financial_highlights",
                    "history",
                    "market_data",
                    "ohlc",
                    "ratio_dashboard",
                    "peer_snapshot",
                    "event_feed",
                    "india_context",
                    "data_sources",
                ]
                + (["financial_statements", "valuation_engine"] if mode == "pro" else []),
                "omitted_sections": omitted_sections,
            },
            "data_sources": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "panels": {
                    "quote": {**quote_meta, "ttl_seconds": 60},
                    "profile": {**profile_meta, "ttl_seconds": 900},
                    "history_6mo": {**history_meta, "ttl_seconds": 300},
                    "history_5y": {**history_5y_meta, "ttl_seconds": 300},
                    "financials": {**financials_meta, "ttl_seconds": 21600},
                    "dashboard_payload": {
                        "source": "aggregated",
                        "fallback_used": False,
                        "cache_status": "n/a",
                        "ttl_seconds": 0,
                    },
                    "events": {
                        "source": event_feed.get("source"),
                        "fallback_used": False,
                        "cache_status": "n/a",
                        "ttl_seconds": 600,
                        "provider_errors": [],
                    },
                },
                "warnings": backend_warnings,
                "payload_mode": mode,
            },
        }
        return self._sanitize_json(dashboard)

    async def _build_market_heatmap(self, limit: int) -> dict:
        def valid_symbol(raw: str) -> bool:
            symbol = raw.strip().upper()
            if not symbol or len(symbol) > 10:
                return False
            if not symbol[0].isalpha():
                return False
            return all(ch.isalnum() or ch in ".-" for ch in symbol)

        symbols: list[str] = []
        seen: set[str] = set()

        for symbol in self.MARKET_HEATMAP_SYMBOLS:
            upper = symbol.upper()
            if not valid_symbol(upper):
                continue
            if upper not in seen:
                seen.add(upper)
                symbols.append(upper)

        if len(symbols) < limit:
            try:
                universe = await universe_service.list_stocks(query="", offset=0, limit=min(600, limit * 8))
                for item in universe.get("items", []):
                    symbol = str(item.get("symbol") or "").upper()
                    if not valid_symbol(symbol):
                        continue
                    if symbol and symbol not in seen:
                        seen.add(symbol)
                        symbols.append(symbol)
                    if len(symbols) >= limit + 60:
                        break
            except Exception:
                pass

        candidate_symbols = symbols[: max(limit + 40, 80)]
        semaphore = asyncio.Semaphore(8)

        async def fetch(symbol: str):
            async with semaphore:
                try:
                    quote = await self.quote(symbol)
                except Exception:
                    return None

                market_cap = self._as_number(quote.get("market_cap"))
                change_percent = self._as_number(quote.get("change_percent"))
                price = self._as_number(quote.get("price"))

                if market_cap is None and price is None:
                    return None

                return {
                    "symbol": quote.get("symbol") or symbol,
                    "name": quote.get("name") or symbol,
                    "price": price,
                    "change_percent": change_percent,
                    "market_cap": market_cap,
                    "volume": self._as_number(quote.get("volume")),
                }

        rows = await asyncio.gather(*(fetch(symbol) for symbol in candidate_symbols))
        items = [row for row in rows if row]
        if not items:
            return self._market_heatmap_fallback(limit)

        items.sort(key=lambda item: item.get("market_cap") or 0.0, reverse=True)
        selected = items[:limit]

        advancers = sum(1 for item in selected if (item.get("change_percent") or 0) > 0)
        decliners = sum(1 for item in selected if (item.get("change_percent") or 0) < 0)
        unchanged = max(0, len(selected) - advancers - decliners)

        return {
            "as_of": datetime.now(timezone.utc).isoformat(),
            "items": selected,
            "stats": {
                "advancers": advancers,
                "decliners": decliners,
                "unchanged": unchanged,
            },
        }

    def _market_heatmap_fallback(self, limit: int) -> dict:
        selected_symbols = self.MARKET_HEATMAP_SYMBOLS[: max(20, min(limit, len(self.MARKET_HEATMAP_SYMBOLS)))]
        items = [
            {
                "symbol": symbol,
                "name": symbol,
                "price": None,
                "change_percent": None,
                "market_cap": None,
                "volume": None,
            }
            for symbol in selected_symbols
        ]
        return {
            "as_of": datetime.now(timezone.utc).isoformat(),
            "items": items,
            "stats": {
                "advancers": 0,
                "decliners": 0,
                "unchanged": len(items),
            },
        }

    async def market_heatmap(self, limit: int = 60) -> dict:
        safe_limit = max(20, min(200, limit))
        key = f"market-heatmap:{safe_limit}"
        try:
            data = await cache.remember(key, lambda: self._build_market_heatmap(safe_limit), ttl_seconds=600)
        except Exception:
            data = self._market_heatmap_fallback(safe_limit)
        return self._sanitize_json(data)


stock_service = StockService()
