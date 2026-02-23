from __future__ import annotations

import asyncio
from collections import defaultdict
import math
from typing import Any

import yfinance as yf

from app.core.cache import cache
from app.services.stock_service import stock_service
from app.services.universe_service import universe_service


class ScreenerService:
    DEFAULT_UNIVERSE_LIMIT = 220
    DEFAULT_SCAN_TIMEOUT_SECONDS = 12.0
    MAX_SCAN_TIMEOUT_SECONDS = 22.0
    EVALUATION_TIMEOUT_SECONDS = 5.0
    INSIDER_SIGNAL_TIMEOUT_SECONDS = 2.5
    FINANCIALS_TIMEOUT_SECONDS = 2.8
    MAX_UNIVERSE_WITH_INSIDER = 120
    MAX_UNIVERSE_HEAVY_ADVANCED = 180
    BENCHMARK_SYMBOL = "SPY"
    FALLBACK_SCREENABLE_SYMBOLS = [
        "AAPL",
        "MSFT",
        "NVDA",
        "AMZN",
        "GOOGL",
        "META",
        "TSLA",
        "JPM",
        "V",
        "WMT",
        "XOM",
        "JNJ",
        "PG",
        "UNH",
        "BRK.B",
    ]
    FALLBACK_SCREENABLE_SYMBOLS_INDIA = [
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
        "KOTAKBANK.NS",
        "AXISBANK.NS",
        "ASIANPAINT.NS",
        "MARUTI.NS",
        "BAJFINANCE.NS",
    ]

    def _as_number(self, value: Any) -> float | None:
        try:
            number = float(value)
            if math.isfinite(number):
                return number
        except Exception:
            return None
        return None

    def _normalize_rate(self, value: Any) -> float | None:
        number = self._as_number(value)
        if number is None:
            return None
        if abs(number) > 2:
            return number / 100
        return number

    def _normalize_debt_to_equity(self, value: Any) -> float | None:
        number = self._as_number(value)
        if number is None:
            return None
        if abs(number) > 10:
            return number / 100
        return number

    def _normalize_percent_filter(self, value: Any) -> float | None:
        if value is None:
            return None
        return self._normalize_rate(value)

    @staticmethod
    def _norm_metric(name: str | None) -> str:
        if not name:
            return ""
        return "".join(ch for ch in str(name).lower() if ch.isalnum())

    def _pct_return(self, closes: list[float], days: int) -> float | None:
        if len(closes) <= days:
            return None
        latest = closes[-1]
        base = closes[-1 - days]
        if base == 0:
            return None
        return ((latest - base) / base) * 100

    def _annualized_volatility(self, closes: list[float]) -> float | None:
        if len(closes) < 22:
            return None
        returns: list[float] = []
        for idx in range(1, len(closes)):
            prev = closes[idx - 1]
            current = closes[idx]
            if prev <= 0:
                continue
            returns.append((current / prev) - 1)
        if len(returns) < 20:
            return None
        mean = sum(returns) / len(returns)
        variance = sum((value - mean) ** 2 for value in returns) / len(returns)
        return math.sqrt(variance) * math.sqrt(252) * 100

    def _daily_returns(self, closes: list[float]) -> list[float]:
        returns: list[float] = []
        for idx in range(1, len(closes)):
            prev = closes[idx - 1]
            current = closes[idx]
            if prev <= 0:
                continue
            returns.append((current / prev) - 1)
        return returns

    def _returns_map(self, history: list[dict]) -> dict[str, float]:
        closes_by_date: dict[str, float] = {}
        for row in history:
            if not isinstance(row, dict):
                continue
            date = str(row.get("date") or "")
            close = self._as_number(row.get("close"))
            if date and close is not None and close > 0:
                closes_by_date[date] = close

        returns: dict[str, float] = {}
        ordered_dates = sorted(closes_by_date)
        for idx in range(1, len(ordered_dates)):
            prev_close = closes_by_date[ordered_dates[idx - 1]]
            close = closes_by_date[ordered_dates[idx]]
            if prev_close <= 0:
                continue
            returns[ordered_dates[idx]] = (close / prev_close) - 1
        return returns

    def _max_drawdown_percent(self, closes: list[float]) -> float | None:
        if len(closes) < 3:
            return None
        peak = closes[0]
        worst_drawdown = 0.0
        for close in closes:
            if close > peak:
                peak = close
            if peak <= 0:
                continue
            drawdown = ((close / peak) - 1.0) * 100.0
            if drawdown < worst_drawdown:
                worst_drawdown = drawdown
        return abs(worst_drawdown)

    def _sharpe_ratio(self, returns: list[float], risk_free_rate: float = 0.04) -> float | None:
        if len(returns) < 20:
            return None
        mean_daily = sum(returns) / len(returns)
        variance = sum((item - mean_daily) ** 2 for item in returns) / len(returns)
        daily_std = math.sqrt(variance)
        if daily_std <= 0:
            return None
        annualized_return = mean_daily * 252
        annualized_volatility = daily_std * math.sqrt(252)
        if annualized_volatility == 0:
            return None
        return (annualized_return - risk_free_rate) / annualized_volatility

    def _beta_from_return_maps(self, symbol_returns: dict[str, float], benchmark_returns: dict[str, float]) -> float | None:
        common_dates = sorted(set(symbol_returns.keys()) & set(benchmark_returns.keys()))
        if len(common_dates) < 30:
            return None

        sym = [symbol_returns[date] for date in common_dates]
        bench = [benchmark_returns[date] for date in common_dates]
        mean_sym = sum(sym) / len(sym)
        mean_bench = sum(bench) / len(bench)
        var_bench = sum((value - mean_bench) ** 2 for value in bench) / len(bench)
        if var_bench <= 0:
            return None
        cov = sum((sym[idx] - mean_sym) * (bench[idx] - mean_bench) for idx in range(len(sym))) / len(sym)
        return cov / var_bench

    def _rolling_beta(self, symbol_returns: dict[str, float], benchmark_returns: dict[str, float], window: int = 63) -> float | None:
        common_dates = sorted(set(symbol_returns.keys()) & set(benchmark_returns.keys()))
        if len(common_dates) < window:
            return None
        sample_dates = common_dates[-window:]
        sample_symbol = {date: symbol_returns[date] for date in sample_dates}
        sample_benchmark = {date: benchmark_returns[date] for date in sample_dates}
        return self._beta_from_return_maps(sample_symbol, sample_benchmark)

    def _rsi(self, closes: list[float], period: int = 14) -> float | None:
        if len(closes) <= period:
            return None
        gains: list[float] = []
        losses: list[float] = []
        for idx in range(1, len(closes)):
            delta = closes[idx] - closes[idx - 1]
            gains.append(max(delta, 0))
            losses.append(max(-delta, 0))
        if len(gains) < period:
            return None
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        for idx in range(period, len(gains)):
            avg_gain = ((avg_gain * (period - 1)) + gains[idx]) / period
            avg_loss = ((avg_loss * (period - 1)) + losses[idx]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _volume_spike(self, volumes: list[float], multiplier: float = 1.8) -> bool:
        if len(volumes) < 21:
            return False
        latest = volumes[-1]
        baseline = sum(volumes[-21:-1]) / 20
        if baseline <= 0:
            return False
        return latest >= (baseline * multiplier)

    def _breakout(self, closes: list[float]) -> bool:
        if len(closes) < 90:
            return False
        latest = closes[-1]
        reference = max(closes[-80:-1])
        return latest > reference

    async def _insider_buying_signal(self, symbol: str) -> dict:
        key = f"insider-buying:{symbol.upper()}"

        async def _producer():
            ticker = yf.Ticker(symbol)
            purchases = await asyncio.to_thread(lambda: ticker.insider_purchases)
            if purchases is None or getattr(purchases, "empty", False):
                return {"signal": None, "net_shares": None, "buy_transactions": None, "sell_transactions": None}

            net_shares = None
            buys = None
            sells = None
            if hasattr(purchases, "iterrows"):
                for _, row in purchases.iterrows():
                    label = ""
                    shares = None
                    transactions = None
                    try:
                        label = str(row.iloc[0]).strip().lower()
                    except Exception:
                        label = ""
                    try:
                        shares = self._as_number(row.get("Shares", row.iloc[1] if len(row) > 1 else None))
                    except Exception:
                        shares = None
                    try:
                        transactions = self._as_number(row.get("Trans", row.iloc[2] if len(row) > 2 else None))
                    except Exception:
                        transactions = None

                    if "net shares purchased" in label:
                        net_shares = shares
                    elif label == "purchases":
                        buys = transactions
                    elif label == "sales":
                        sells = transactions

            signal = None
            if net_shares is not None:
                signal = net_shares > 0
                if signal and buys is not None and sells is not None and buys < sells:
                    signal = False

            return {
                "signal": signal,
                "net_shares": net_shares,
                "buy_transactions": buys,
                "sell_transactions": sells,
            }

        return await cache.remember(key, _producer, ttl_seconds=12 * 3600)

    def _sanitize_symbol(self, symbol: str) -> str | None:
        value = str(symbol or "").strip().upper()
        if not value or len(value) > 18:
            return None
        if not value[0].isalpha():
            return None
        if any(not (ch.isalnum() or ch in ".-") for ch in value):
            return None
        return value

    def _is_common_equity_candidate(self, symbol: str, name: str | None) -> bool:
        # Keep universe focused on screenable common equities.
        base_symbol = symbol
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            base_symbol = symbol[:-3]
        if len(base_symbol) > 12:
            return False
        upper_name = str(name or "").upper()
        blocked_terms = (
            "WARRANT",
            "RIGHT",
            "UNIT",
            "DEPOSITARY",
            "PREFERRED",
            "PREF ",
            "ETF",
            "ETN",
            "CLOSED END FUND",
            "MUTUAL FUND",
        )
        if any(term in upper_name for term in blocked_terms):
            return False
        return True

    async def _default_symbols(self, limit: int, market_scope: str = "global") -> list[str]:
        safe_limit = max(80, min(1200, limit))
        universe = await universe_service.list_stocks(query="", market=market_scope, offset=0, limit=safe_limit)
        items = universe.get("items", [])
        clean_symbols: list[str] = []
        seen: set[str] = set()

        # Seed with liquid, reliable symbols so scans return usable matches quickly.
        seed_list = self.FALLBACK_SCREENABLE_SYMBOLS
        if market_scope in {"india", "nse", "bse"}:
            seed_list = self.FALLBACK_SCREENABLE_SYMBOLS_INDIA
        elif market_scope in {"global", "all", ""}:
            seed_list = self.FALLBACK_SCREENABLE_SYMBOLS + self.FALLBACK_SCREENABLE_SYMBOLS_INDIA

        for seed in seed_list:
            symbol = self._sanitize_symbol(seed)
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            clean_symbols.append(symbol)
            if len(clean_symbols) >= safe_limit:
                return clean_symbols

        for item in items:
            raw_symbol = item.get("symbol")
            symbol = self._sanitize_symbol(raw_symbol)
            if not symbol or symbol in seen:
                continue
            if not self._is_common_equity_candidate(symbol, item.get("name")):
                continue
            seen.add(symbol)
            clean_symbols.append(symbol)
            if len(clean_symbols) >= safe_limit:
                break

        if clean_symbols:
            return clean_symbols

        fallback = seed_list or self.FALLBACK_SCREENABLE_SYMBOLS
        return fallback[:safe_limit]

    def _apply_numeric_filter(self, value: float | None, minimum: float | None = None, maximum: float | None = None) -> bool:
        if minimum is not None and (value is None or value < minimum):
            return False
        if maximum is not None and (value is None or value > maximum):
            return False
        return True

    def _scan_timeout_seconds(self, symbol_count: int, has_custom_symbols: bool, insider_only: bool) -> float:
        if has_custom_symbols:
            # Keep custom runs predictable while avoiding long-running proxy resets.
            estimated = 7.0 + (symbol_count * 0.16)
            return max(8.0, min(self.MAX_SCAN_TIMEOUT_SECONDS, estimated))
        if insider_only:
            return min(14.0, self.MAX_SCAN_TIMEOUT_SECONDS)
        return self.DEFAULT_SCAN_TIMEOUT_SECONDS

    def _is_heavy_advanced_run(self, filters: dict) -> bool:
        advanced_keys = (
            "breakout_only",
            "volume_spike_only",
            "magic_formula_only",
            "low_volatility_only",
            "high_momentum_only",
            "dividend_aristocrats_only",
            "insider_buying_only",
        )
        enabled = sum(1 for key in advanced_keys if filters.get(key))
        return enabled >= 4

    def _statement_rows(self, financials: dict, section: str) -> list[dict]:
        block = financials.get(section) if isinstance(financials, dict) else None
        if not isinstance(block, dict):
            return []
        rows = block.get("raw")
        if not isinstance(rows, list):
            return []
        return [row for row in rows if isinstance(row, dict)]

    def _statement_row(self, rows: list[dict], candidates: list[str]) -> dict | None:
        candidate_set = {self._norm_metric(candidate) for candidate in candidates}
        for row in rows:
            metric = self._norm_metric(row.get("metric"))
            if metric in candidate_set:
                return row
        return None

    def _row_value(self, row: dict | None, year: str | None) -> float | None:
        if not row or not year:
            return None
        values = row.get("values")
        if not isinstance(values, dict):
            return None
        return self._as_number(values.get(year))

    def _row_cagr(self, row: dict | None, years: list[str], span_years: int) -> float | None:
        if not row or len(years) <= span_years:
            return None
        values = row.get("values")
        if not isinstance(values, dict):
            return None
        latest_year = years[0]
        base_year = years[span_years]
        latest = self._as_number(values.get(latest_year))
        base = self._as_number(values.get(base_year))
        if latest is None or base is None or latest <= 0 or base <= 0:
            return None
        return (latest / base) ** (1 / span_years) - 1

    def _all_positive(self, row: dict | None, years: list[str], count: int) -> bool | None:
        if not row:
            return None
        values = row.get("values")
        if not isinstance(values, dict):
            return None
        sample_years = years[:count]
        if not sample_years:
            return None
        sample_values = [self._as_number(values.get(year)) for year in sample_years]
        if not any(value is not None for value in sample_values):
            return None
        return all((value is not None and value > 0) for value in sample_values)

    def _trend_decreasing(self, row: dict | None, years: list[str], count: int) -> bool | None:
        if not row:
            return None
        values = row.get("values")
        if not isinstance(values, dict):
            return None
        sample_years = years[:count]
        sample_values = [self._as_number(values.get(year)) for year in sample_years]
        cleaned = [value for value in sample_values if value is not None]
        if len(cleaned) < 3:
            return None
        return all(cleaned[idx] <= cleaned[idx + 1] for idx in range(len(cleaned) - 1))

    def _earnings_consistency_score(self, row: dict | None, years: list[str], count: int = 5) -> float | None:
        if not row:
            return None
        values = row.get("values")
        if not isinstance(values, dict):
            return None
        sample_years = years[:count]
        sample_values = [self._as_number(values.get(year)) for year in sample_years]
        valid_values = [value for value in sample_values if value is not None]
        if not valid_values:
            return None
        positive = sum(1 for value in valid_values if value > 0)
        return (positive / len(valid_values)) * 100

    def _operating_leverage_improving(self, operating_income_row: dict | None, revenue_row: dict | None, years: list[str]) -> bool | None:
        if not operating_income_row or not revenue_row or len(years) < 3:
            return None
        operating_values = operating_income_row.get("values")
        revenue_values = revenue_row.get("values")
        if not isinstance(operating_values, dict) or not isinstance(revenue_values, dict):
            return None

        sample_years = years[:3]
        margins: list[float] = []
        for year in sample_years:
            operating_income = self._as_number(operating_values.get(year))
            revenue = self._as_number(revenue_values.get(year))
            if operating_income is None or revenue is None or revenue == 0:
                return None
            margins.append(operating_income / revenue)
        return margins[0] >= margins[1] and margins[1] >= margins[2]

    def _piotroski_score(self, financials: dict, years: list[str]) -> int | None:
        if len(years) < 2:
            return None
        latest_year = years[0]
        prior_year = years[1]
        income_rows = self._statement_rows(financials, "income_statement")
        balance_rows = self._statement_rows(financials, "balance_sheet")
        cash_rows = self._statement_rows(financials, "cash_flow")

        net_income_row = self._statement_row(income_rows, ["Net Income", "Net Income Common Stockholders"])
        revenue_row = self._statement_row(income_rows, ["Total Revenue", "Revenue", "Operating Revenue"])
        gross_profit_row = self._statement_row(income_rows, ["Gross Profit"])
        operating_cash_flow_row = self._statement_row(cash_rows, ["Operating Cash Flow", "Net Cash Provided By Operating Activities"])
        total_assets_row = self._statement_row(balance_rows, ["Total Assets"])
        long_term_debt_row = self._statement_row(balance_rows, ["Long Term Debt"])
        current_assets_row = self._statement_row(balance_rows, ["Current Assets", "Total Current Assets"])
        current_liabilities_row = self._statement_row(balance_rows, ["Current Liabilities", "Total Current Liabilities"])
        shares_row = self._statement_row(balance_rows, ["Ordinary Shares Number", "Shares Outstanding", "Share Issued"])

        net_income = self._row_value(net_income_row, latest_year)
        prior_net_income = self._row_value(net_income_row, prior_year)
        ocf = self._row_value(operating_cash_flow_row, latest_year)
        total_assets = self._row_value(total_assets_row, latest_year)
        prior_total_assets = self._row_value(total_assets_row, prior_year)
        long_term_debt = self._row_value(long_term_debt_row, latest_year)
        prior_long_term_debt = self._row_value(long_term_debt_row, prior_year)
        current_assets = self._row_value(current_assets_row, latest_year)
        prior_current_assets = self._row_value(current_assets_row, prior_year)
        current_liabilities = self._row_value(current_liabilities_row, latest_year)
        prior_current_liabilities = self._row_value(current_liabilities_row, prior_year)
        gross_profit = self._row_value(gross_profit_row, latest_year)
        prior_gross_profit = self._row_value(gross_profit_row, prior_year)
        revenue = self._row_value(revenue_row, latest_year)
        prior_revenue = self._row_value(revenue_row, prior_year)
        shares = self._row_value(shares_row, latest_year)
        prior_shares = self._row_value(shares_row, prior_year)

        roa = (net_income / total_assets) if net_income is not None and total_assets not in (None, 0) else None
        prior_roa = (prior_net_income / prior_total_assets) if prior_net_income is not None and prior_total_assets not in (None, 0) else None
        current_ratio = (current_assets / current_liabilities) if current_assets is not None and current_liabilities not in (None, 0) else None
        prior_current_ratio = (
            prior_current_assets / prior_current_liabilities
            if prior_current_assets is not None and prior_current_liabilities not in (None, 0)
            else None
        )
        gross_margin = (gross_profit / revenue) if gross_profit is not None and revenue not in (None, 0) else None
        prior_gross_margin = (
            prior_gross_profit / prior_revenue
            if prior_gross_profit is not None and prior_revenue not in (None, 0)
            else None
        )
        asset_turnover = (revenue / total_assets) if revenue is not None and total_assets not in (None, 0) else None
        prior_asset_turnover = (
            prior_revenue / prior_total_assets
            if prior_revenue is not None and prior_total_assets not in (None, 0)
            else None
        )

        checks = [
            (roa is not None and roa > 0),
            (ocf is not None and ocf > 0),
            (roa is not None and prior_roa is not None and roa > prior_roa),
            (ocf is not None and net_income is not None and ocf > net_income),
            (long_term_debt is not None and prior_long_term_debt is not None and long_term_debt < prior_long_term_debt),
            (current_ratio is not None and prior_current_ratio is not None and current_ratio > prior_current_ratio),
            (shares is not None and prior_shares is not None and shares <= prior_shares),
            (gross_margin is not None and prior_gross_margin is not None and gross_margin > prior_gross_margin),
            (asset_turnover is not None and prior_asset_turnover is not None and asset_turnover > prior_asset_turnover),
        ]
        valid_checks = [check for check in checks if check is not None]
        if not valid_checks:
            return None
        return sum(1 for check in checks if check is True)

    def _extract_financial_metrics(self, financials: dict, market_cap: float | None, profile: dict) -> dict:
        years_raw = financials.get("years", []) if isinstance(financials, dict) else []
        years = [str(year) for year in years_raw if year is not None]
        income_rows = self._statement_rows(financials, "income_statement")
        balance_rows = self._statement_rows(financials, "balance_sheet")
        cash_rows = self._statement_rows(financials, "cash_flow")

        revenue_row = self._statement_row(income_rows, ["Total Revenue", "Revenue", "Operating Revenue"])
        eps_row = self._statement_row(income_rows, ["Diluted EPS", "Basic EPS", "Normalized Diluted EPS"])
        net_income_row = self._statement_row(income_rows, ["Net Income", "Net Income Common Stockholders"])
        operating_income_row = self._statement_row(income_rows, ["Operating Income", "Operating Income Loss"])
        equity_row = self._statement_row(balance_rows, ["Stockholders Equity", "Stockholders Equity Including Minority Interest", "Total Equity Gross Minority Interest"])
        liabilities_row = self._statement_row(balance_rows, ["Total Liabilities Net Minority Interest", "Total Liabilities", "Total Liab"])
        net_debt_row = self._statement_row(balance_rows, ["Net Debt"])
        total_debt_row = self._statement_row(balance_rows, ["Total Debt", "Long Term Debt"])
        cash_row = self._statement_row(balance_rows, ["Cash And Cash Equivalents", "Cash And Short Term Investments", "Cash"])
        free_cash_flow_row = self._statement_row(cash_rows, ["Free Cash Flow", "FreeCashFlow"])

        latest_year = years[0] if years else None
        previous_year = years[1] if len(years) > 1 else None

        revenue_cagr_3y = self._row_cagr(revenue_row, years, 3)
        eps_cagr_5y = self._row_cagr(eps_row, years, 5)

        free_cash_flow = self._row_value(free_cash_flow_row, latest_year)
        if free_cash_flow is None:
            free_cash_flow = self._as_number(profile.get("free_cash_flow"))
        fcf_yield = (free_cash_flow / market_cap) if free_cash_flow is not None and market_cap not in (None, 0) else None

        net_debt = self._row_value(net_debt_row, latest_year)
        if net_debt is None:
            total_debt = self._row_value(total_debt_row, latest_year)
            cash_value = self._row_value(cash_row, latest_year)
            if total_debt is None:
                total_debt = self._as_number(profile.get("total_debt"))
            if cash_value is None:
                cash_value = self._as_number(profile.get("total_cash"))
            if total_debt is not None or cash_value is not None:
                net_debt = (total_debt or 0.0) - (cash_value or 0.0)

        roic = self._normalize_rate(profile.get("roce"))
        ev_ebitda = self._as_number(profile.get("enterprise_to_ebitda"))
        if ev_ebitda is not None and abs(ev_ebitda) > 2000:
            ev_ebitda = None

        equity_latest = self._row_value(equity_row, latest_year)
        equity_previous = self._row_value(equity_row, previous_year)
        net_income_latest = self._row_value(net_income_row, latest_year)
        roe_avg_equity = None
        if net_income_latest is not None:
            avg_equity = None
            if equity_latest is not None and equity_previous is not None:
                avg_equity = (equity_latest + equity_previous) / 2
            elif equity_latest is not None:
                avg_equity = equity_latest
            if avg_equity not in (None, 0):
                roe_avg_equity = net_income_latest / avg_equity

        liabilities_latest = self._row_value(liabilities_row, latest_year)
        debt_to_equity = None
        if liabilities_latest is not None and equity_latest not in (None, 0):
            debt_to_equity = liabilities_latest / equity_latest

        fcf_positive_5y = self._all_positive(free_cash_flow_row, years, 5)
        debt_decreasing_trend = self._trend_decreasing(liabilities_row, years, 5)
        earnings_consistency_score = self._earnings_consistency_score(net_income_row, years, 5)
        operating_leverage_improving = self._operating_leverage_improving(operating_income_row, revenue_row, years)
        piotroski_score = self._piotroski_score(financials, years)

        return {
            "revenue_cagr_3y": revenue_cagr_3y,
            "eps_cagr_5y": eps_cagr_5y,
            "fcf_yield": fcf_yield,
            "roic": roic,
            "net_debt": net_debt,
            "ev_ebitda": ev_ebitda,
            "piotroski_score": piotroski_score,
            "fcf_positive_5y": fcf_positive_5y,
            "debt_decreasing_trend": debt_decreasing_trend,
            "earnings_consistency_score": earnings_consistency_score,
            "operating_leverage_improving": operating_leverage_improving,
            "roe_avg_equity": roe_avg_equity,
            "debt_to_equity": debt_to_equity,
        }

    def _score_row(self, row: dict) -> tuple[int, dict[str, int]]:
        quality = 0.0
        growth = 0.0
        risk = 0.0
        momentum = 0.0

        roe = self._normalize_rate(row.get("roe"))
        pe = self._as_number(row.get("pe"))
        debt = self._normalize_debt_to_equity(row.get("debt_to_equity"))
        revenue_growth = self._normalize_rate(row.get("revenue_growth"))
        revenue_cagr_3y = self._normalize_rate(row.get("revenue_cagr_3y"))
        eps_cagr_5y = self._normalize_rate(row.get("eps_cagr_5y"))
        roic = self._normalize_rate(row.get("roic"))
        piotroski = self._as_number(row.get("piotroski_score"))
        rsi = self._as_number(row.get("rsi_14"))
        momentum_6m = self._as_number(row.get("momentum_6m_percent"))
        volatility = self._as_number(row.get("annualized_volatility_percent"))
        beta = self._as_number(row.get("beta"))
        max_drawdown = self._as_number(row.get("max_drawdown_5y_percent"))

        if roe is not None:
            quality += min(max(roe * 120, -8), 14)
        if roic is not None:
            quality += min(max(roic * 120, -6), 12)
        if debt is not None:
            quality += min(max((2.0 - debt) * 4.0, -8), 8)
        if piotroski is not None:
            quality += min(max((piotroski - 4.5) * 1.2, -5), 6)

        if revenue_growth is not None:
            growth += min(max(revenue_growth * 100, -10), 12)
        if revenue_cagr_3y is not None:
            growth += min(max(revenue_cagr_3y * 110, -8), 12)
        if eps_cagr_5y is not None:
            growth += min(max(eps_cagr_5y * 120, -8), 12)
        if pe is not None and pe > 0:
            growth += min(max((30 - pe) * 0.25, -4), 5)

        if volatility is not None:
            risk += min(max((35 - volatility) * 0.25, -6), 8)
        if beta is not None:
            risk += min(max((1.3 - beta) * 5.0, -6), 6)
        if max_drawdown is not None:
            risk += min(max((55 - max_drawdown) * 0.16, -5), 7)

        if rsi is not None:
            if 45 <= rsi <= 65:
                momentum += 6
            elif 35 <= rsi <= 75:
                momentum += 3
            else:
                momentum -= 2
        if momentum_6m is not None:
            momentum += min(max(momentum_6m * 0.22, -6), 10)
        if row.get("breakout"):
            momentum += 5
        if row.get("volume_spike"):
            momentum += 4

        flags = row.get("advanced_flags") or {}
        if flags.get("high_momentum"):
            momentum += 3
        if flags.get("low_volatility"):
            risk += 2
        if flags.get("insider_buying"):
            quality += 3

        total = 28.0 + quality + growth + risk + momentum
        total_score = int(max(0, min(100, round(total))))

        breakdown = {
            "quality": int(max(0, round(quality))),
            "growth": int(max(0, round(growth))),
            "risk": int(max(0, round(risk))),
            "momentum": int(max(0, round(momentum))),
        }
        return total_score, breakdown

    def _sort_value(self, row: dict, sort_by: str) -> float:
        sort_map = {
            "ai_score": row.get("score"),
            "score": row.get("score"),
            "growth": row.get("revenue_growth"),
            "roe": row.get("roe"),
            "momentum": row.get("momentum_6m_percent"),
            "volatility": row.get("annualized_volatility_percent"),
            "composite_rank": row.get("composite_rank"),
            "revenue_cagr_3y": row.get("revenue_cagr_3y"),
            "eps_cagr_5y": row.get("eps_cagr_5y"),
            "fcf_yield": row.get("fcf_yield"),
            "roic": row.get("roic"),
            "piotroski_score": row.get("piotroski_score"),
            "sharpe_ratio": row.get("sharpe_ratio"),
        }
        value = self._as_number(sort_map.get(sort_by))
        if value is None:
            return -10_000_000.0
        return value

    def _relaxation_suggestions(self, elimination_counts: dict[str, int], filters: dict) -> list[dict]:
        if not elimination_counts:
            return []

        def dec_rate(value: float | None, step: float) -> float | None:
            if value is None:
                return None
            return round(max(0.0, value - step), 4)

        def inc_value(value: float | None, step: float) -> float | None:
            if value is None:
                return None
            return round(value + step, 4)

        suggestion_map = {
            "min_roe": lambda: f"Try reducing Min ROE from {round((filters.get('min_roe') or 0) * 100, 1)}% to {round((dec_rate(filters.get('min_roe'), 0.02) or 0) * 100, 1)}%.",
            "min_revenue_growth": lambda: (
                f"Try reducing Min Revenue Growth from {round((filters.get('min_revenue_growth') or 0) * 100, 1)}% "
                f"to {round((dec_rate(filters.get('min_revenue_growth'), 0.02) or 0) * 100, 1)}%."
            ),
            "max_pe": lambda: f"Try increasing Max P/E from {round(filters.get('max_pe') or 0, 1)} to {round(inc_value(filters.get('max_pe'), 5) or 0, 1)}.",
            "max_debt_to_equity": lambda: (
                f"Try increasing Max Debt/Equity from {round(filters.get('max_debt_to_equity') or 0, 2)}x "
                f"to {round(inc_value(filters.get('max_debt_to_equity'), 0.2) or 0, 2)}x."
            ),
            "breakout_only": lambda: "Try disabling Breakout-only to include non-breakout candidates.",
            "volume_spike_only": lambda: "Try disabling Volume-spike-only to avoid over-constraining liquidity filters.",
            "magic_formula_only": lambda: "Try disabling Magic Formula to widen candidate quality styles.",
            "low_volatility_only": lambda: "Try disabling Low Volatility to include higher-beta growth names.",
            "high_momentum_only": lambda: "Try disabling High Momentum to include early turnarounds.",
            "dividend_aristocrats_only": lambda: "Try disabling Dividend Aristocrats to include non-income growth stocks.",
            "insider_buying_only": lambda: "Try disabling Insider Buying; this filter is sparse and often removes most symbols.",
            "max_volatility_percentile": lambda: (
                f"Try increasing Max Volatility Percentile from {round(filters.get('max_volatility_percentile') or 0, 1)} "
                f"to {round(inc_value(filters.get('max_volatility_percentile'), 10) or 0, 1)}."
            ),
            "min_sharpe_ratio": lambda: f"Try lowering Min Sharpe from {round(filters.get('min_sharpe_ratio') or 0, 2)} to {round(dec_rate(filters.get('min_sharpe_ratio'), 0.2) or 0, 2)}.",
            "max_drawdown_5y_max": lambda: "Try increasing Max Drawdown (5Y) threshold to allow cyclical sectors.",
            "min_revenue_cagr_3y": lambda: "Try lowering Min Revenue CAGR (3Y) by 2 percentage points.",
            "min_eps_cagr_5y": lambda: "Try lowering Min EPS CAGR (5Y) by 2 percentage points.",
        }

        ordered = sorted(elimination_counts.items(), key=lambda item: item[1], reverse=True)
        suggestions = []
        for key, count in ordered[:5]:
            suggestion_builder = suggestion_map.get(key)
            suggestions.append(
                {
                    "filter": key,
                    "count": count,
                    "suggestion": suggestion_builder() if suggestion_builder else "Try relaxing this filter slightly.",
                }
            )
        return suggestions

    async def run(self, symbols: list[str], filters: dict) -> dict:
        normalized_filters = dict(filters)
        normalized_filters["min_roe"] = self._normalize_percent_filter(filters.get("min_roe"))
        normalized_filters["min_revenue_growth"] = self._normalize_percent_filter(filters.get("min_revenue_growth"))
        normalized_filters["min_revenue_cagr_3y"] = self._normalize_percent_filter(filters.get("min_revenue_cagr_3y"))
        normalized_filters["min_eps_cagr_5y"] = self._normalize_percent_filter(filters.get("min_eps_cagr_5y"))
        normalized_filters["max_debt_to_equity"] = self._normalize_debt_to_equity(filters.get("max_debt_to_equity"))

        sort_by = str(filters.get("sort_by") or "score").strip().lower()
        sort_order = str(filters.get("sort_order") or "desc").strip().lower()
        sort_desc = sort_order != "asc"
        market_scope = str(filters.get("market_scope") or "global").strip().lower()
        if market_scope not in {"global", "all", "us", "india", "nse", "bse"}:
            market_scope = "global"

        universe_limit = int(filters.get("universe_limit") or self.DEFAULT_UNIVERSE_LIMIT)
        result_limit = int(filters.get("limit") or 100)
        result_limit = max(10, min(result_limit, 500))

        clean_symbols = []
        seen = set()
        for raw in symbols or []:
            symbol = self._sanitize_symbol(raw)
            if symbol and symbol not in seen:
                seen.add(symbol)
                clean_symbols.append(symbol)

        has_custom_symbols = bool(clean_symbols)
        if not clean_symbols:
            clean_symbols = await self._default_symbols(universe_limit, market_scope=market_scope)

        if not clean_symbols:
            return {
                "items": [],
                "meta": {
                    "timed_out": False,
                    "partial": False,
                    "evaluated_symbols": 0,
                    "requested_symbols": 0,
                    "duration_ms": 0,
                    "has_custom_symbols": has_custom_symbols,
                    "universe_trimmed": False,
                    "trimmed_from": None,
                    "total_matches": 0,
                    "sort_by": sort_by,
                    "sort_order": "desc" if sort_desc else "asc",
                    "market_scope": market_scope,
                    "elimination_counts": {},
                    "relaxation_suggestions": [],
                },
            }

        original_symbol_count = len(clean_symbols)
        insider_only = bool(filters.get("insider_buying_only"))
        if not has_custom_symbols and insider_only and len(clean_symbols) > self.MAX_UNIVERSE_WITH_INSIDER:
            clean_symbols = clean_symbols[: self.MAX_UNIVERSE_WITH_INSIDER]
        elif not has_custom_symbols and self._is_heavy_advanced_run(filters) and len(clean_symbols) > self.MAX_UNIVERSE_HEAVY_ADVANCED:
            clean_symbols = clean_symbols[: self.MAX_UNIVERSE_HEAVY_ADVANCED]

        scan_timeout_seconds = self._scan_timeout_seconds(
            symbol_count=len(clean_symbols),
            has_custom_symbols=has_custom_symbols,
            insider_only=insider_only,
        )
        semaphore = asyncio.Semaphore(8)
        elimination_counts: dict[str, int] = defaultdict(int)
        elimination_lock = asyncio.Lock()

        requires_financial_filters = any(
            [
                bool(normalized_filters.get("fcf_positive_5y")),
                bool(normalized_filters.get("debt_decreasing_trend")),
                bool(normalized_filters.get("roic_gt_wacc")),
                bool(normalized_filters.get("operating_leverage_improving")),
                normalized_filters.get("min_revenue_cagr_3y") is not None,
                normalized_filters.get("min_eps_cagr_5y") is not None,
                normalized_filters.get("min_earnings_consistency") is not None,
            ]
        )

        benchmark_returns_1y: dict[str, float] = {}
        needs_benchmark = (
            normalized_filters.get("min_rolling_beta") is not None
            or normalized_filters.get("max_rolling_beta") is not None
            or normalized_filters.get("min_beta") is not None
            or normalized_filters.get("max_beta") is not None
        )
        if needs_benchmark:
            try:
                benchmark_history_1y = await asyncio.wait_for(stock_service.history(self.BENCHMARK_SYMBOL, period="1y"), timeout=4.5)
                benchmark_returns_1y = self._returns_map(benchmark_history_1y)
            except Exception:
                benchmark_returns_1y = {}

        async def evaluate(symbol: str):
            async with semaphore:
                async def reject(reason: str):
                    async with elimination_lock:
                        elimination_counts[reason] += 1
                    return None

                bundle = asyncio.gather(
                    stock_service.quote(symbol),
                    stock_service.profile(symbol),
                    stock_service.history(symbol, period="1y"),
                )
                try:
                    quote, profile, history = await asyncio.wait_for(bundle, timeout=self.EVALUATION_TIMEOUT_SECONDS)
                except asyncio.TimeoutError:
                    bundle.cancel()
                    await asyncio.gather(bundle, return_exceptions=True)
                    return None
                except asyncio.CancelledError:
                    bundle.cancel()
                    await asyncio.gather(bundle, return_exceptions=True)
                    raise
                except Exception:
                    return None

                closes = [self._as_number(row.get("close")) for row in history if isinstance(row, dict)]
                closes = [value for value in closes if value is not None and value > 0]
                volumes = [self._as_number(row.get("volume")) for row in history if isinstance(row, dict)]
                volumes = [value for value in volumes if value is not None and value >= 0]

                market_cap = self._as_number(quote.get("market_cap"))
                pe = self._as_number(profile.get("trailing_pe"))
                roe = self._normalize_rate(profile.get("roe"))
                revenue_growth = self._normalize_rate(profile.get("revenue_growth"))
                debt_to_equity = self._normalize_debt_to_equity(profile.get("debt_to_equity"))
                dividend_yield = self._normalize_rate(profile.get("dividend_yield"))
                profit_margin = self._normalize_rate(profile.get("profit_margin"))
                beta = self._as_number(profile.get("beta"))
                roic = self._normalize_rate(profile.get("roce"))
                free_cash_flow = self._as_number(profile.get("free_cash_flow"))
                total_debt = self._as_number(profile.get("total_debt"))
                total_cash = self._as_number(profile.get("total_cash"))
                net_debt = (total_debt or 0.0) - (total_cash or 0.0) if (total_debt is not None or total_cash is not None) else None
                ev_ebitda = self._as_number(profile.get("enterprise_to_ebitda"))
                fcf_yield = (free_cash_flow / market_cap) if free_cash_flow is not None and market_cap not in (None, 0) else None

                rsi_14 = self._rsi(closes)
                momentum_1m = self._pct_return(closes, 21)
                momentum_6m = self._pct_return(closes, 126)
                momentum_1y = self._pct_return(closes, min(252, max(1, len(closes) - 1))) if len(closes) > 1 else None
                annualized_vol = self._annualized_volatility(closes)
                one_year_returns = self._daily_returns(closes)
                sharpe_ratio = self._sharpe_ratio(one_year_returns)
                breakout = self._breakout(closes)
                volume_spike = self._volume_spike(volumes)
                returns_map = self._returns_map(history)
                rolling_beta_1y = self._rolling_beta(returns_map, benchmark_returns_1y) if benchmark_returns_1y else None

                max_drawdown_5y = None
                if normalized_filters.get("max_drawdown_5y_max") is not None:
                    try:
                        history_5y = await asyncio.wait_for(stock_service.history(symbol, period="5y"), timeout=3.0)
                        closes_5y = [self._as_number(item.get("close")) for item in history_5y if isinstance(item, dict)]
                        closes_5y = [value for value in closes_5y if value is not None and value > 0]
                        max_drawdown_5y = self._max_drawdown_percent(closes_5y)
                    except Exception:
                        max_drawdown_5y = None

                magic_formula = bool((pe is not None and pe > 0 and pe <= 25) and (roe is not None and roe >= 0.15))
                low_volatility = bool(annualized_vol is not None and annualized_vol <= 25)
                high_momentum = bool((momentum_6m is not None and momentum_6m >= 20) and (momentum_1m is not None and momentum_1m >= 0))
                dividend_aristocrat = bool(
                    (dividend_yield is not None and dividend_yield >= 0.015)
                    and (market_cap is not None and market_cap >= 10_000_000_000)
                    and (profit_margin is not None and profit_margin >= 0.05)
                )

                financial_metrics: dict[str, Any] = {}
                if requires_financial_filters:
                    try:
                        financials = await asyncio.wait_for(
                            stock_service.financial_statements(symbol, years=10),
                            timeout=self.FINANCIALS_TIMEOUT_SECONDS,
                        )
                        financial_metrics = self._extract_financial_metrics(financials, market_cap, profile)
                    except Exception:
                        financial_metrics = {}

                if financial_metrics:
                    if financial_metrics.get("roe_avg_equity") is not None:
                        roe = self._normalize_rate(financial_metrics.get("roe_avg_equity"))
                    if financial_metrics.get("debt_to_equity") is not None:
                        debt_to_equity = self._normalize_debt_to_equity(financial_metrics.get("debt_to_equity"))
                    if financial_metrics.get("fcf_yield") is not None:
                        fcf_yield = self._normalize_rate(financial_metrics.get("fcf_yield"))
                    if financial_metrics.get("roic") is not None:
                        roic = self._normalize_rate(financial_metrics.get("roic"))
                    if financial_metrics.get("net_debt") is not None:
                        net_debt = financial_metrics.get("net_debt")
                    if financial_metrics.get("ev_ebitda") is not None:
                        ev_ebitda = self._as_number(financial_metrics.get("ev_ebitda"))

                insider = {"signal": None, "net_shares": None, "buy_transactions": None, "sell_transactions": None}
                insider_required = bool(normalized_filters.get("insider_buying_only"))
                if insider_required:
                    try:
                        insider = await asyncio.wait_for(
                            self._insider_buying_signal(symbol),
                            timeout=self.INSIDER_SIGNAL_TIMEOUT_SECONDS,
                        )
                    except Exception:
                        insider = {"signal": None, "net_shares": None, "buy_transactions": None, "sell_transactions": None}

                if not self._apply_numeric_filter(market_cap, normalized_filters.get("min_market_cap"), normalized_filters.get("max_market_cap")):
                    return await reject("min_market_cap")
                if not self._apply_numeric_filter(pe, normalized_filters.get("min_pe"), normalized_filters.get("max_pe")):
                    return await reject("max_pe")
                if not self._apply_numeric_filter(roe, normalized_filters.get("min_roe"), None):
                    return await reject("min_roe")
                if not self._apply_numeric_filter(revenue_growth, normalized_filters.get("min_revenue_growth"), None):
                    return await reject("min_revenue_growth")
                if not self._apply_numeric_filter(debt_to_equity, None, normalized_filters.get("max_debt_to_equity")):
                    return await reject("max_debt_to_equity")
                if not self._apply_numeric_filter(rsi_14, normalized_filters.get("min_rsi"), normalized_filters.get("max_rsi")):
                    return await reject("rsi_range")
                if not self._apply_numeric_filter(beta, normalized_filters.get("min_beta"), normalized_filters.get("max_beta")):
                    return await reject("beta_range")
                if not self._apply_numeric_filter(rolling_beta_1y, normalized_filters.get("min_rolling_beta"), normalized_filters.get("max_rolling_beta")):
                    return await reject("rolling_beta_range")
                if not self._apply_numeric_filter(sharpe_ratio, normalized_filters.get("min_sharpe_ratio"), None):
                    return await reject("min_sharpe_ratio")
                if not self._apply_numeric_filter(max_drawdown_5y, None, normalized_filters.get("max_drawdown_5y_max")):
                    return await reject("max_drawdown_5y_max")
                if normalized_filters.get("breakout_only") and not breakout:
                    return await reject("breakout_only")
                if normalized_filters.get("volume_spike_only") and not volume_spike:
                    return await reject("volume_spike_only")
                if normalized_filters.get("magic_formula_only") and not magic_formula:
                    return await reject("magic_formula_only")
                if normalized_filters.get("low_volatility_only") and not low_volatility:
                    return await reject("low_volatility_only")
                if normalized_filters.get("high_momentum_only") and not high_momentum:
                    return await reject("high_momentum_only")
                if normalized_filters.get("dividend_aristocrats_only") and not dividend_aristocrat:
                    return await reject("dividend_aristocrats_only")
                if normalized_filters.get("insider_buying_only") and insider.get("signal") is not True:
                    return await reject("insider_buying_only")
                if normalized_filters.get("fcf_positive_5y") and financial_metrics.get("fcf_positive_5y") is not True:
                    return await reject("fcf_positive_5y")
                if normalized_filters.get("debt_decreasing_trend") and financial_metrics.get("debt_decreasing_trend") is not True:
                    return await reject("debt_decreasing_trend")
                if normalized_filters.get("roic_gt_wacc"):
                    roic_value = self._normalize_rate(financial_metrics.get("roic") if financial_metrics.get("roic") is not None else roic)
                    if roic_value is None or roic_value <= 0.09:
                        return await reject("roic_gt_wacc")
                if normalized_filters.get("operating_leverage_improving") and financial_metrics.get("operating_leverage_improving") is not True:
                    return await reject("operating_leverage_improving")
                if not self._apply_numeric_filter(financial_metrics.get("revenue_cagr_3y"), normalized_filters.get("min_revenue_cagr_3y"), None):
                    if normalized_filters.get("min_revenue_cagr_3y") is not None:
                        return await reject("min_revenue_cagr_3y")
                if not self._apply_numeric_filter(financial_metrics.get("eps_cagr_5y"), normalized_filters.get("min_eps_cagr_5y"), None):
                    if normalized_filters.get("min_eps_cagr_5y") is not None:
                        return await reject("min_eps_cagr_5y")
                if not self._apply_numeric_filter(
                    financial_metrics.get("earnings_consistency_score"),
                    normalized_filters.get("min_earnings_consistency"),
                    None,
                ):
                    if normalized_filters.get("min_earnings_consistency") is not None:
                        return await reject("min_earnings_consistency")

                row = {
                    "symbol": symbol,
                    "name": quote.get("name") or profile.get("name") or symbol,
                    "sector": profile.get("sector"),
                    "currency": quote.get("currency") or "USD",
                    "price": self._as_number(quote.get("price")),
                    "market_cap": market_cap,
                    "pe": pe,
                    "roe": roe,
                    "revenue_growth": revenue_growth,
                    "debt_to_equity": debt_to_equity,
                    "rsi_14": rsi_14,
                    "breakout": breakout,
                    "volume_spike": volume_spike,
                    "annualized_volatility_percent": annualized_vol,
                    "momentum_1m_percent": momentum_1m,
                    "momentum_6m_percent": momentum_6m,
                    "momentum_1y_percent": momentum_1y,
                    "beta": beta,
                    "dividend_yield": dividend_yield,
                    "fcf_yield": fcf_yield,
                    "roic": roic,
                    "revenue_cagr_3y": self._normalize_rate(financial_metrics.get("revenue_cagr_3y")),
                    "eps_cagr_5y": self._normalize_rate(financial_metrics.get("eps_cagr_5y")),
                    "net_debt": self._as_number(net_debt),
                    "ev_ebitda": self._as_number(ev_ebitda),
                    "piotroski_score": self._as_number(financial_metrics.get("piotroski_score")),
                    "max_drawdown_5y_percent": self._as_number(max_drawdown_5y),
                    "sharpe_ratio": self._as_number(sharpe_ratio),
                    "rolling_beta_1y": self._as_number(rolling_beta_1y),
                    "earnings_consistency_score": self._as_number(financial_metrics.get("earnings_consistency_score")),
                    "quality_flags": {
                        "fcf_positive_5y": financial_metrics.get("fcf_positive_5y"),
                        "debt_decreasing_trend": financial_metrics.get("debt_decreasing_trend"),
                        "roic_gt_wacc": (
                            self._normalize_rate(financial_metrics.get("roic") if financial_metrics.get("roic") is not None else roic) is not None
                            and self._normalize_rate(financial_metrics.get("roic") if financial_metrics.get("roic") is not None else roic) > 0.09
                        ),
                        "operating_leverage_improving": financial_metrics.get("operating_leverage_improving"),
                    },
                    "advanced_flags": {
                        "magic_formula": magic_formula,
                        "low_volatility": low_volatility,
                        "high_momentum": high_momentum,
                        "dividend_aristocrat": dividend_aristocrat,
                        "insider_buying": insider.get("signal"),
                    },
                    "insider_net_shares_6m": insider.get("net_shares"),
                }
                row["score"], row["score_breakdown"] = self._score_row(row)
                return row

        tasks = [asyncio.create_task(evaluate(symbol)) for symbol in clean_symbols]
        started_at = asyncio.get_running_loop().time()
        done, pending = await asyncio.wait(tasks, timeout=scan_timeout_seconds)

        rows: list[dict] = []
        for task in done:
            if task.cancelled():
                continue
            try:
                row = task.result()
            except Exception:
                continue
            if isinstance(row, dict):
                rows.append(row)

        if rows:
            volatility_values = sorted(
                [item.get("annualized_volatility_percent") for item in rows if self._as_number(item.get("annualized_volatility_percent")) is not None]
            )
            if volatility_values:
                for row in rows:
                    vol = self._as_number(row.get("annualized_volatility_percent"))
                    if vol is None:
                        row["volatility_percentile"] = None
                        continue
                    below = sum(1 for item in volatility_values if item <= vol)
                    row["volatility_percentile"] = (below / len(volatility_values)) * 100

            max_vol_pct = self._as_number(normalized_filters.get("max_volatility_percentile"))
            if max_vol_pct is not None:
                before = len(rows)
                rows = [
                    row
                    for row in rows
                    if (self._as_number(row.get("volatility_percentile")) is not None and row.get("volatility_percentile") <= max_vol_pct)
                ]
                removed = before - len(rows)
                if removed > 0:
                    elimination_counts["max_volatility_percentile"] += removed

        rows.sort(key=lambda item: (item.get("score") or 0, item.get("market_cap") or 0), reverse=True)
        for idx, row in enumerate(rows):
            row["composite_rank"] = idx + 1
            if len(rows) > 1:
                row["percentile_rank"] = ((len(rows) - (idx + 1)) / (len(rows) - 1)) * 100
            else:
                row["percentile_rank"] = 100.0

        sector_positions: dict[str, int] = defaultdict(int)
        for row in rows:
            sector = str(row.get("sector") or "Unknown")
            sector_positions[sector] += 1
            row["sector_rank"] = sector_positions[sector]

        if sort_by == "composite_rank":
            rows.sort(key=lambda item: item.get("composite_rank") or 10_000, reverse=sort_desc)
        else:
            rows.sort(key=lambda item: self._sort_value(item, sort_by), reverse=sort_desc)

        timed_out = bool(pending)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        duration_ms = int((asyncio.get_running_loop().time() - started_at) * 1000)
        suggestions = self._relaxation_suggestions(dict(elimination_counts), normalized_filters)
        return {
            "items": rows[:result_limit],
            "meta": {
                "timed_out": timed_out,
                "partial": timed_out,
                "evaluated_symbols": len(done),
                "requested_symbols": len(clean_symbols),
                "duration_ms": duration_ms,
                "has_custom_symbols": has_custom_symbols,
                "universe_trimmed": len(clean_symbols) < original_symbol_count,
                "trimmed_from": original_symbol_count if len(clean_symbols) < original_symbol_count else None,
                "total_matches": len(rows),
                "sort_by": sort_by,
                "sort_order": "desc" if sort_desc else "asc",
                "market_scope": market_scope,
                "elimination_counts": dict(elimination_counts),
                "relaxation_suggestions": suggestions,
            },
        }


screener_service = ScreenerService()
