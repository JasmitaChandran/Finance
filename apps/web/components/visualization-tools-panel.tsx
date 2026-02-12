"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  SunburstChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/lib/api";
import { formatCurrency, formatLarge } from "@/lib/format";
import type { FinancialStatementRow, FinancialStatementsData, MarketHeatmapData } from "@/lib/types";

type WaterfallStep = {
  label: string;
  kind: "total" | "delta";
  value: number;
  color: string;
};

type WaterfallBarPoint = {
  label: string;
  base: number;
  height: number;
  end: number;
  delta: number | null;
  color: string;
};

const tooltipContentStyle = {
  borderRadius: 10,
  border: "1px solid var(--border-glass)",
  background: "var(--card)",
};

const tooltipLabelStyle = {
  color: "var(--text-main)",
  fontWeight: 600,
};

const tooltipItemStyle = {
  color: "var(--text-main)",
};

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function metricKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueForYear(rows: FinancialStatementRow[], names: string[], year: string | undefined): number | null {
  if (!year) return null;
  const targets = new Set(names.map((name) => metricKey(name)));
  for (const row of rows) {
    if (!targets.has(metricKey(row.metric))) continue;
    const value = toNumber(row.values?.[year]);
    if (value !== null) return value;
  }
  return null;
}

function cagrForMetric(rows: FinancialStatementRow[], names: string[]): number | null {
  const targets = new Set(names.map((name) => metricKey(name)));
  for (const row of rows) {
    if (!targets.has(metricKey(row.metric))) continue;
    const value = toNumber(row.cagr);
    if (value !== null) return value;
  }
  return null;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatSignedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function buildWaterfall(steps: WaterfallStep[]): WaterfallBarPoint[] {
  let cumulative = 0;
  return steps.map((step) => {
    if (step.kind === "total") {
      const end = step.value;
      const point = {
        label: step.label,
        base: Math.min(0, end),
        height: Math.abs(end),
        end,
        delta: null,
        color: step.color,
      };
      cumulative = end;
      return point;
    }

    const start = cumulative;
    const end = cumulative + step.value;
    const point = {
      label: step.label,
      base: Math.min(start, end),
      height: Math.abs(step.value),
      end,
      delta: step.value,
      color: step.color,
    };
    cumulative = end;
    return point;
  });
}

function heatCellColor(changePercent: number | null | undefined): string {
  if (changePercent === null || changePercent === undefined || Number.isNaN(changePercent)) {
    return "rgba(148, 163, 184, 0.24)";
  }
  const intensity = Math.min(1, Math.abs(changePercent) / 5);
  if (changePercent > 0) {
    return `rgba(16, 185, 129, ${0.2 + intensity * 0.55})`;
  }
  if (changePercent < 0) {
    return `rgba(239, 68, 68, ${0.2 + intensity * 0.55})`;
  }
  return "rgba(148, 163, 184, 0.24)";
}

export function VisualizationToolsPanel({
  symbol,
  currency,
  financials,
}: {
  symbol: string;
  currency?: string;
  financials?: FinancialStatementsData | null;
}) {
  const [heatmap, setHeatmap] = useState<MarketHeatmapData | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHeatmapLoading(true);
    setHeatmapError(null);

    api
      .getMarketHeatmap(72)
      .then((response) => {
        if (!active) return;
        setHeatmap(response);
      })
      .catch((err) => {
        if (!active) return;
        setHeatmapError(err instanceof Error ? err.message : "Unable to load market heatmap.");
      })
      .finally(() => {
        if (active) setHeatmapLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const years = useMemo(() => financials?.years ?? [], [financials]);
  const latestYear = years[0];
  const orderedYears = [...years].reverse();

  const incomeRows = useMemo(() => financials?.income_statement?.raw ?? [], [financials]);
  const cashRows = useMemo(() => financials?.cash_flow?.raw ?? [], [financials]);
  const balanceRows = useMemo(() => financials?.balance_sheet?.raw ?? [], [financials]);

  const revenue = valueForYear(incomeRows, ["Total Revenue", "Operating Revenue", "Revenue", "Sales", "Net Sales"], latestYear);
  const costOfRevenueRaw = valueForYear(incomeRows, ["Cost Of Revenue", "Cost of Revenue", "Cost Of Goods Sold", "Cost of Goods Sold"], latestYear);
  const grossProfitRaw = valueForYear(incomeRows, ["Gross Profit"], latestYear);
  const operatingIncome = valueForYear(incomeRows, ["Operating Income", "Operating Income Loss"], latestYear);
  const netIncome = valueForYear(incomeRows, ["Net Income", "Net Income Common Stockholders"], latestYear);

  const costOfRevenue = costOfRevenueRaw === null ? (revenue !== null && grossProfitRaw !== null ? revenue - grossProfitRaw : null) : Math.abs(costOfRevenueRaw);
  const grossProfit = grossProfitRaw === null ? (revenue !== null && costOfRevenue !== null ? revenue - costOfRevenue : null) : grossProfitRaw;

  const operatingCashFlow = valueForYear(
    cashRows,
    ["Operating Cash Flow", "Net Cash Provided By Operating Activities", "Net Cash Flow From Operating Activities", "Cash Flow From Operations"],
    latestYear
  );
  const capexRaw = valueForYear(cashRows, ["Capital Expenditure", "Capital Expenditures", "Purchase Of PPE", "Purchase Of Property Plant And Equipment"], latestYear);
  const freeCashFlow = valueForYear(cashRows, ["Free Cash Flow", "FreeCashFlow"], latestYear);
  const financingCashFlow = valueForYear(cashRows, ["Financing Cash Flow", "Net Cash Flow From Financing Activities"], latestYear);

  const capexDelta = capexRaw === null ? null : capexRaw > 0 ? -capexRaw : capexRaw;

  const incomeWaterfall = useMemo(() => {
    const steps: WaterfallStep[] = [];
    if (revenue !== null) {
      steps.push({ label: "Revenue", kind: "total", value: revenue, color: "#22d3ee" });
    }
    if (costOfRevenue !== null) {
      steps.push({ label: "Cost of Revenue", kind: "delta", value: -Math.abs(costOfRevenue), color: "#fb7185" });
    }
    if (grossProfit !== null) {
      steps.push({ label: "Gross Profit", kind: "total", value: grossProfit, color: "#34d399" });
    }
    if (grossProfit !== null && operatingIncome !== null) {
      const operatingExpense = grossProfit - operatingIncome;
      steps.push({ label: "Operating Expense", kind: "delta", value: -Math.abs(operatingExpense), color: "#f59e0b" });
      steps.push({ label: "Operating Income", kind: "total", value: operatingIncome, color: "#10b981" });
    }
    if (operatingIncome !== null && netIncome !== null) {
      const belowOperating = operatingIncome - netIncome;
      steps.push({ label: "Tax + Other", kind: "delta", value: -Math.abs(belowOperating), color: "#f97316" });
      steps.push({ label: "Net Income", kind: "total", value: netIncome, color: "#4ade80" });
    }
    return buildWaterfall(steps);
  }, [costOfRevenue, grossProfit, netIncome, operatingIncome, revenue]);

  const cashBridge = useMemo(() => {
    const steps: WaterfallStep[] = [];
    if (operatingCashFlow !== null) {
      steps.push({ label: "Operating CF", kind: "total", value: operatingCashFlow, color: "#22d3ee" });
    }
    if (capexDelta !== null) {
      steps.push({ label: "CapEx", kind: "delta", value: capexDelta, color: "#fb7185" });
    }
    const computedFcf = operatingCashFlow !== null && capexDelta !== null ? operatingCashFlow + capexDelta : null;
    if (freeCashFlow !== null) {
      steps.push({ label: "Free CF", kind: "total", value: freeCashFlow, color: "#34d399" });
    } else if (computedFcf !== null) {
      steps.push({ label: "Free CF", kind: "total", value: computedFcf, color: "#34d399" });
    }
    if (financingCashFlow !== null) {
      steps.push({ label: "Financing CF", kind: "delta", value: financingCashFlow, color: "#f59e0b" });
    }
    return buildWaterfall(steps);
  }, [capexDelta, financingCashFlow, freeCashFlow, operatingCashFlow]);

  const cagrTrend = useMemo(() => {
    return orderedYears
      .map((year) => ({
        year,
        revenue: valueForYear(incomeRows, ["Total Revenue", "Operating Revenue", "Revenue", "Sales", "Net Sales"], year),
        netIncome: valueForYear(incomeRows, ["Net Income", "Net Income Common Stockholders"], year),
        freeCashFlow: valueForYear(cashRows, ["Free Cash Flow", "FreeCashFlow"], year),
      }))
      .filter((row) => row.revenue !== null || row.netIncome !== null || row.freeCashFlow !== null);
  }, [cashRows, incomeRows, orderedYears]);

  const cagrBadges = useMemo(
    () => [
      { label: "Revenue CAGR", value: cagrForMetric(incomeRows, ["Total Revenue", "Operating Revenue", "Revenue", "Sales", "Net Sales"]) },
      { label: "Net Income CAGR", value: cagrForMetric(incomeRows, ["Net Income", "Net Income Common Stockholders"]) },
      { label: "Free Cash Flow CAGR", value: cagrForMetric(cashRows, ["Free Cash Flow", "FreeCashFlow"]) },
    ],
    [cashRows, incomeRows]
  );

  const revenueSegmentation = useMemo(() => {
    if (revenue === null || revenue <= 0) return [];

    const segments: Array<{ name: string; value: number; color: string }> = [];
    const costPart = costOfRevenue !== null ? Math.max(0, Math.min(revenue, Math.abs(costOfRevenue))) : null;
    const grossPart = grossProfit !== null ? Math.max(0, Math.min(revenue, grossProfit)) : null;
    const operatingPart = operatingIncome !== null ? Math.max(0, Math.min(revenue, operatingIncome)) : null;
    const netPart = netIncome !== null ? Math.max(0, Math.min(revenue, netIncome)) : null;

    if (costPart !== null) segments.push({ name: "Cost of Revenue", value: costPart, color: "#fb7185" });
    if (grossPart !== null) segments.push({ name: "Gross Profit", value: grossPart, color: "#34d399" });
    if (operatingPart !== null) segments.push({ name: "Operating Income", value: operatingPart, color: "#f59e0b" });
    if (netPart !== null) segments.push({ name: "Net Income", value: netPart, color: "#22d3ee" });

    const unique: Record<string, { name: string; value: number; color: string }> = {};
    for (const entry of segments) {
      unique[entry.name] = entry;
    }
    return Object.values(unique).filter((entry) => entry.value > 0);
  }, [costOfRevenue, grossProfit, netIncome, operatingIncome, revenue]);

  const sunburstData = useMemo(() => {
    const assets = valueForYear(balanceRows, ["Total Assets"], latestYear);
    const liabilities = valueForYear(balanceRows, ["Total Liabilities Net Minority Interest", "Total Liabilities", "Total Liab"], latestYear);
    const equity = valueForYear(
      balanceRows,
      ["Stockholders Equity", "Shareholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"],
      latestYear
    );
    const safe = (value: number | null) => Math.max(0, Math.abs(value || 0));
    const leaf = (name: string, value: number | null, fill: string) => ({ name, value: safe(value), fill });
    const section = (name: string, children: Array<{ name: string; value: number; fill: string }>, fill: string) => {
      const filtered = children.filter((child) => child.value > 0);
      const total = filtered.reduce((sum, child) => sum + child.value, 0);
      return {
        name,
        value: total,
        fill,
        children: filtered,
      };
    };

    const income = section(
      "Income",
      [
        leaf("Revenue", revenue, "#22d3ee"),
        leaf("Gross Profit", grossProfit, "#34d399"),
        leaf("Operating Income", operatingIncome, "#f59e0b"),
        leaf("Net Income", netIncome, "#4ade80"),
      ],
      "#06b6d4"
    );
    const balance = section(
      "Balance Sheet",
      [
        leaf("Assets", assets, "#60a5fa"),
        leaf("Liabilities", liabilities, "#fb7185"),
        leaf("Equity", equity, "#22c55e"),
      ],
      "#3b82f6"
    );
    const cash = section(
      "Cash Flow",
      [
        leaf("Operating CF", operatingCashFlow, "#22d3ee"),
        leaf("Free CF", freeCashFlow, "#34d399"),
        leaf("Financing CF", financingCashFlow, "#f59e0b"),
      ],
      "#14b8a6"
    );

    const sections = [income, balance, cash].filter((node) => node.value > 0);
    const total = sections.reduce((sum, node) => sum + node.value, 0);

    if (!sections.length || total <= 0) {
      return {
        name: symbol.toUpperCase(),
        value: 3,
        children: [
          { name: "Income", value: 1, fill: "#334155" },
          { name: "Balance Sheet", value: 1, fill: "#475569" },
          { name: "Cash Flow", value: 1, fill: "#64748b" },
        ],
      };
    }

    return {
      name: symbol.toUpperCase(),
      value: total,
      children: sections,
    };
  }, [balanceRows, financingCashFlow, freeCashFlow, grossProfit, latestYear, netIncome, operatingCashFlow, operatingIncome, revenue, symbol]);

  const sunburstLegend = useMemo(
    () =>
      [
        { label: "Revenue", value: revenue, color: "#22d3ee" },
        { label: "Gross Profit", value: grossProfit, color: "#34d399" },
        { label: "Operating Income", value: operatingIncome, color: "#f59e0b" },
        { label: "Net Income", value: netIncome, color: "#4ade80" },
        { label: "Assets", value: valueForYear(balanceRows, ["Total Assets"], latestYear), color: "#60a5fa" },
        {
          label: "Liabilities",
          value: valueForYear(balanceRows, ["Total Liabilities Net Minority Interest", "Total Liabilities", "Total Liab"], latestYear),
          color: "#fb7185",
        },
        {
          label: "Equity",
          value: valueForYear(balanceRows, ["Stockholders Equity", "Shareholders Equity", "Total Equity Gross Minority Interest", "Common Stock Equity"], latestYear),
          color: "#22c55e",
        },
        { label: "Operating CF", value: operatingCashFlow, color: "#22d3ee" },
        { label: "Free CF", value: freeCashFlow, color: "#34d399" },
        { label: "Financing CF", value: financingCashFlow, color: "#f59e0b" },
      ].filter((item) => item.value !== null && item.value !== undefined),
    [balanceRows, financingCashFlow, freeCashFlow, grossProfit, latestYear, netIncome, operatingCashFlow, operatingIncome, revenue]
  );

  const maxHeatCap = useMemo(
    () =>
      (heatmap?.items || []).reduce((max, item) => {
        const cap = toNumber(item.market_cap) || 0;
        return Math.max(max, cap);
      }, 0),
    [heatmap]
  );

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-lg">Visualization Tools</h3>
        <p className="text-xs text-textMuted">Waterfall, CAGR trends, revenue pie, cash bridge, sunburst, and market heatmap.</p>
      </div>

      {!financials?.years?.length ? (
        <p className="mt-3 text-sm text-textMuted">Financial-statement visuals will appear once statement data is available for this symbol.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Waterfall Chart (Income)</h4>
              <p className="mt-1 text-xs text-textMuted">Latest year: {latestYear || "-"}</p>
              <div className="mt-3 h-64 w-full rounded-lg border border-borderGlass bg-card p-2">
                {!incomeWaterfall.length ? (
                  <p className="p-4 text-xs text-textMuted">Not enough income-statement data for waterfall view.</p>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={incomeWaterfall} margin={{ top: 10, right: 10, left: 6, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string, ctx) => {
                          if (name === "base") return null;
                          const row = ctx?.payload as WaterfallBarPoint | undefined;
                          if (!row) return formatLarge(value);
                          const detail = row.delta === null ? row.end : row.delta;
                          return formatCurrency(detail, currency || "USD");
                        }}
                        labelFormatter={(label) => String(label)}
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="height" stackId="waterfall" name="Amount">
                        {incomeWaterfall.map((entry) => (
                          <Cell key={`income-wf-${entry.label}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">CAGR Trend Graphs</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {cagrBadges.map((badge) => (
                  <span key={badge.label} className="rounded-full border border-borderGlass bg-card px-3 py-1 text-xs text-textMuted">
                    {badge.label}: <span className="text-textMain">{formatPct(badge.value)}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 h-64 w-full rounded-lg border border-borderGlass bg-card p-2">
                {!cagrTrend.length ? (
                  <p className="p-4 text-xs text-textMuted">Not enough yearly history for CAGR trend graph.</p>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={cagrTrend} margin={{ top: 10, right: 14, left: 6, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number | string) => {
                          if (typeof value !== "number") return value;
                          return formatCurrency(value, currency || "USD");
                        }}
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#22d3ee" strokeWidth={2.2} dot={{ r: 2.5 }} name="Revenue" />
                      <Line type="monotone" dataKey="netIncome" stroke="#4ade80" strokeWidth={2.2} dot={{ r: 2.5 }} name="Net Income" />
                      <Line type="monotone" dataKey="freeCashFlow" stroke="#f59e0b" strokeWidth={2.2} dot={{ r: 2.5 }} name="Free Cash Flow" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Revenue Segmentation Pie Chart</h4>
              <p className="mt-1 text-xs text-textMuted">Latest year composition using available income metrics.</p>
              <div className="mt-3 h-64 w-full rounded-lg border border-borderGlass bg-card p-2">
                {!revenueSegmentation.length ? (
                  <p className="p-4 text-xs text-textMuted">Revenue segmentation is unavailable for this symbol.</p>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={revenueSegmentation} dataKey="value" nameKey="name" outerRadius={88}>
                        {revenueSegmentation.map((entry) => (
                          <Cell key={`rev-segment-${entry.name}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string) => {
                          if (typeof value !== "number") return value;
                          return formatCurrency(value, currency || "USD");
                        }}
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
              <h4 className="font-semibold text-textMain">Cash Flow Bridge Chart</h4>
              <p className="mt-1 text-xs text-textMuted">Bridge from operating cash flow to free cash flow and financing impact.</p>
              <div className="mt-3 h-64 w-full rounded-lg border border-borderGlass bg-card p-2">
                {!cashBridge.length ? (
                  <p className="p-4 text-xs text-textMuted">Not enough cash-flow data for bridge view.</p>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={cashBridge} margin={{ top: 10, right: 10, left: 6, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string, ctx) => {
                          if (name === "base") return null;
                          const row = ctx?.payload as WaterfallBarPoint | undefined;
                          if (!row) return formatLarge(value);
                          const detail = row.delta === null ? row.end : row.delta;
                          return formatCurrency(detail, currency || "USD");
                        }}
                        contentStyle={tooltipContentStyle}
                        labelStyle={tooltipLabelStyle}
                        itemStyle={tooltipItemStyle}
                      />
                      <Bar dataKey="base" stackId="bridge" fill="transparent" isAnimationActive={false} />
                      <Bar dataKey="height" stackId="bridge" name="Amount">
                        {cashBridge.map((entry) => (
                          <Cell key={`cash-bridge-${entry.label}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
            <h4 className="font-semibold text-textMain">Sunburst Chart</h4>
            <p className="mt-1 text-xs text-textMuted">Hierarchical view of income, balance-sheet, and cash-flow magnitude. Hover arcs to inspect values.</p>
            <div className="mt-3 h-72 w-full rounded-lg border border-borderGlass bg-card p-2">
              <ResponsiveContainer>
                <SunburstChart
                  data={sunburstData}
                  dataKey="value"
                  innerRadius={34}
                  outerRadius={136}
                  stroke="rgba(15, 23, 42, 0.8)"
                  textOptions={{ fill: "transparent", stroke: "transparent", fontSize: "0px" }}
                >
                  <Tooltip
                    formatter={(value: number | string) => {
                      if (typeof value !== "number") return value;
                      return formatCurrency(value, currency || "USD");
                    }}
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                </SunburstChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sunburstLegend.slice(0, 9).map((item) => (
                <div key={`sunburst-legend-${item.label}`} className="flex items-center justify-between rounded-lg border border-borderGlass bg-card px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-2 text-textMuted">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                    {item.label}
                  </span>
                  <span className="font-medium text-textMain">{formatCurrency(item.value ?? null, currency || "USD")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold text-textMain">Heatmap of Market</h4>
          <p className="text-xs text-textMuted">
            {heatmap?.stats ? `Advancers: ${heatmap.stats.advancers} • Decliners: ${heatmap.stats.decliners} • Flat: ${heatmap.stats.unchanged}` : ""}
          </p>
        </div>

        {heatmapLoading && <p className="mt-3 text-xs text-textMuted">Loading market heatmap...</p>}
        {heatmapError && <p className="mt-3 text-xs text-danger">{heatmapError}</p>}

        {!heatmapLoading && !heatmapError && (
          <div className="mt-3 max-h-[29rem] overflow-y-auto rounded-lg border border-borderGlass bg-card p-2">
            <div className="flex flex-wrap gap-2">
              {(heatmap?.items || []).map((item) => {
                const cap = toNumber(item.market_cap) || 0;
                const weight = maxHeatCap > 0 ? Math.sqrt(cap / maxHeatCap) : 0.35;
                const width = Math.round(96 + weight * 130);
                const height = Math.round(56 + weight * 54);
                const change = toNumber(item.change_percent);
                const tileWidth = Math.max(96, Math.min(226, width));
                const tileHeight = Math.max(56, Math.min(112, height));
                const showCap = tileHeight >= 72;

                return (
                  <div
                    key={`market-heat-${item.symbol}`}
                    className="flex flex-col justify-between overflow-hidden rounded-md border border-borderGlass/60 p-2"
                    style={{
                      width: `${tileWidth}px`,
                      height: `${tileHeight}px`,
                      background: heatCellColor(change),
                    }}
                    title={`${item.symbol} • ${formatSignedPct(change)} • ${formatLarge(item.market_cap ?? null)}`}
                  >
                    <p className="truncate text-xs font-semibold leading-tight text-textMain">{item.symbol}</p>
                    <p className={`truncate text-[11px] leading-tight ${change !== null && change !== undefined && change < 0 ? "text-danger" : "text-success"}`}>
                      {formatSignedPct(change)}
                    </p>
                    {showCap && <p className="truncate text-[10px] leading-tight text-textMuted">{formatLarge(item.market_cap ?? null)}</p>}
                  </div>
                );
              })}
              {!heatmap?.items?.length && <p className="p-4 text-xs text-textMuted">Heatmap data unavailable right now.</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
