export function formatCurrency(value?: number, currency = "USD") {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function formatLarge(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return value.toFixed(2);
}

export function ratioToPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (Math.abs(value) < 2) {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}
