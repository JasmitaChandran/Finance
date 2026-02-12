"use client";

import { useEffect, useMemo, useState } from "react";

import { formatCurrency, formatLarge } from "@/lib/format";
import type { ValuationEngineData } from "@/lib/types";

type DCFMode = "fcff" | "fcfe";

type LocalDCF = {
  intrinsicValuePerShare: number | null;
  upsidePercent: number | null;
  presentValueOfCashFlows: number | null;
  terminalValue: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function computeDCF(params: {
  baseCashFlow: number | null;
  growthRate: number;
  wacc: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number | null;
  netDebt: number | null;
  marketPrice: number | null;
  mode: DCFMode;
}): LocalDCF {
  const {
    baseCashFlow,
    growthRate,
    wacc,
    terminalGrowthRate,
    projectionYears,
    sharesOutstanding,
    netDebt,
    marketPrice,
    mode,
  } = params;

  if (
    baseCashFlow === null ||
    baseCashFlow <= 0 ||
    sharesOutstanding === null ||
    sharesOutstanding <= 0 ||
    wacc <= terminalGrowthRate + 0.002
  ) {
    return {
      intrinsicValuePerShare: null,
      upsidePercent: null,
      presentValueOfCashFlows: null,
      terminalValue: null,
      enterpriseValue: null,
      equityValue: null,
    };
  }

  let pvCashFlows = 0;
  let lastCashFlow = baseCashFlow;
  for (let year = 1; year <= projectionYears; year += 1) {
    const projected = baseCashFlow * (1 + growthRate) ** year;
    const pv = projected / (1 + wacc) ** year;
    pvCashFlows += pv;
    lastCashFlow = projected;
  }

  const terminalCashFlow = lastCashFlow * (1 + terminalGrowthRate);
  const terminalValue = terminalCashFlow / (wacc - terminalGrowthRate);
  const pvTerminal = terminalValue / (1 + wacc) ** projectionYears;

  const enterpriseValue = mode === "fcff" ? pvCashFlows + pvTerminal : pvCashFlows + pvTerminal + (netDebt ?? 0);
  const equityValue = mode === "fcff" ? enterpriseValue - (netDebt ?? 0) : pvCashFlows + pvTerminal;

  const intrinsicValuePerShare = equityValue / sharesOutstanding;
  const upsidePercent = marketPrice && marketPrice > 0 ? ((intrinsicValuePerShare - marketPrice) / marketPrice) * 100 : null;

  return {
    intrinsicValuePerShare,
    upsidePercent,
    presentValueOfCashFlows: pvCashFlows,
    terminalValue,
    enterpriseValue,
    equityValue,
  };
}

function reverseDCF(params: {
  baseCashFlow: number | null;
  wacc: number;
  terminalGrowthRate: number;
  projectionYears: number;
  sharesOutstanding: number | null;
  netDebt: number | null;
  marketPrice: number | null;
  mode: DCFMode;
}): number | null {
  const { baseCashFlow, wacc, terminalGrowthRate, projectionYears, sharesOutstanding, netDebt, marketPrice, mode } = params;
  if (
    baseCashFlow === null ||
    baseCashFlow <= 0 ||
    sharesOutstanding === null ||
    sharesOutstanding <= 0 ||
    marketPrice === null ||
    marketPrice <= 0
  ) {
    return null;
  }

  let low = -0.3;
  let high = 0.45;
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2;
    const result = computeDCF({
      baseCashFlow,
      growthRate: mid,
      wacc,
      terminalGrowthRate,
      projectionYears,
      sharesOutstanding,
      netDebt,
      marketPrice,
      mode,
    });
    if (result.intrinsicValuePerShare === null) return null;
    if (result.intrinsicValuePerShare > marketPrice) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

export function ValuationEnginePanel({ data }: { data: ValuationEngineData | null | undefined }) {
  const [mode, setMode] = useState<DCFMode>("fcff");
  const [growthPct, setGrowthPct] = useState(6);
  const [waccPct, setWaccPct] = useState(10);
  const [terminalPct, setTerminalPct] = useState(2.5);

  useEffect(() => {
    if (!data) return;
    setGrowthPct((data.inputs.growth_rate ?? 0.06) * 100);
    setWaccPct((data.inputs.wacc ?? 0.1) * 100);
    setTerminalPct((data.inputs.terminal_growth_rate ?? 0.025) * 100);
  }, [data]);

  const currency = data?.inputs.currency || "USD";
  const marketPrice = toNumber(data?.inputs.market_price);
  const sharesOutstanding = toNumber(data?.inputs.shares_outstanding);
  const netDebt = toNumber(data?.inputs.net_debt);
  const projectionYears = data?.inputs.projection_years ?? 5;

  const effectiveGrowth = clamp(growthPct / 100, -0.15, 0.25);
  const effectiveWacc = clamp(waccPct / 100, 0.05, 0.25);
  const effectiveTerminal = clamp(terminalPct / 100, 0.01, 0.04);

  const baseCashFlow = toNumber(mode === "fcff" ? data?.inputs.fcff_base : data?.inputs.fcfe_base);

  const localResult = useMemo(
    () =>
      computeDCF({
        baseCashFlow,
        growthRate: effectiveGrowth,
        wacc: effectiveWacc,
        terminalGrowthRate: effectiveTerminal,
        projectionYears,
        sharesOutstanding,
        netDebt,
        marketPrice,
        mode,
      }),
    [baseCashFlow, effectiveGrowth, effectiveWacc, effectiveTerminal, projectionYears, sharesOutstanding, netDebt, marketPrice, mode]
  );

  const requiredGrowth = useMemo(
    () =>
      reverseDCF({
        baseCashFlow,
        wacc: effectiveWacc,
        terminalGrowthRate: effectiveTerminal,
        projectionYears,
        sharesOutstanding,
        netDebt,
        marketPrice,
        mode,
      }),
    [baseCashFlow, effectiveWacc, effectiveTerminal, projectionYears, sharesOutstanding, netDebt, marketPrice, mode]
  );

  const sensitivity = useMemo(() => {
    const waccValues = [-2, -1, 0, 1, 2]
      .map((delta) => clamp(effectiveWacc + delta / 100, 0.05, 0.25))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .filter((value) => value > effectiveTerminal + 0.002)
      .sort((a, b) => a - b);
    const growthValues = [-2, -1, 0, 1, 2]
      .map((delta) => clamp(effectiveGrowth + delta / 100, -0.15, 0.25))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .sort((a, b) => b - a);

    const rows = growthValues.map((growth) => {
      const values = waccValues.map((wacc) =>
        computeDCF({
          baseCashFlow,
          growthRate: growth,
          wacc,
          terminalGrowthRate: effectiveTerminal,
          projectionYears,
          sharesOutstanding,
          netDebt,
          marketPrice,
          mode,
        })
      );
      return { growth, values };
    });

    return { waccValues, rows };
  }, [baseCashFlow, effectiveGrowth, effectiveTerminal, projectionYears, sharesOutstanding, netDebt, marketPrice, mode, effectiveWacc]);

  if (!data) {
    return (
      <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h3 className="font-display text-lg">Valuation Engine</h3>
        <p className="mt-2 text-sm text-textMuted">Valuation data is unavailable for this symbol.</p>
      </section>
    );
  }

  const implied = data.relative_valuation?.implied_prices;
  const medians = data.relative_valuation?.peer_medians;
  const peers = data.relative_valuation?.peers || [];
  const industryComparison = data.relative_valuation?.industry_multiple_comparison;

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">Valuation Engine</h3>
          <p className="mt-1 text-xs text-textMuted">
            Built-in DCF ({mode.toUpperCase()}), reverse DCF, sensitivity, relative valuation, and industry multiple comparison.
          </p>
          <p className="mt-1 text-xs text-textMuted">Base year: {data.inputs.base_year || "-"}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-borderGlass bg-bgSoft p-1">
          <button
            onClick={() => setMode("fcff")}
            className={`rounded-lg px-3 py-1.5 text-xs ${mode === "fcff" ? "bg-accent text-black" : "text-textMuted hover:text-textMain"}`}
          >
            FCFF
          </button>
          <button
            onClick={() => setMode("fcfe")}
            className={`rounded-lg px-3 py-1.5 text-xs ${mode === "fcfe" ? "bg-accent text-black" : "text-textMuted hover:text-textMain"}`}
          >
            FCFE
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
          Growth Rate (%)
          <input
            type="number"
            value={growthPct}
            step="0.1"
            onChange={(event) => setGrowthPct(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-sm text-textMain"
          />
        </label>
        <label className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
          WACC (%)
          <input
            type="number"
            value={waccPct}
            step="0.1"
            onChange={(event) => setWaccPct(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-sm text-textMain"
          />
        </label>
        <label className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
          Terminal Growth (%)
          <input
            type="number"
            value={terminalPct}
            step="0.1"
            onChange={(event) => setTerminalPct(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-borderGlass bg-card px-2 py-1.5 text-sm text-textMain"
          />
        </label>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs text-textMuted">
          Projection
          <p className="mt-2 text-sm font-semibold text-textMain">{projectionYears} years</p>
          <p className="mt-1 text-[11px] text-textMuted">
            Base {mode.toUpperCase()}: {formatLarge(baseCashFlow)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
          <p className="text-xs text-textMuted">Current Price</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatCurrency(marketPrice, currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
          <p className="text-xs text-textMuted">Intrinsic Value / Share</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatCurrency(localResult.intrinsicValuePerShare, currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
          <p className="text-xs text-textMuted">Upside / Downside</p>
          <p className={`mt-1 text-sm font-semibold ${(localResult.upsidePercent ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
            {formatPercent(localResult.upsidePercent)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
          <p className="text-xs text-textMuted">Reverse DCF Growth Needed</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatRate(requiredGrowth)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">PV of Projected Cash Flows</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatCurrency(localResult.presentValueOfCashFlows, currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">Terminal Value</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatCurrency(localResult.terminalValue, currency)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">Equity Value</p>
          <p className="mt-1 text-sm font-semibold text-textMain">{formatCurrency(localResult.equityValue, currency)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-borderGlass bg-bgSoft p-4">
        <h4 className="font-semibold text-textMain">Sensitivity Analysis (WACC vs Growth)</h4>
        <div className="mt-3 overflow-x-auto rounded-xl border border-borderGlass">
          <table className="min-w-full text-xs">
            <thead className="bg-card text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Growth \\ WACC</th>
                {sensitivity.waccValues.map((wacc) => (
                  <th key={`wacc-${wacc}`} className="px-3 py-2 text-right">
                    {(wacc * 100).toFixed(1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensitivity.rows.map((row) => (
                <tr key={`growth-${row.growth}`} className="border-t border-borderGlass">
                  <td className="px-3 py-2 text-textMuted">{(row.growth * 100).toFixed(1)}%</td>
                  {row.values.map((cell, index) => (
                    <td key={`cell-${row.growth}-${index}`} className="px-3 py-2 text-right">
                      <div className="text-textMain">{formatCurrency(cell.intrinsicValuePerShare, currency)}</div>
                      <div className={`text-[11px] ${(cell.upsidePercent ?? 0) >= 0 ? "text-success" : "text-danger"}`}>{formatPercent(cell.upsidePercent)}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Relative Valuation vs Peers</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">P/E Implied Price</p>
              <p className="mt-1 font-semibold text-textMain">{formatCurrency(implied?.pe_based_price, currency)}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">P/B Implied Price</p>
              <p className="mt-1 font-semibold text-textMain">{formatCurrency(implied?.pb_based_price, currency)}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">PEG Implied Price</p>
              <p className="mt-1 font-semibold text-textMain">{formatCurrency(implied?.peg_based_price, currency)}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
              <p className="text-textMuted">Composite Fair Price</p>
              <p className="mt-1 font-semibold text-textMain">{formatCurrency(implied?.composite_fair_price, currency)}</p>
              <p className={`mt-0.5 text-[11px] ${(implied?.composite_upside_percent ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                {formatPercent(implied?.composite_upside_percent)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-textMuted">
            Peer medians: P/E {medians?.pe?.toFixed(2) ?? "-"} | P/B {medians?.pb?.toFixed(2) ?? "-"} | PEG {medians?.peg?.toFixed(2) ?? "-"}
          </p>
        </div>

        <div className="rounded-2xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Industry Multiple Comparison</h4>
          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-lg border border-borderGlass bg-card p-2.5">
              <p className="text-textMuted">P/E Premium / Discount</p>
              <p className={`mt-1 font-semibold ${(industryComparison?.premium_discount_percent?.pe ?? 0) <= 0 ? "text-success" : "text-warning"}`}>
                {formatPercent(industryComparison?.premium_discount_percent?.pe)}
              </p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5">
              <p className="text-textMuted">P/B Premium / Discount</p>
              <p className={`mt-1 font-semibold ${(industryComparison?.premium_discount_percent?.pb ?? 0) <= 0 ? "text-success" : "text-warning"}`}>
                {formatPercent(industryComparison?.premium_discount_percent?.pb)}
              </p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-2.5">
              <p className="text-textMuted">PEG Premium / Discount</p>
              <p className={`mt-1 font-semibold ${(industryComparison?.premium_discount_percent?.peg ?? 0) <= 0 ? "text-success" : "text-warning"}`}>
                {formatPercent(industryComparison?.premium_discount_percent?.peg)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-borderGlass bg-bgSoft p-4">
        <h4 className="font-semibold text-textMain">Peer Set</h4>
        <div className="mt-3 overflow-x-auto rounded-xl border border-borderGlass">
          <table className="min-w-full text-xs">
            <thead className="bg-card text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">P/E</th>
                <th className="px-3 py-2 text-right">P/B</th>
                <th className="px-3 py-2 text-right">PEG</th>
                <th className="px-3 py-2 text-right">Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {peers.slice(0, 8).map((peer) => (
                <tr key={peer.symbol} className="border-t border-borderGlass">
                  <td className="px-3 py-2 font-semibold text-textMain">{peer.symbol}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-textMuted">{peer.name}</td>
                  <td className="px-3 py-2 text-right text-textMain">{formatCurrency(peer.price, currency)}</td>
                  <td className="px-3 py-2 text-right text-textMain">{peer.pe ? peer.pe.toFixed(2) : "-"}</td>
                  <td className="px-3 py-2 text-right text-textMain">{peer.pb ? peer.pb.toFixed(2) : "-"}</td>
                  <td className="px-3 py-2 text-right text-textMain">{peer.peg ? peer.peg.toFixed(2) : "-"}</td>
                  <td className="px-3 py-2 text-right text-textMain">{formatLarge(peer.market_cap)}</td>
                </tr>
              ))}
              {!peers.length && (
                <tr>
                  <td className="px-3 py-5 text-center text-textMuted" colSpan={7}>
                    Peer data unavailable for this symbol right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
