from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Any


class PortfolioService:
    def _to_number(self, value: Any) -> float | None:
        try:
            numeric = float(value)
            if math.isfinite(numeric):
                return numeric
        except Exception:
            return None
        return None

    def _safe_div(self, numerator: float | None, denominator: float | None) -> float | None:
        if numerator is None or denominator in (None, 0):
            return None
        return numerator / denominator

    def _mean(self, values: list[float]) -> float | None:
        if not values:
            return None
        return sum(values) / len(values)

    def _std(self, values: list[float]) -> float | None:
        if len(values) < 2:
            return None
        mean = self._mean(values)
        if mean is None:
            return None
        variance = sum((value - mean) ** 2 for value in values) / (len(values) - 1)
        return math.sqrt(variance)

    def _cov(self, x_values: list[float], y_values: list[float]) -> float | None:
        if len(x_values) != len(y_values) or len(x_values) < 2:
            return None
        mean_x = self._mean(x_values)
        mean_y = self._mean(y_values)
        if mean_x is None or mean_y is None:
            return None
        return sum((x - mean_x) * (y - mean_y) for x, y in zip(x_values, y_values)) / (len(x_values) - 1)

    def _to_date(self, value: Any) -> date | None:
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value[:10]).date()
            except Exception:
                return None
        return None

    def _daily_returns(self, values: list[float]) -> list[float]:
        returns: list[float] = []
        for idx in range(1, len(values)):
            previous = values[idx - 1]
            current = values[idx]
            if previous == 0:
                continue
            returns.append((current / previous) - 1)
        return returns

    def _max_drawdown(self, values: list[float]) -> float | None:
        if len(values) < 2:
            return None
        peak = values[0]
        worst = 0.0
        for value in values:
            if value > peak:
                peak = value
            if peak == 0:
                continue
            drawdown = (value - peak) / peak
            if drawdown < worst:
                worst = drawdown
        return worst

    def _annualized_return(self, values: list[float], periods_per_year: int = 252) -> float | None:
        if len(values) < 2 or values[0] <= 0 or values[-1] <= 0:
            return None
        periods = len(values) - 1
        if periods <= 0:
            return None
        return (values[-1] / values[0]) ** (periods_per_year / periods) - 1

    def _allocation(self, holdings: list[dict], key: str) -> list[dict]:
        totals: dict[str, float] = defaultdict(float)
        portfolio_value = sum(self._to_number(item.get("market_value")) or 0 for item in holdings)
        if portfolio_value <= 0:
            return []
        for item in holdings:
            bucket = str(item.get(key) or "Unknown")
            totals[bucket] += self._to_number(item.get("market_value")) or 0
        rows = []
        for bucket, value in totals.items():
            rows.append(
                {
                    key: bucket,
                    "value": round(value, 2),
                    "weight_percent": round((value / portfolio_value) * 100, 2),
                }
            )
        rows.sort(key=lambda row: row["value"], reverse=True)
        return rows

    def diversification_score(self, holdings: list[dict]) -> int:
        if not holdings:
            return 0

        total_value = sum(self._to_number(item.get("market_value")) or 0 for item in holdings)
        if total_value <= 0:
            return 0

        asset_weights = [(self._to_number(item.get("market_value")) or 0) / total_value for item in holdings]
        hhi = sum(weight**2 for weight in asset_weights)
        n = max(1, len(asset_weights))
        diversified_component = 0.0 if n == 1 else (1 - hhi) / (1 - (1 / n))

        sector_weights: dict[str, float] = defaultdict(float)
        for item in holdings:
            sector = str(item.get("sector") or "Unknown")
            sector_weights[sector] += (self._to_number(item.get("market_value")) or 0) / total_value

        top_sector = max(sector_weights.values()) if sector_weights else 1
        score = int(max(0, diversified_component) * 70 + (1 - top_sector) * 30)
        return max(0, min(100, score))

    def risk_level(self, annualized_volatility: float | None, max_drawdown: float | None) -> str:
        if annualized_volatility is None and max_drawdown is None:
            return "Low"

        vol = annualized_volatility or 0
        drawdown = abs(max_drawdown or 0)
        if vol >= 0.32 or drawdown >= 0.38:
            return "High"
        if vol >= 0.2 or drawdown >= 0.2:
            return "Medium"
        return "Low"

    def rebalance_suggestions(self, holdings: list[dict], sector_allocation: list[dict]) -> list[str]:
        if not holdings:
            return ["Add positions and transactions to generate actionable rebalancing guidance."]

        suggestions: list[str] = []
        top_holding = max(holdings, key=lambda item: self._to_number(item.get("market_value")) or 0)
        total_value = sum(self._to_number(item.get("market_value")) or 0 for item in holdings) or 1
        top_weight = ((self._to_number(top_holding.get("market_value")) or 0) / total_value) * 100

        if top_weight > 35:
            suggestions.append(f"Trim {top_holding.get('symbol')} exposure below 35% to reduce single-stock concentration.")

        if sector_allocation:
            top_sector = sector_allocation[0]
            if top_sector.get("weight_percent", 0) > 45:
                suggestions.append(f"Reduce {top_sector.get('sector')} allocation under 45% and diversify across defensives.")

        if len(sector_allocation) < 4:
            suggestions.append("Add positions from unrepresented sectors to improve resilience.")
        if len(holdings) < 6:
            suggestions.append("Increase holdings count to reduce single-stock risk.")

        if not suggestions:
            suggestions.append("Portfolio mix appears balanced; continue periodic quarterly review.")

        return suggestions

    def _build_series(self, holdings: list[dict], benchmark_history: list[dict]) -> dict:
        benchmark_points = []
        for row in benchmark_history or []:
            dt = self._to_date(row.get("date"))
            close = self._to_number(row.get("close"))
            if dt and close and close > 0:
                benchmark_points.append((dt, close))

        benchmark_points.sort(key=lambda item: item[0])
        if len(benchmark_points) < 30:
            return {"portfolio": [], "benchmark": [], "dates": []}

        holdings_with_history = []
        total_value = sum(self._to_number(item.get("market_value")) or 0 for item in holdings)
        for item in holdings:
            value = self._to_number(item.get("market_value")) or 0
            if value <= 0:
                continue
            points = []
            for row in item.get("history") or []:
                dt = self._to_date(row.get("date"))
                close = self._to_number(row.get("close"))
                if dt and close and close > 0:
                    points.append((dt, close))
            points.sort(key=lambda point: point[0])
            if points:
                holdings_with_history.append(
                    {
                        "symbol": item.get("symbol"),
                        "weight": value / total_value if total_value > 0 else 0,
                        "points": points,
                    }
                )

        if not holdings_with_history:
            return {"portfolio": [], "benchmark": [], "dates": []}

        benchmark_index_by_date = {dt: close for dt, close in benchmark_points}

        pointers = {item["symbol"]: 0 for item in holdings_with_history}
        last_close: dict[str, float] = {}
        base_close: dict[str, float] = {}
        start_benchmark_close = None

        portfolio_values: list[float] = []
        benchmark_values: list[float] = []
        dates: list[str] = []

        for dt, benchmark_close in benchmark_points:
            for item in holdings_with_history:
                symbol = item["symbol"]
                points = item["points"]
                pointer = pointers[symbol]
                while pointer < len(points) and points[pointer][0] <= dt:
                    last_close[symbol] = points[pointer][1]
                    pointer += 1
                pointers[symbol] = pointer

            if len(last_close) < len(holdings_with_history):
                continue

            if not base_close:
                for item in holdings_with_history:
                    symbol = item["symbol"]
                    base_close[symbol] = last_close[symbol]
                start_benchmark_close = benchmark_close

            if not start_benchmark_close or start_benchmark_close <= 0:
                continue

            portfolio_index = 0.0
            for item in holdings_with_history:
                symbol = item["symbol"]
                base = base_close.get(symbol)
                current = last_close.get(symbol)
                if not base or not current:
                    continue
                portfolio_index += item["weight"] * (current / base)

            benchmark_index = benchmark_index_by_date.get(dt, benchmark_close) / start_benchmark_close
            dates.append(dt.isoformat())
            portfolio_values.append(portfolio_index)
            benchmark_values.append(benchmark_index)

        return {"portfolio": portfolio_values, "benchmark": benchmark_values, "dates": dates}

    def _xirr(self, cashflows: list[tuple[date, float]]) -> float | None:
        if len(cashflows) < 2:
            return None
        has_pos = any(amount > 0 for _, amount in cashflows)
        has_neg = any(amount < 0 for _, amount in cashflows)
        if not (has_pos and has_neg):
            return None

        cashflows = sorted(cashflows, key=lambda item: item[0])
        start_date = cashflows[0][0]

        def xnpv(rate: float) -> float:
            total = 0.0
            for dt, amount in cashflows:
                years = (dt - start_date).days / 365.0
                total += amount / ((1 + rate) ** years)
            return total

        low = -0.9999
        high = 4.0
        f_low = xnpv(low)
        f_high = xnpv(high)

        for _ in range(16):
            if f_low * f_high <= 0:
                break
            high *= 2
            f_high = xnpv(high)

        if f_low * f_high > 0:
            return None

        for _ in range(120):
            mid = (low + high) / 2
            f_mid = xnpv(mid)
            if abs(f_mid) < 1e-8:
                return mid
            if f_low * f_mid <= 0:
                high = mid
                f_high = f_mid
            else:
                low = mid
                f_low = f_mid
        return (low + high) / 2

    def _tax_gain_calculation(self, transactions: list[dict], holding_prices: dict[str, float]) -> dict:
        lots_by_symbol: dict[str, list[dict]] = defaultdict(list)
        realized_short = 0.0
        realized_long = 0.0

        tx_rows = sorted(
            transactions,
            key=lambda item: (
                self._to_date(item.get("trade_date")) or date.min,
                str(item.get("created_at") or ""),
            ),
        )

        for tx in tx_rows:
            symbol = str(tx.get("symbol") or "").upper()
            side = str(tx.get("side") or "").lower()
            quantity = self._to_number(tx.get("quantity")) or 0
            price = self._to_number(tx.get("price")) or 0
            fee = self._to_number(tx.get("fee")) or 0
            trade_date = self._to_date(tx.get("trade_date")) or date.today()

            if not symbol or quantity <= 0 or price <= 0:
                continue

            if side == "buy":
                unit_cost = ((quantity * price) + fee) / quantity
                lots_by_symbol[symbol].append({"qty": quantity, "unit_cost": unit_cost, "date": trade_date})
                continue

            if side != "sell":
                continue

            remaining = quantity
            unit_proceeds = ((quantity * price) - fee) / quantity
            lots = lots_by_symbol[symbol]
            while remaining > 1e-9 and lots:
                lot = lots[0]
                matched = min(remaining, lot["qty"])
                gain = matched * (unit_proceeds - lot["unit_cost"])
                holding_days = (trade_date - lot["date"]).days
                if holding_days >= 365:
                    realized_long += gain
                else:
                    realized_short += gain
                lot["qty"] -= matched
                remaining -= matched
                if lot["qty"] <= 1e-9:
                    lots.pop(0)

            if remaining > 1e-9:
                unmatched_gain = remaining * unit_proceeds
                realized_short += unmatched_gain

        unrealized_short = 0.0
        unrealized_long = 0.0
        valuation_date = datetime.now(timezone.utc).date()
        for symbol, lots in lots_by_symbol.items():
            current_price = self._to_number(holding_prices.get(symbol))
            if current_price is None:
                continue
            for lot in lots:
                gain = lot["qty"] * (current_price - lot["unit_cost"])
                holding_days = (valuation_date - lot["date"]).days
                if holding_days >= 365:
                    unrealized_long += gain
                else:
                    unrealized_short += gain

        estimated_tax = max(0.0, realized_short * 0.3) + max(0.0, realized_long * 0.15)
        return {
            "realized_short_term": round(realized_short, 2),
            "realized_long_term": round(realized_long, 2),
            "unrealized_short_term": round(unrealized_short, 2),
            "unrealized_long_term": round(unrealized_long, 2),
            "estimated_tax_payable": round(estimated_tax, 2),
        }

    def insights(self, holdings: list[dict], transactions: list[dict], benchmark_history: list[dict]) -> dict:
        market_value = sum(self._to_number(item.get("market_value")) or 0 for item in holdings)
        cost_basis = sum(self._to_number(item.get("cost_basis")) or 0 for item in holdings)
        unrealized_pnl = sum(self._to_number(item.get("pnl")) or 0 for item in holdings)

        asset_allocation = self._allocation(holdings, "symbol")
        sector_allocation = self._allocation(holdings, "sector")
        diversification = self.diversification_score(holdings)

        series = self._build_series(holdings, benchmark_history)
        portfolio_values = series["portfolio"]
        benchmark_values = series["benchmark"]
        portfolio_returns = self._daily_returns(portfolio_values)
        benchmark_returns = self._daily_returns(benchmark_values)

        rf_annual = 0.04
        rf_daily = rf_annual / 252

        mean_portfolio = self._mean(portfolio_returns)
        std_portfolio = self._std(portfolio_returns)
        annualized_volatility = std_portfolio * math.sqrt(252) if std_portfolio is not None else None
        annualized_return = self._annualized_return(portfolio_values)
        benchmark_annualized_return = self._annualized_return(benchmark_values)
        max_drawdown = self._max_drawdown(portfolio_values)

        beta = None
        if portfolio_returns and benchmark_returns and len(portfolio_returns) == len(benchmark_returns):
            covariance = self._cov(portfolio_returns, benchmark_returns)
            benchmark_variance = self._std(benchmark_returns)
            if covariance is not None and benchmark_variance is not None and benchmark_variance > 0:
                beta = covariance / (benchmark_variance**2)

        sharpe = None
        if mean_portfolio is not None and std_portfolio and std_portfolio > 0:
            sharpe = ((mean_portfolio - rf_daily) / std_portfolio) * math.sqrt(252)

        downside_diffs = [min(0.0, ret - rf_daily) for ret in portfolio_returns]
        downside_std = None
        if downside_diffs and any(diff < 0 for diff in downside_diffs):
            downside_std = math.sqrt(sum(diff**2 for diff in downside_diffs) / len(downside_diffs))

        sortino = None
        if mean_portfolio is not None and downside_std and downside_std > 0:
            sortino = ((mean_portfolio - rf_daily) / downside_std) * math.sqrt(252)

        calmar = None
        if annualized_return is not None and max_drawdown is not None and max_drawdown < 0:
            calmar = annualized_return / abs(max_drawdown)

        information_ratio = None
        upside_capture = None
        downside_capture = None
        tracking_error = None

        if portfolio_returns and benchmark_returns and len(portfolio_returns) == len(benchmark_returns):
            active_returns = [p - b for p, b in zip(portfolio_returns, benchmark_returns)]
            mean_active = self._mean(active_returns)
            std_active = self._std(active_returns)
            if std_active and std_active > 0 and mean_active is not None:
                information_ratio = (mean_active / std_active) * math.sqrt(252)
                tracking_error = std_active * math.sqrt(252)

            upside_pairs = [(p, b) for p, b in zip(portfolio_returns, benchmark_returns) if b > 0]
            downside_pairs = [(p, b) for p, b in zip(portfolio_returns, benchmark_returns) if b < 0]

            if upside_pairs:
                avg_up_port = self._mean([p for p, _ in upside_pairs]) or 0
                avg_up_bench = self._mean([b for _, b in upside_pairs]) or 0
                if avg_up_bench != 0:
                    upside_capture = (avg_up_port / avg_up_bench) * 100

            if downside_pairs:
                avg_down_port = self._mean([p for p, _ in downside_pairs]) or 0
                avg_down_bench = self._mean([b for _, b in downside_pairs]) or 0
                if avg_down_bench != 0:
                    downside_capture = (avg_down_port / avg_down_bench) * 100

        holding_prices = {str(item.get("symbol")): self._to_number(item.get("current_price")) or 0 for item in holdings}
        tax = self._tax_gain_calculation(transactions, holding_prices)
        realized_pnl = (tax["realized_short_term"] or 0) + (tax["realized_long_term"] or 0)

        cashflows: list[tuple[date, float]] = []
        for tx in transactions:
            tx_date = self._to_date(tx.get("trade_date"))
            side = str(tx.get("side") or "").lower()
            qty = self._to_number(tx.get("quantity"))
            price = self._to_number(tx.get("price"))
            fee = self._to_number(tx.get("fee")) or 0
            if not tx_date or qty is None or price is None:
                continue
            gross = qty * price
            if side == "buy":
                cashflows.append((tx_date, -(gross + fee)))
            elif side == "sell":
                cashflows.append((tx_date, gross - fee))

        if market_value > 0:
            cashflows.append((datetime.now(timezone.utc).date(), market_value))

        xirr = self._xirr(cashflows)
        risk_level = self.risk_level(annualized_volatility, max_drawdown)

        benchmark_vol = self._std(benchmark_returns)
        benchmark_annual_vol = benchmark_vol * math.sqrt(252) if benchmark_vol is not None else None

        alpha = None
        if annualized_return is not None and benchmark_annualized_return is not None and beta is not None:
            alpha = annualized_return - (rf_annual + beta * (benchmark_annualized_return - rf_annual))

        suggestions = self.rebalance_suggestions(holdings, sector_allocation)

        return {
            "diversification_score": diversification,
            "risk_level": risk_level,
            "suggestions": suggestions,
            "auto_pnl_calculation": {
                "market_value": round(market_value, 2),
                "cost_basis": round(cost_basis, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "realized_pnl": round(realized_pnl, 2),
                "total_pnl": round(unrealized_pnl + realized_pnl, 2),
            },
            "xirr_percent": round(xirr * 100, 2) if xirr is not None else None,
            "asset_allocation": [
                {
                    "symbol": row.get("symbol"),
                    "value": row.get("value"),
                    "weight_percent": row.get("weight_percent"),
                }
                for row in asset_allocation
            ],
            "sector_allocation": [
                {
                    "sector": row.get("sector"),
                    "value": row.get("value"),
                    "weight_percent": row.get("weight_percent"),
                }
                for row in sector_allocation
            ],
            "beta_of_portfolio": round(beta, 4) if beta is not None else None,
            "sharpe_ratio": round(sharpe, 4) if sharpe is not None else None,
            "sortino_ratio": round(sortino, 4) if sortino is not None else None,
            "calmar_ratio": round(calmar, 4) if calmar is not None else None,
            "information_ratio": round(information_ratio, 4) if information_ratio is not None else None,
            "max_drawdown": round(max_drawdown * 100, 2) if max_drawdown is not None else None,
            "upside_capture": round(upside_capture, 2) if upside_capture is not None else None,
            "downside_capture": round(downside_capture, 2) if downside_capture is not None else None,
            "risk_vs_benchmark_comparison": {
                "benchmark_symbol": "SPY",
                "portfolio_annual_return_percent": round((annualized_return or 0) * 100, 2) if annualized_return is not None else None,
                "benchmark_annual_return_percent": round((benchmark_annualized_return or 0) * 100, 2)
                if benchmark_annualized_return is not None
                else None,
                "portfolio_annual_volatility_percent": round((annualized_volatility or 0) * 100, 2) if annualized_volatility is not None else None,
                "benchmark_annual_volatility_percent": round((benchmark_annual_vol or 0) * 100, 2) if benchmark_annual_vol is not None else None,
                "tracking_error_percent": round((tracking_error or 0) * 100, 2) if tracking_error is not None else None,
                "alpha_percent": round((alpha or 0) * 100, 2) if alpha is not None else None,
            },
            "tax_gain_calculation": tax,
        }


portfolio_service = PortfolioService()
