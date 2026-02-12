"use client";

import { useMemo, useState } from "react";

import type { FinancialStatementBlock, FinancialStatementRow, FinancialStatementsData } from "@/lib/types";

type StatementKey = "income_statement" | "balance_sheet" | "cash_flow";
type ViewKey = "raw" | "common_size" | "yoy_growth";

const statementTabs: Array<{ key: StatementKey; label: string }> = [
  { key: "income_statement", label: "Income Statement" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
];

const viewTabs: Array<{ key: ViewKey; label: string }> = [
  { key: "raw", label: "Raw" },
  { key: "common_size", label: "Common Size" },
  { key: "yoy_growth", label: "YoY Growth" },
];

function formatRaw(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function activeRows(block: FinancialStatementBlock, view: ViewKey): FinancialStatementRow[] {
  if (view === "common_size") return block.common_size || [];
  return block.raw || [];
}

export function FinancialStatementsPanel({ data }: { data: FinancialStatementsData | null | undefined }) {
  const [statement, setStatement] = useState<StatementKey>("income_statement");
  const [view, setView] = useState<ViewKey>("raw");

  const years = data?.years || [];
  const block = data?.[statement];

  const rows = useMemo(() => {
    if (!block) return [];
    return activeRows(block, view);
  }, [block, view]);

  if (!data || !years.length) {
    return (
      <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h3 className="font-display text-lg">Financial Statements</h3>
        <p className="mt-2 text-sm text-textMuted">Financial statement history is unavailable from current free providers for this symbol.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <h3 className="font-display text-lg">Financial Statements</h3>
      <p className="mt-1 text-xs text-textMuted">Years shown: {years.join(", ")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {statementTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatement(tab.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              statement === tab.key ? "border-accent bg-accent/10 text-textMain" : "border-borderGlass bg-bgSoft text-textMuted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {viewTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              view === tab.key ? "border-accent bg-accent/10 text-textMain" : "border-borderGlass bg-bgSoft text-textMuted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "common_size" && block?.base_metric && (
        <p className="mt-3 text-xs text-textMuted">Common size base: {block.base_metric}</p>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-borderGlass">
        <table className="min-w-full text-sm">
          <thead className="bg-bgSoft text-left text-xs uppercase text-textMuted">
            <tr>
              <th className="px-3 py-2">Metric</th>
              {years.map((year) => (
                <th key={year} className="px-3 py-2 text-right">
                  {year}
                </th>
              ))}
              <th className="px-3 py-2 text-right">CAGR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-t border-borderGlass text-textMuted">
                <td className="px-3 py-2 font-medium text-textMain">{row.metric}</td>
                {years.map((year) => {
                  const value = view === "yoy_growth" ? row.yoy_growth?.[year] : row.values?.[year];
                  const cell = view === "raw" ? formatRaw(value) : formatPercent(value);
                  return (
                    <td key={`${row.metric}-${year}`} className="px-3 py-2 text-right">
                      {cell}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">{formatPercent(row.cagr)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-3 py-6 text-center text-textMuted" colSpan={years.length + 2}>
                  No statement rows available for this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
