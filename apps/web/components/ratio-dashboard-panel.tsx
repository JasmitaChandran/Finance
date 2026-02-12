"use client";

import type { RatioDashboardData } from "@/lib/types";

type FormatType = "ratio" | "percent" | "score";

type RatioItem = {
  key: string;
  label: string;
  type: FormatType;
};

const liquidityItems: RatioItem[] = [
  { key: "current_ratio", label: "Current Ratio", type: "ratio" },
  { key: "quick_ratio", label: "Quick Ratio", type: "ratio" },
  { key: "cash_ratio", label: "Cash Ratio", type: "ratio" },
  { key: "operating_cash_flow_ratio", label: "Operating Cash Flow Ratio", type: "ratio" },
  { key: "working_capital_to_assets", label: "Working Capital / Assets", type: "percent" },
];

const solvencyItems: RatioItem[] = [
  { key: "debt_to_equity", label: "Debt / Equity", type: "ratio" },
  { key: "debt_ratio", label: "Debt Ratio", type: "percent" },
  { key: "equity_ratio", label: "Equity Ratio", type: "percent" },
  { key: "interest_coverage", label: "Interest Coverage", type: "ratio" },
  { key: "long_term_debt_to_capital", label: "Long-term Debt / Capital", type: "percent" },
];

const profitabilityItems: RatioItem[] = [
  { key: "gross_margin", label: "Gross Margin", type: "percent" },
  { key: "operating_margin", label: "Operating Margin", type: "percent" },
  { key: "net_margin", label: "Net Margin", type: "percent" },
  { key: "roa", label: "ROA", type: "percent" },
  { key: "roe", label: "ROE", type: "percent" },
  { key: "roce", label: "ROCE", type: "percent" },
  { key: "ebitda_margin", label: "EBITDA Margin", type: "percent" },
];

const efficiencyItems: RatioItem[] = [
  { key: "asset_turnover", label: "Asset Turnover", type: "ratio" },
  { key: "receivables_turnover", label: "Receivables Turnover", type: "ratio" },
  { key: "inventory_turnover", label: "Inventory Turnover", type: "ratio" },
  { key: "fixed_asset_turnover", label: "Fixed Asset Turnover", type: "ratio" },
  { key: "working_capital_turnover", label: "Working Capital Turnover", type: "ratio" },
];

const dupontItems: RatioItem[] = [
  { key: "net_margin", label: "Net Margin", type: "percent" },
  { key: "asset_turnover", label: "Asset Turnover", type: "ratio" },
  { key: "equity_multiplier", label: "Equity Multiplier", type: "ratio" },
  { key: "roe", label: "ROE (DuPont)", type: "percent" },
];

function formatValue(value: number | null | undefined, type: FormatType): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (type === "percent") {
    const normalized = Math.abs(value) < 2 ? value * 100 : value;
    return `${normalized.toFixed(2)}%`;
  }
  if (type === "score") return value.toFixed(2);
  return value.toFixed(2);
}

function prettySignalLabel(key: string): string {
  return key
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function ratioGrid(title: string, source: Record<string, number | null> | undefined, items: RatioItem[]) {
  return (
    <div className="rounded-2xl border border-borderGlass bg-bgSoft p-4">
      <h4 className="font-semibold text-textMain">{title}</h4>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={`${title}-${item.key}`} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">{item.label}</p>
            <p className="mt-1 font-semibold text-textMain">{formatValue(source?.[item.key], item.type)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function zoneTone(zone: string | undefined): string {
  if (zone === "Safe") return "text-success";
  if (zone === "Grey") return "text-warning";
  if (zone === "Distress") return "text-danger";
  return "text-textMuted";
}

export function RatioDashboardPanel({ data }: { data: RatioDashboardData | null | undefined }) {
  if (!data) {
    return (
      <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h3 className="font-display text-lg">Ratio Dashboard</h3>
        <p className="mt-2 text-sm text-textMuted">Ratios are unavailable for this symbol right now.</p>
      </section>
    );
  }

  const altman = data.altman_z_score || {};
  const signals = data.piotroski_f_score?.signals || {};
  const signalRows = Object.entries(signals);

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-lg">Ratio Dashboard</h3>
        <p className="text-xs text-textMuted">
          Year: {data.year || "-"}
          {data.prior_year ? ` (vs ${data.prior_year})` : ""}
        </p>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {ratioGrid("Liquidity Ratios", data.liquidity, liquidityItems)}
        {ratioGrid("Solvency Ratios", data.solvency, solvencyItems)}
        {ratioGrid("Profitability Ratios", data.profitability, profitabilityItems)}
        {ratioGrid("Efficiency Ratios", data.efficiency, efficiencyItems)}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">DuPont Analysis</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {dupontItems.map((item) => (
              <div key={item.key} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                <p className="text-textMuted">{item.label}</p>
                <p className="mt-1 font-semibold text-textMain">{formatValue(data.dupont_analysis?.[item.key], item.type)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Altman Z-Score</h4>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-borderGlass bg-card px-3 py-1 text-textMain">Score: {formatValue(altman.score, "score")}</span>
            <span className={`rounded-full border border-borderGlass bg-card px-3 py-1 ${zoneTone(altman.zone)}`}>Zone: {altman.zone || "Unknown"}</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">Working Capital / Assets</p>
              <p className="mt-1 font-semibold text-textMain">{formatValue(altman.components?.working_capital_to_assets, "percent")}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">Retained Earnings / Assets</p>
              <p className="mt-1 font-semibold text-textMain">{formatValue(altman.components?.retained_earnings_to_assets, "percent")}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">EBIT / Assets</p>
              <p className="mt-1 font-semibold text-textMain">{formatValue(altman.components?.ebit_to_assets, "percent")}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">Market Value Equity / Liabilities</p>
              <p className="mt-1 font-semibold text-textMain">{formatValue(altman.components?.market_value_equity_to_total_liabilities, "ratio")}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">Sales / Assets</p>
              <p className="mt-1 font-semibold text-textMain">{formatValue(altman.components?.sales_to_assets, "ratio")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-borderGlass bg-bgSoft p-4">
        <h4 className="font-semibold text-textMain">Piotroski F-Score</h4>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-borderGlass bg-card px-3 py-1 text-textMain">
            Score: {data.piotroski_f_score?.score ?? "-"} / {data.piotroski_f_score?.max_score ?? 9}
          </span>
          <span className="rounded-full border border-borderGlass bg-card px-3 py-1 text-textMuted">
            Checks used: {data.piotroski_f_score?.available_checks ?? 0}
          </span>
          <span className="rounded-full border border-borderGlass bg-card px-3 py-1 text-textMain">Signal: {data.piotroski_f_score?.label || "Unknown"}</span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {signalRows.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">{prettySignalLabel(key)}</p>
              <p className={`mt-1 font-semibold ${value === true ? "text-success" : value === false ? "text-danger" : "text-textMuted"}`}>
                {value === true ? "Pass" : value === false ? "Fail" : "N/A"}
              </p>
            </div>
          ))}
          {!signalRows.length && <p className="text-xs text-textMuted">Not enough data to evaluate Piotroski signals.</p>}
        </div>
      </div>
    </section>
  );
}
