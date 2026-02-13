from __future__ import annotations

import asyncio
import math

import yfinance as yf

from app.services.providers.base import StockProvider


class YahooFinanceProvider(StockProvider):
    name = "yahoo"

    INCOME_PRIORITIES = [
        "Total Revenue",
        "Cost Of Revenue",
        "Gross Profit",
        "Operating Income",
        "EBIT",
        "EBITDA",
        "Pretax Income",
        "Net Income",
        "Basic EPS",
        "Diluted EPS",
    ]
    BALANCE_PRIORITIES = [
        "Total Assets",
        "Current Assets",
        "Cash And Cash Equivalents",
        "Total Liabilities Net Minority Interest",
        "Current Liabilities",
        "Long Term Debt",
        "Stockholders Equity",
        "Working Capital",
        "Tangible Book Value",
        "Net Debt",
    ]
    CASHFLOW_PRIORITIES = [
        "Operating Cash Flow",
        "Investing Cash Flow",
        "Financing Cash Flow",
        "Free Cash Flow",
        "Capital Expenditure",
        "Net Income",
        "Depreciation And Amortization",
    ]

    async def get_quote(self, symbol: str) -> dict:
        ticker = yf.Ticker(symbol)
        info = await asyncio.to_thread(lambda: ticker.fast_info)
        raw_info = await asyncio.to_thread(lambda: ticker.info)
        return {
            "symbol": symbol.upper(),
            "name": raw_info.get("shortName") or raw_info.get("longName") or symbol.upper(),
            "currency": info.get("currency") or raw_info.get("currency"),
            "price": info.get("lastPrice") or raw_info.get("currentPrice"),
            "change_percent": raw_info.get("regularMarketChangePercent"),
            "market_cap": info.get("marketCap") or raw_info.get("marketCap"),
            "volume": info.get("lastVolume") or raw_info.get("regularMarketVolume") or raw_info.get("volume"),
            "open": info.get("open") or raw_info.get("regularMarketOpen"),
            "high": info.get("dayHigh") or raw_info.get("regularMarketDayHigh"),
            "low": info.get("dayLow") or raw_info.get("regularMarketDayLow"),
            "close": info.get("lastPrice") or raw_info.get("regularMarketPrice") or raw_info.get("currentPrice"),
        }

    async def get_profile(self, symbol: str) -> dict:
        ticker = yf.Ticker(symbol)
        fast_info = await asyncio.to_thread(lambda: ticker.fast_info)
        info = await asyncio.to_thread(lambda: ticker.info)
        return {
            "symbol": symbol.upper(),
            "name": info.get("longName") or info.get("shortName") or symbol.upper(),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "website": info.get("website"),
            "description": info.get("longBusinessSummary"),
            "country": info.get("country"),
            "trailing_pe": info.get("trailingPE"),
            "roe": info.get("returnOnEquity"),
            "roce": info.get("returnOnCapital") or info.get("returnOnCapitalEmployed") or info.get("returnOnAssets"),
            "debt_to_equity": info.get("debtToEquity"),
            "profit_margin": info.get("profitMargins"),
            "revenue_growth": info.get("revenueGrowth"),
            "pb": info.get("priceToBook"),
            "peg": info.get("pegRatio"),
            "dividend_yield": info.get("dividendYield"),
            "eps": info.get("trailingEps"),
            "book_value": info.get("bookValue"),
            "beta": info.get("beta"),
            "enterprise_value": info.get("enterpriseValue"),
            "enterprise_to_ebitda": info.get("enterpriseToEbitda"),
            "free_cash_flow": info.get("freeCashflow"),
            "operating_cash_flow": info.get("operatingCashflow"),
            "total_debt": info.get("totalDebt"),
            "total_cash": info.get("totalCash"),
            "earnings_growth": info.get("earningsGrowth"),
            "shares_outstanding": info.get("sharesOutstanding"),
            "week_52_high": info.get("fiftyTwoWeekHigh") or fast_info.get("yearHigh"),
            "week_52_low": info.get("fiftyTwoWeekLow") or fast_info.get("yearLow"),
        }

    async def get_history(self, symbol: str, period: str = "6mo") -> list[dict]:
        ticker = yf.Ticker(symbol)
        history = await asyncio.to_thread(
            lambda: ticker.history(period=period, interval="1d", auto_adjust=False)
        )
        result = []
        has_adj_close = "Adj Close" in history.columns
        for idx, row in history.iterrows():
            close_value = float(row["Close"])
            result.append(
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": close_value,
                    "adj_close": float(row["Adj Close"]) if has_adj_close else close_value,
                    "volume": float(row["Volume"]),
                }
            )
        return result

    async def search(self, query: str) -> list[dict]:
        searcher = yf.Search(query, max_results=8)
        quotes = await asyncio.to_thread(lambda: searcher.quotes)
        return [
            {
                "symbol": item.get("symbol"),
                "name": item.get("shortname") or item.get("longname") or item.get("symbol"),
                "exchange": item.get("exchange"),
                "type": item.get("quoteType"),
            }
            for item in quotes
            if item.get("symbol")
        ]

    @staticmethod
    def _norm_metric(name: str) -> str:
        return "".join(ch for ch in name.lower() if ch.isalnum())

    @staticmethod
    def _to_number(value):
        try:
            numeric = float(value)
            return numeric if math.isfinite(numeric) else None
        except Exception:
            return None

    def _columns_to_years(self, df, years: int) -> list[tuple[str, object]]:
        columns = list(df.columns)
        columns_sorted = sorted(columns, key=lambda col: str(col), reverse=True)
        pairs = []
        seen_years = set()
        for col in columns_sorted:
            year = str(col)[:4]
            if len(year) == 4 and year.isdigit() and year not in seen_years:
                seen_years.add(year)
                pairs.append((year, col))
            if len(pairs) >= years:
                break
        return pairs

    def _select_metrics(self, df, priorities: list[str], row_limit: int = 16) -> list[str]:
        available = [str(index) for index in df.index]
        available_map = {self._norm_metric(metric): metric for metric in available}
        selected: list[str] = []

        for metric in priorities:
            found = available_map.get(self._norm_metric(metric))
            if found and found not in selected:
                selected.append(found)

        for metric in available:
            if metric not in selected:
                selected.append(metric)
            if len(selected) >= row_limit:
                break

        return selected[:row_limit]

    def _statement_block(self, df, years: int, priorities: list[str], base_candidates: list[str]) -> dict:
        if df is None or getattr(df, "empty", True):
            return {"raw": [], "common_size": [], "base_metric": None}

        year_pairs = self._columns_to_years(df, years)
        if not year_pairs:
            return {"raw": [], "common_size": [], "base_metric": None}

        year_keys = [year for year, _ in year_pairs]
        metrics = self._select_metrics(df, priorities=priorities)

        raw_rows = []
        for metric in metrics:
            values = {}
            has_data = False
            for year, col in year_pairs:
                val = self._to_number(df.at[metric, col]) if metric in df.index else None
                values[year] = val
                if val is not None:
                    has_data = True

            if not has_data:
                continue

            yoy_growth = {}
            for idx, year in enumerate(year_keys):
                if idx == len(year_keys) - 1:
                    yoy_growth[year] = None
                    continue
                current = values.get(year)
                previous = values.get(year_keys[idx + 1])
                if current is None or previous is None or previous == 0:
                    yoy_growth[year] = None
                else:
                    yoy_growth[year] = ((current - previous) / previous) * 100

            available_for_cagr = [(int(year), values.get(year)) for year in year_keys if values.get(year) is not None]
            cagr = None
            if len(available_for_cagr) >= 2:
                newest_year, newest_value = available_for_cagr[0]
                oldest_year, oldest_value = available_for_cagr[-1]
                periods = newest_year - oldest_year
                if periods <= 0:
                    periods = len(available_for_cagr) - 1
                if periods > 0 and newest_value and oldest_value and newest_value > 0 and oldest_value > 0:
                    cagr = ((newest_value / oldest_value) ** (1 / periods) - 1) * 100

            raw_rows.append(
                {
                    "metric": metric,
                    "values": values,
                    "yoy_growth": yoy_growth,
                    "cagr": cagr,
                }
            )

        base_metric = None
        norm_base_map = {self._norm_metric(candidate): candidate for candidate in base_candidates}
        row_lookup = {self._norm_metric(row["metric"]): row for row in raw_rows}

        for candidate_norm in norm_base_map:
            if candidate_norm in row_lookup:
                base_metric = row_lookup[candidate_norm]["metric"]
                break
        if not base_metric and raw_rows:
            base_metric = raw_rows[0]["metric"]

        common_size_rows = []
        base_row = next((row for row in raw_rows if row["metric"] == base_metric), None)
        if base_row:
            for row in raw_rows:
                cs_values = {}
                for year in year_keys:
                    value = row["values"].get(year)
                    base_value = base_row["values"].get(year)
                    if value is None or base_value in (None, 0):
                        cs_values[year] = None
                    else:
                        cs_values[year] = (value / base_value) * 100

                common_size_rows.append(
                    {
                        "metric": row["metric"],
                        "values": cs_values,
                        "yoy_growth": row["yoy_growth"],
                        "cagr": row["cagr"],
                    }
                )

        return {"raw": raw_rows, "common_size": common_size_rows, "base_metric": base_metric}

    async def get_financials(self, symbol: str, years: int = 10) -> dict:
        ticker = yf.Ticker(symbol)
        income_df, balance_df, cashflow_df = await asyncio.gather(
            asyncio.to_thread(lambda: ticker.income_stmt),
            asyncio.to_thread(lambda: ticker.balance_sheet),
            asyncio.to_thread(lambda: ticker.cashflow),
        )

        income_block = self._statement_block(
            income_df,
            years=years,
            priorities=self.INCOME_PRIORITIES,
            base_candidates=["Total Revenue", "Operating Revenue"],
        )
        balance_block = self._statement_block(
            balance_df,
            years=years,
            priorities=self.BALANCE_PRIORITIES,
            base_candidates=["Total Assets"],
        )
        cashflow_block = self._statement_block(
            cashflow_df,
            years=years,
            priorities=self.CASHFLOW_PRIORITIES,
            base_candidates=["Operating Cash Flow", "Net Cash Flow From Operating Activities"],
        )

        year_set = set()
        for block in [income_block, balance_block, cashflow_block]:
            rows = block.get("raw", [])
            if rows:
                for year in rows[0]["values"].keys():
                    year_set.add(year)
        years_out = sorted(year_set, reverse=True)

        return {
            "years": years_out[:years],
            "income_statement": income_block,
            "balance_sheet": balance_block,
            "cash_flow": cashflow_block,
            "meta": {
                "requested_years": years,
                "available_years": min(len(years_out), years),
            },
        }
