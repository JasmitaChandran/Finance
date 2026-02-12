from __future__ import annotations

from app.services.stock_service import stock_service


class ScreenerService:
    async def run(self, symbols: list[str], filters: dict) -> list[dict]:
        rows = []
        for symbol in symbols:
            dashboard = await stock_service.dashboard(symbol)
            ratios = dashboard["ratios"]
            quote = dashboard["quote"]

            if filters.get("min_market_cap") and (quote.get("market_cap") or 0) < filters["min_market_cap"]:
                continue
            if filters.get("max_pe") and (ratios.get("pe") or 9999) > filters["max_pe"]:
                continue
            if filters.get("min_roe") and (ratios.get("roe") or -9999) < filters["min_roe"]:
                continue
            if filters.get("min_revenue_growth") and (ratios.get("revenue_growth") or -9999) < filters["min_revenue_growth"]:
                continue

            score = 0
            if ratios.get("roe"):
                score += min(float(ratios["roe"]) * 100, 30)
            if ratios.get("profit_margin"):
                score += min(float(ratios["profit_margin"]) * 100, 30)
            if ratios.get("revenue_growth"):
                score += min(float(ratios["revenue_growth"]) * 100, 40)

            rows.append(
                {
                    "symbol": symbol,
                    "name": quote.get("name"),
                    "price": quote.get("price"),
                    "market_cap": quote.get("market_cap"),
                    "pe": ratios.get("pe"),
                    "roe": ratios.get("roe"),
                    "revenue_growth": ratios.get("revenue_growth"),
                    "score": int(score),
                }
            )

        rows.sort(key=lambda item: item["score"], reverse=True)
        return rows


screener_service = ScreenerService()
