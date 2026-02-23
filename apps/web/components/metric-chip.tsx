"use client";

import { Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

interface MetricChipProps {
  label: string;
  metricKey: string;
  value: string;
  symbol: string;
  rawValue?: number | null;
}

export function MetricChip({ label, metricKey, value, symbol, rawValue }: MetricChipProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [insight, setInsight] = useState<null | {
    title: string;
    simple_explanation: string;
    analogy: string;
    what_good_looks_like: string;
    caution: string;
    formula?: string;
    unit?: string;
  }>(null);

  async function toggleInsight() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    if (insight || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await api.explainMetric(metricKey, rawValue ?? undefined, symbol);
      setInsight(response);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load explanation.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const node = rootRef.current;
      if (!node) return;
      if (node.contains(event.target as Node)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative h-full min-h-[104px] rounded-xl border border-borderGlass bg-card p-3 hover:bg-cardHover">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-textMuted">{label}</p>
          <p className="mt-1 line-clamp-2 text-lg font-semibold">{value}</p>
        </div>
        <button onClick={toggleInsight} className="rounded-md p-2 text-textMuted transition hover:bg-bgSoft hover:text-textMain" aria-label={`Explain ${label}`}>
          <Info className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-lg border border-borderGlass bg-card p-3 text-xs leading-relaxed text-textMuted shadow-glow">
          {loading && <p>Explaining this metric...</p>}
          {!loading && loadError && <p className="text-danger">{loadError}</p>}
          {!loading && insight && (
            <>
              <p className="font-semibold text-textMain">{insight.title}</p>
              <p className="mt-1">{insight.simple_explanation}</p>
              {!!insight.formula && (
                <p className="mt-2">
                  Formula: <span className="text-textMain">{insight.formula}</span>
                  {!!insight.unit && <span className="text-textMuted"> ({insight.unit})</span>}
                </p>
              )}
              <p className="mt-2 text-textMain">Analogy: <span className="text-textMuted">{insight.analogy}</span></p>
              <p className="mt-2">Good signal: {insight.what_good_looks_like}</p>
              <p className="mt-1">Watchout: {insight.caution}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
