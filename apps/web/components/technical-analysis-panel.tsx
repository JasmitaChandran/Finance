"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/lib/api";
import { formatCurrency, formatLarge } from "@/lib/format";
import {
  backtestSmaCrossover,
  detectPatterns,
  detectSupportResistance,
  heikinAshi,
  latestIndicatorSummary,
  normalizeHistory,
  pctDistance,
  renko,
  summarizeTimeframe,
  volumeProfile,
} from "@/lib/technical";
import type { OHLCVPoint } from "@/lib/types";

type Timeframe = "1mo" | "3mo" | "6mo" | "1y" | "5y";
type ChartType = "line" | "candlestick" | "heikin_ashi" | "renko";

const timeframeLabels: Record<Timeframe, string> = {
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
  "5y": "5Y",
};

function toneClass(value: number | null | undefined, highGood = true): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-textMuted";
  if (highGood) return value >= 0 ? "text-success" : "text-danger";
  return value <= 0 ? "text-success" : "text-warning";
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function MiniCandleChart({
  data,
  title,
  priceFormatter,
}: {
  data: OHLCVPoint[];
  title: string;
  priceFormatter: (value: number) => string;
}) {
  if (!data.length) {
    return (
      <div className="h-80 rounded-xl border border-borderGlass bg-bgSoft p-4">
        <p className="text-sm text-textMuted">No chart data available.</p>
      </div>
    );
  }

  const maxBars = 180;
  const stride = Math.max(1, Math.ceil(data.length / maxBars));
  const bars = data.filter((_, index) => index % stride === 0 || index === data.length - 1);

  const minPrice = Math.min(...bars.map((row) => row.low));
  const maxPrice = Math.max(...bars.map((row) => row.high));
  const width = 1000;
  const height = 320;
  const paddingX = 32;
  const paddingY = 22;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const stepX = bars.length <= 1 ? chartWidth : chartWidth / (bars.length - 1);

  const mapY = (price: number) => {
    if (maxPrice === minPrice) return paddingY + chartHeight / 2;
    return paddingY + ((maxPrice - price) / (maxPrice - minPrice)) * chartHeight;
  };

  const bodyWidth = Math.max(2, Math.min(8, stepX * 0.62));
  const midPrice = (maxPrice + minPrice) / 2;

  return (
    <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-textMuted">
        <span>{title}</span>
        <span>
          Range: {priceFormatter(minPrice)} - {priceFormatter(maxPrice)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full">
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        <line x1={paddingX} y1={mapY(maxPrice)} x2={width - paddingX} y2={mapY(maxPrice)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
        <line x1={paddingX} y1={mapY(midPrice)} x2={width - paddingX} y2={mapY(midPrice)} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
        <line x1={paddingX} y1={mapY(minPrice)} x2={width - paddingX} y2={mapY(minPrice)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
        {bars.map((bar, index) => {
          const x = paddingX + index * stepX;
          const yHigh = mapY(bar.high);
          const yLow = mapY(bar.low);
          const yOpen = mapY(bar.open);
          const yClose = mapY(bar.close);
          const top = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
          const up = bar.close >= bar.open;
          const color = up ? "var(--accent)" : "rgb(239 68 68)";

          return (
            <g key={`${bar.date}-${index}`}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1.2} />
              <rect x={x - bodyWidth / 2} y={top} width={bodyWidth} height={bodyHeight} fill={color} opacity={0.88} />
            </g>
          );
        })}
        <text x={paddingX} y={height - 5} fill="var(--text-muted)" fontSize="10">
          {bars[0]?.date}
        </text>
        <text x={width - paddingX - 82} y={height - 5} fill="var(--text-muted)" fontSize="10">
          {bars[bars.length - 1]?.date}
        </text>
      </svg>
    </div>
  );
}

export function TechnicalAnalysisPanel({
  symbol,
  currency,
  initialHistory,
}: {
  symbol: string;
  currency?: string;
  initialHistory: OHLCVPoint[];
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("6mo");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [history, setHistory] = useState<OHLCVPoint[]>(normalizeHistory(initialHistory));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mtfLoading, setMtfLoading] = useState(false);
  const [mtfSignals, setMtfSignals] = useState<ReturnType<typeof summarizeTimeframe>[]>([]);
  const [fastPeriod, setFastPeriod] = useState(20);
  const [slowPeriod, setSlowPeriod] = useState(50);
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showWMA, setShowWMA] = useState(false);
  const [showBB, setShowBB] = useState(true);
  const [showVWAP, setShowVWAP] = useState(false);

  useEffect(() => {
    setHistory(normalizeHistory(initialHistory));
    setTimeframe("6mo");
  }, [symbol, initialHistory]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getHistory(symbol, timeframe)
      .then((response) => {
        if (!active) return;
        setHistory(normalizeHistory(response.items));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load technical history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    let active = true;
    const timeframes: Timeframe[] = ["1mo", "3mo", "6mo", "1y", "5y"];
    setMtfLoading(true);
    Promise.all(
      timeframes.map(async (period) => {
        const response = await api.getHistory(symbol, period);
        const rows = normalizeHistory(response.items);
        return summarizeTimeframe(period.toUpperCase(), rows);
      })
    )
      .then((rows) => {
        if (!active) return;
        setMtfSignals(rows);
      })
      .catch(() => {
        if (!active) return;
        setMtfSignals([]);
      })
      .finally(() => {
        if (active) setMtfLoading(false);
      });

    return () => {
      active = false;
    };
  }, [symbol]);

  const prepared = useMemo(() => normalizeHistory(history), [history]);
  const indicatorSummary = useMemo(() => latestIndicatorSummary(prepared), [prepared]);
  const patterns = useMemo(() => detectPatterns(prepared), [prepared]);
  const levels = useMemo(() => detectSupportResistance(prepared), [prepared]);
  const profile = useMemo(() => volumeProfile(prepared, 12), [prepared]);
  const backtest = useMemo(() => backtestSmaCrossover(prepared, Math.max(2, fastPeriod), Math.max(3, slowPeriod)), [prepared, fastPeriod, slowPeriod]);

  const viewData = useMemo(() => {
    if (chartType === "heikin_ashi") return heikinAshi(prepared);
    if (chartType === "renko") return renko(prepared);
    return prepared;
  }, [chartType, prepared]);

  const close = prepared.length ? prepared[prepared.length - 1].close : null;
  const nearestSupport = levels.supports.length && close !== null ? levels.supports[0].level : null;
  const nearestResistance = levels.resistances.length && close !== null ? levels.resistances[0].level : null;
  const supportDistance = pctDistance(close, nearestSupport);
  const resistanceDistance = pctDistance(close, nearestResistance);

  const lineChartData = useMemo(
    () =>
      prepared.map((row, index) => ({
        date: row.date,
        close: row.close,
        sma20: indicatorSummary.series.sma20[index],
        ema20: indicatorSummary.series.ema20[index],
        wma20: indicatorSummary.series.wma20[index],
        bbUpper: indicatorSummary.series.bollingerUpper[index],
        bbLower: indicatorSummary.series.bollingerLower[index],
        vwap: indicatorSummary.series.vwap[index],
      })),
    [prepared, indicatorSummary]
  );

  return (
    <section className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">Technical Analysis</h3>
          <p className="mt-1 text-xs text-textMuted">
            Charting tools, indicators, multi-timeframe scanner, pattern detection, support/resistance, volume profile, and backtesting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-borderGlass bg-bgSoft p-1">
            {(Object.keys(timeframeLabels) as Timeframe[]).map((key) => (
              <button
                key={key}
                onClick={() => setTimeframe(key)}
                className={`rounded-lg px-2.5 py-1 text-xs ${timeframe === key ? "bg-accent text-black" : "text-textMuted hover:text-textMain"}`}
              >
                {timeframeLabels[key]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-borderGlass bg-bgSoft p-1">
            {[
              { key: "line", label: "Line" },
              { key: "candlestick", label: "Candlestick" },
              { key: "heikin_ashi", label: "Heikin Ashi" },
              { key: "renko", label: "Renko" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setChartType(item.key as ChartType)}
                className={`rounded-lg px-2.5 py-1 text-xs ${chartType === item.key ? "bg-accent text-black" : "text-textMuted hover:text-textMain"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="mt-3 text-xs text-textMuted">Loading technical data...</p>}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4">
        {chartType === "line" ? (
          <div className="rounded-xl border border-borderGlass bg-bgSoft p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => setShowSMA((prev) => !prev)} className={`rounded-md border px-2 py-1 ${showSMA ? "border-accent text-textMain" : "border-borderGlass text-textMuted"}`}>
                SMA(20)
              </button>
              <button onClick={() => setShowEMA((prev) => !prev)} className={`rounded-md border px-2 py-1 ${showEMA ? "border-accent text-textMain" : "border-borderGlass text-textMuted"}`}>
                EMA(20)
              </button>
              <button onClick={() => setShowWMA((prev) => !prev)} className={`rounded-md border px-2 py-1 ${showWMA ? "border-accent text-textMain" : "border-borderGlass text-textMuted"}`}>
                WMA(20)
              </button>
              <button onClick={() => setShowBB((prev) => !prev)} className={`rounded-md border px-2 py-1 ${showBB ? "border-accent text-textMain" : "border-borderGlass text-textMuted"}`}>
                Bollinger
              </button>
              <button onClick={() => setShowVWAP((prev) => !prev)} className={`rounded-md border px-2 py-1 ${showVWAP ? "border-accent text-textMain" : "border-borderGlass text-textMuted"}`}>
                VWAP
              </button>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer>
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} minTickGap={30} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid var(--border-glass)",
                      background: "var(--card)",
                    }}
                  />
                  <Line type="monotone" dataKey="close" stroke="var(--accent)" strokeWidth={2.2} dot={false} />
                  {showSMA && <Line type="monotone" dataKey="sma20" stroke="#34d399" strokeWidth={1.4} dot={false} />}
                  {showEMA && <Line type="monotone" dataKey="ema20" stroke="#60a5fa" strokeWidth={1.4} dot={false} />}
                  {showWMA && <Line type="monotone" dataKey="wma20" stroke="#f59e0b" strokeWidth={1.4} dot={false} />}
                  {showBB && (
                    <>
                      <Line type="monotone" dataKey="bbUpper" stroke="rgba(148,163,184,0.9)" strokeWidth={1.2} dot={false} />
                      <Line type="monotone" dataKey="bbLower" stroke="rgba(148,163,184,0.9)" strokeWidth={1.2} dot={false} />
                    </>
                  )}
                  {showVWAP && <Line type="monotone" dataKey="vwap" stroke="#f97316" strokeWidth={1.2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <MiniCandleChart
            data={viewData}
            title={chartType === "candlestick" ? "Candlestick" : chartType === "heikin_ashi" ? "Heikin Ashi" : "Renko"}
            priceFormatter={(value) => formatCurrency(value, currency || "USD")}
          />
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">SMA / EMA / WMA (20)</p>
          <p className="mt-1 text-sm text-textMain">
            {formatNumber(indicatorSummary.latest.sma20)} / {formatNumber(indicatorSummary.latest.ema20)} / {formatNumber(indicatorSummary.latest.wma20)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">MACD / Signal</p>
          <p className="mt-1 text-sm text-textMain">
            {formatNumber(indicatorSummary.latest.macd)} / {formatNumber(indicatorSummary.latest.macdSignal)}
          </p>
          <p className={`mt-0.5 text-[11px] ${toneClass(indicatorSummary.latest.macdHistogram)}`}>
            Histogram: {formatNumber(indicatorSummary.latest.macdHistogram)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">RSI (14)</p>
          <p className={`mt-1 text-sm ${toneClass(indicatorSummary.latest.rsi14 ? indicatorSummary.latest.rsi14 - 50 : null)}`}>
            {formatNumber(indicatorSummary.latest.rsi14)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">Bollinger (U / M / L)</p>
          <p className="mt-1 text-sm text-textMain">
            {formatNumber(indicatorSummary.latest.bollingerUpper)} / {formatNumber(indicatorSummary.latest.bollingerMiddle)} /{" "}
            {formatNumber(indicatorSummary.latest.bollingerLower)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">Stochastic %K / %D</p>
          <p className="mt-1 text-sm text-textMain">
            {formatNumber(indicatorSummary.latest.stochasticK)} / {formatNumber(indicatorSummary.latest.stochasticD)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">ADX (14)</p>
          <p className={`mt-1 text-sm ${toneClass(indicatorSummary.latest.adx14 ? indicatorSummary.latest.adx14 - 25 : null)}`}>
            {formatNumber(indicatorSummary.latest.adx14)}
          </p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">VWAP</p>
          <p className="mt-1 text-sm text-textMain">{formatNumber(indicatorSummary.latest.vwap)}</p>
        </div>
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-3 text-xs">
          <p className="text-textMuted">Ichimoku (Tenkan / Kijun)</p>
          <p className="mt-1 text-sm text-textMain">
            {formatNumber(indicatorSummary.latest.ichimokuTenkan)} / {formatNumber(indicatorSummary.latest.ichimokuKijun)}
          </p>
          <p className="mt-0.5 text-[11px] text-textMuted">
            Cloud A/B: {formatNumber(indicatorSummary.latest.ichimokuSenkouA)} / {formatNumber(indicatorSummary.latest.ichimokuSenkouB)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Multi-timeframe Analysis</h4>
          {mtfLoading ? (
            <p className="mt-2 text-xs text-textMuted">Scanning timeframes...</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-borderGlass">
              <table className="min-w-full text-xs">
                <thead className="bg-card text-textMuted">
                  <tr>
                    <th className="px-3 py-2 text-left">TF</th>
                    <th className="px-3 py-2 text-left">Signal</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">RSI</th>
                    <th className="px-3 py-2 text-right">MACD</th>
                  </tr>
                </thead>
                <tbody>
                  {mtfSignals.map((row) => (
                    <tr key={row.timeframe} className="border-t border-borderGlass">
                      <td className="px-3 py-2 text-textMain">{row.timeframe}</td>
                      <td className={`px-3 py-2 ${row.signal === "Bullish" ? "text-success" : row.signal === "Bearish" ? "text-danger" : "text-warning"}`}>
                        {row.signal}
                      </td>
                      <td className="px-3 py-2 text-right text-textMain">{row.score}</td>
                      <td className="px-3 py-2 text-right text-textMain">{formatNumber(row.rsi14)}</td>
                      <td className="px-3 py-2 text-right text-textMain">
                        {formatNumber(row.macd)} / {formatNumber(row.macdSignal)}
                      </td>
                    </tr>
                  ))}
                  {!mtfSignals.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-textMuted">
                        Multi-timeframe signals unavailable.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Pattern Detection</h4>
          <div className="mt-3 space-y-2">
            {patterns.map((pattern) => (
              <div key={pattern.name} className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-textMain">{pattern.name}</p>
                  <p className={pattern.direction === "Bullish" ? "text-success" : pattern.direction === "Bearish" ? "text-danger" : "text-warning"}>
                    {pattern.direction}
                  </p>
                </div>
                <p className="mt-1 text-textMuted">{pattern.description}</p>
                <p className="mt-1 text-[11px] text-textMuted">Confidence: {(pattern.confidence * 100).toFixed(0)}%</p>
              </div>
            ))}
            {!patterns.length && <p className="text-xs text-textMuted">No strong classical patterns detected in the current timeframe.</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Support / Resistance (Auto)</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-borderGlass bg-card p-3 text-xs">
              <p className="text-textMuted">Nearest Support</p>
              <p className="mt-1 text-sm text-success">{nearestSupport !== null ? formatCurrency(nearestSupport, currency || "USD") : "-"}</p>
              <p className="mt-1 text-[11px] text-textMuted">{supportDistance !== null ? `${formatPercent(supportDistance)} from current` : "-"}</p>
            </div>
            <div className="rounded-lg border border-borderGlass bg-card p-3 text-xs">
              <p className="text-textMuted">Nearest Resistance</p>
              <p className="mt-1 text-sm text-danger">{nearestResistance !== null ? formatCurrency(nearestResistance, currency || "USD") : "-"}</p>
              <p className="mt-1 text-[11px] text-textMuted">{resistanceDistance !== null ? `${formatPercent(resistanceDistance)} from current` : "-"}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {levels.supports.map((item) => (
              <span key={`sup-${item.level}`} className="rounded-full border border-borderGlass bg-card px-2.5 py-1 text-[11px] text-success">
                S {formatCurrency(item.level, currency || "USD")} ({item.touches}x)
              </span>
            ))}
            {levels.resistances.map((item) => (
              <span key={`res-${item.level}`} className="rounded-full border border-borderGlass bg-card px-2.5 py-1 text-[11px] text-danger">
                R {formatCurrency(item.level, currency || "USD")} ({item.touches}x)
              </span>
            ))}
            {!levels.supports.length && !levels.resistances.length && <span className="text-xs text-textMuted">Not enough pivots for support/resistance.</span>}
          </div>
        </div>

        <div className="rounded-xl border border-borderGlass bg-bgSoft p-4">
          <h4 className="font-semibold text-textMain">Volume Profile</h4>
          <p className="mt-1 text-xs text-textMuted">Point of Control: {profile.pointOfControl !== null ? formatCurrency(profile.pointOfControl, currency || "USD") : "-"}</p>
          <div className="mt-3 space-y-1.5">
            {profile.bins.map((bin) => (
              <div key={`${bin.from}-${bin.to}`} className="rounded-md border border-borderGlass bg-card p-1.5">
                <div className="flex items-center justify-between text-[11px] text-textMuted">
                  <span>
                    {formatCurrency(bin.from, currency || "USD")} - {formatCurrency(bin.to, currency || "USD")}
                  </span>
                  <span>{formatLarge(bin.volume)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-borderGlass/40">
                  <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.max(2, Math.min(100, bin.percent))}%` }} />
                </div>
              </div>
            ))}
            {!profile.bins.length && <p className="text-xs text-textMuted">No volume profile data available.</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-semibold text-textMain">Backtesting Module (SMA Crossover)</h4>
          <div className="flex items-center gap-2 text-xs">
            <label className="text-textMuted">
              Fast
              <input
                type="number"
                min={2}
                max={100}
                value={fastPeriod}
                onChange={(event) => setFastPeriod(Math.max(2, Number(event.target.value) || 2))}
                className="ml-1 w-14 rounded border border-borderGlass bg-card px-1.5 py-1 text-textMain"
              />
            </label>
            <label className="text-textMuted">
              Slow
              <input
                type="number"
                min={3}
                max={200}
                value={slowPeriod}
                onChange={(event) => setSlowPeriod(Math.max(3, Number(event.target.value) || 3))}
                className="ml-1 w-14 rounded border border-borderGlass bg-card px-1.5 py-1 text-textMain"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">Total Return</p>
            <p className={`mt-1 text-sm ${toneClass(backtest.totalReturnPercent)}`}>{formatPercent(backtest.totalReturnPercent)}</p>
          </div>
          <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">CAGR</p>
            <p className={`mt-1 text-sm ${toneClass(backtest.cagrPercent)}`}>{formatPercent(backtest.cagrPercent)}</p>
          </div>
          <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">Max Drawdown</p>
            <p className="mt-1 text-sm text-danger">{formatPercent(backtest.maxDrawdownPercent)}</p>
          </div>
          <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">Trades</p>
            <p className="mt-1 text-sm text-textMain">{backtest.tradesCount}</p>
          </div>
          <div className="rounded-lg border border-borderGlass bg-card p-2.5 text-xs">
            <p className="text-textMuted">Win Rate</p>
            <p className="mt-1 text-sm text-textMain">{formatPercent(backtest.winRatePercent)}</p>
          </div>
        </div>

        <div className="mt-3 h-52 w-full rounded-lg border border-borderGlass bg-card p-2">
          <ResponsiveContainer>
            <LineChart data={backtest.equityCurve}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={28} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border-glass)",
                  background: "var(--card)",
                }}
              />
              <Line type="monotone" dataKey="equity" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
