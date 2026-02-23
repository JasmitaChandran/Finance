export function formatCurrency(value?: number | null, currency = "USD") {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function formatLarge(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return value.toFixed(2);
}

export function formatLargeByCurrency(value?: number | null, currency?: string | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (!currency) return formatLarge(value);
  try {
    const locale = currency === "INR" ? "en-IN" : "en-US";
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return formatLarge(value);
  }
}

export type CurrencyCompactMode = "intl" | "indian";

export function formatIndianLakhCrore(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)} cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)} lakh`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(2)}k`;
  return `${sign}₹${abs.toFixed(2)}`;
}

export function formatLargeByCurrencyMode(value?: number | null, currency?: string | null, mode: CurrencyCompactMode = "intl") {
  if (currency === "INR" && mode === "indian") return formatIndianLakhCrore(value);
  if (currency) return formatLargeByCurrency(value, currency);
  return formatLarge(value);
}

export function ratioToPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (Math.abs(value) < 2) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}
