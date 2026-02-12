from __future__ import annotations

from collections import Counter


class PortfolioService:
    def diversification_score(self, positions: list[dict]) -> int:
        if not positions:
            return 0

        sector_counts = Counter([p.get("sector") or "Unknown" for p in positions])
        total = sum(sector_counts.values())
        concentration = max(sector_counts.values()) / total

        unique_symbols = len({p["symbol"] for p in positions})
        score = int((min(unique_symbols, 20) / 20) * 60 + (1 - concentration) * 40)
        return max(0, min(100, score))

    def risk_level(self, positions: list[dict]) -> str:
        if not positions:
            return "Low"

        high_growth_sectors = {"Technology", "Biotechnology", "Crypto", "EV", "AI"}
        volatile = sum(1 for p in positions if (p.get("sector") or "") in high_growth_sectors)

        ratio = volatile / len(positions)
        if ratio > 0.6:
            return "High"
        if ratio > 0.3:
            return "Medium"
        return "Low"

    def rebalance_suggestions(self, positions: list[dict]) -> list[str]:
        if not positions:
            return ["Add 5-8 diversified positions across sectors before optimizing."]

        sector_counts = Counter([p.get("sector") or "Unknown" for p in positions])
        top_sector, top_count = sector_counts.most_common(1)[0]

        suggestions = []
        if top_count / len(positions) > 0.45:
            suggestions.append(f"Reduce overexposure to {top_sector}; target under 35% allocation.")
        if len(sector_counts) < 4:
            suggestions.append("Add positions from unrepresented sectors to improve resilience.")
        if len(positions) < 6:
            suggestions.append("Increase holdings count to reduce single-stock risk.")

        if not suggestions:
            suggestions.append("Portfolio mix appears balanced; continue periodic quarterly review.")

        return suggestions

    def insights(self, positions: list[dict]) -> dict:
        return {
            "diversification_score": self.diversification_score(positions),
            "risk_level": self.risk_level(positions),
            "suggestions": self.rebalance_suggestions(positions),
        }


portfolio_service = PortfolioService()
