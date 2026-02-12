import type { OHLCVPoint } from "@/lib/types";

export type MaybeNumber = number | null;

export type PatternSignal = {
  name: string;
  direction: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  description: string;
};

export type SupportResistance = {
  supports: Array<{ level: number; touches: number }>;
  resistances: Array<{ level: number; touches: number }>;
};

export type VolumeProfileBin = {
  from: number;
  to: number;
  mid: number;
  volume: number;
  percent: number;
};

export type BacktestTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
};

export type BacktestResult = {
  initialCapital: number;
  finalCapital: number;
  totalReturnPercent: number;
  cagrPercent: number;
  maxDrawdownPercent: number;
  tradesCount: number;
  winRatePercent: number;
  trades: BacktestTrade[];
  equityCurve: Array<{ date: string; equity: number }>;
};

export type TimeframeSignal = {
  timeframe: string;
  signal: "Bullish" | "Bearish" | "Neutral";
  score: number;
  close: number | null;
  sma20: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return value;
}

function rollingWindow<T>(array: T[], index: number, size: number): T[] | null {
  if (index - size + 1 < 0) return null;
  return array.slice(index - size + 1, index + 1);
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function lastValue(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

export function normalizeHistory(history: Array<Partial<OHLCVPoint>>): OHLCVPoint[] {
  return history
    .map((row) => {
      const close = toNumber(row.close);
      const open = toNumber(row.open) ?? close;
      const high = toNumber(row.high) ?? close;
      const low = toNumber(row.low) ?? close;
      const volume = toNumber(row.volume) ?? 0;
      const date = typeof row.date === "string" ? row.date : "";

      return {
        date,
        open: open ?? 0,
        high: high ?? 0,
        low: low ?? 0,
        close: close ?? 0,
        volume,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.close) && Number.isFinite(row.high) && Number.isFinite(row.low))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (!values.length || period <= 1) {
    return values.map((value) => value ?? null);
  }

  for (let i = 0; i < values.length; i += 1) {
    const window = rollingWindow(values, i, period);
    if (!window) continue;
    const avg = window.reduce((sum, value) => sum + value, 0) / period;
    out[i] = avg;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (!values.length || period <= 1) return values.map((value) => value ?? null);
  const multiplier = 2 / (period + 1);

  let prevEma: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (i < period - 1) {
      out[i] = null;
      continue;
    }

    if (i === period - 1) {
      const seed = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
      prevEma = seed;
      out[i] = seed;
      continue;
    }

    if (prevEma === null) continue;
    const prev = prevEma;
    const nextEma: number = (value - prev) * multiplier + prev;
    out[i] = nextEma;
    prevEma = nextEma;
  }

  return out;
}

export function wma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (!values.length || period <= 1) return values.map((value) => value ?? null);
  const weightSum = (period * (period + 1)) / 2;

  for (let i = 0; i < values.length; i += 1) {
    const window = rollingWindow(values, i, period);
    if (!window) continue;
    const weighted = window.reduce((sum, value, idx) => sum + value * (idx + 1), 0);
    out[i] = weighted / weightSum;
  }
  return out;
}

export function bollinger(values: number[], period = 20, stdMult = 2) {
  const middle = sma(values, period);
  const upper: Array<number | null> = new Array(values.length).fill(null);
  const lower: Array<number | null> = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i += 1) {
    const window = rollingWindow(values, i, period);
    const mid = middle[i];
    if (!window || mid === null) continue;
    const variance = window.reduce((sum, value) => sum + (value - mid) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = mid + stdMult * stdDev;
    lower[i] = mid - stdMult * stdDev;
  }

  return { middle, upper, lower };
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: Array<number | null> = values.map((_, index) => {
    const fastValue = fastEma[index];
    const slowValue = slowEma[index];
    if (fastValue === null || slowValue === null) return null;
    return fastValue - slowValue;
  });

  const compact = macdLine.map((item) => item ?? 0);
  const signalLine = ema(compact, signalPeriod);
  const adjustedSignal = signalLine.map((item, index) => (macdLine[index] === null ? null : item));
  const histogram = macdLine.map((item, index) => {
    const signalValue = adjustedSignal[index];
    if (item === null || signalValue === null) return null;
    return item - signalValue;
  });

  return { macd: macdLine, signal: adjustedSignal, histogram };
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) out[i] = 100;
    else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }

  return out;
}

export function stochastic(history: OHLCVPoint[], period = 14, smoothK = 3, smoothD = 3) {
  const rawK: Array<number | null> = new Array(history.length).fill(null);
  for (let i = 0; i < history.length; i += 1) {
    const window = rollingWindow(history, i, period);
    if (!window) continue;
    const highestHigh = Math.max(...window.map((item) => item.high));
    const lowestLow = Math.min(...window.map((item) => item.low));
    if (highestHigh === lowestLow) {
      rawK[i] = 50;
      continue;
    }
    rawK[i] = ((history[i].close - lowestLow) / (highestHigh - lowestLow)) * 100;
  }

  const smoothKSeries = sma(
    rawK.map((item) => item ?? 0),
    smoothK
  ).map((item, index) => (rawK[index] === null ? null : item));
  const smoothDSeries = sma(
    smoothKSeries.map((item) => item ?? 0),
    smoothD
  ).map((item, index) => (smoothKSeries[index] === null ? null : item));

  return { k: smoothKSeries, d: smoothDSeries };
}

export function adx(history: OHLCVPoint[], period = 14): Array<number | null> {
  const n = history.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (n < period * 2 + 1) return out;

  const tr = new Array<number>(n).fill(0);
  const plusDM = new Array<number>(n).fill(0);
  const minusDM = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i += 1) {
    const current = history[i];
    const previous = history[i - 1];
    const highDiff = current.high - previous.high;
    const lowDiff = previous.low - current.low;

    tr[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    plusDM[i] = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM[i] = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
  }

  let trSmooth = 0;
  let plusSmooth = 0;
  let minusSmooth = 0;
  for (let i = 1; i <= period; i += 1) {
    trSmooth += tr[i];
    plusSmooth += plusDM[i];
    minusSmooth += minusDM[i];
  }

  const dx: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    if (i > period) {
      trSmooth = trSmooth - trSmooth / period + tr[i];
      plusSmooth = plusSmooth - plusSmooth / period + plusDM[i];
      minusSmooth = minusSmooth - minusSmooth / period + minusDM[i];
    }

    const plusDI = trSmooth === 0 ? 0 : (100 * plusSmooth) / trSmooth;
    const minusDI = trSmooth === 0 ? 0 : (100 * minusSmooth) / trSmooth;
    const diSum = plusDI + minusDI;
    dx[i] = diSum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / diSum;
  }

  let adxSeed = 0;
  for (let i = period; i < period * 2; i += 1) {
    adxSeed += dx[i] ?? 0;
  }
  out[period * 2 - 1] = adxSeed / period;

  for (let i = period * 2; i < n; i += 1) {
    const prev = out[i - 1] ?? 0;
    out[i] = ((prev * (period - 1)) + (dx[i] ?? 0)) / period;
  }

  return out;
}

export function vwap(history: OHLCVPoint[]): Array<number | null> {
  const out: Array<number | null> = new Array(history.length).fill(null);
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < history.length; i += 1) {
    const candle = history[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    out[i] = cumulativeVolume === 0 ? null : cumulativePV / cumulativeVolume;
  }

  return out;
}

function periodMid(history: OHLCVPoint[], index: number, period: number): number | null {
  const window = rollingWindow(history, index, period);
  if (!window) return null;
  const high = Math.max(...window.map((item) => item.high));
  const low = Math.min(...window.map((item) => item.low));
  return (high + low) / 2;
}

export function ichimoku(history: OHLCVPoint[]) {
  const tenkan: Array<number | null> = new Array(history.length).fill(null);
  const kijun: Array<number | null> = new Array(history.length).fill(null);
  const senkouA: Array<number | null> = new Array(history.length).fill(null);
  const senkouB: Array<number | null> = new Array(history.length).fill(null);
  const chikou: Array<number | null> = new Array(history.length).fill(null);

  for (let i = 0; i < history.length; i += 1) {
    const tenkanValue = periodMid(history, i, 9);
    const kijunValue = periodMid(history, i, 26);
    tenkan[i] = tenkanValue;
    kijun[i] = kijunValue;

    const leadA = tenkanValue !== null && kijunValue !== null ? (tenkanValue + kijunValue) / 2 : null;
    const leadB = periodMid(history, i, 52);

    const futureIndex = i + 26;
    if (futureIndex < history.length) {
      senkouA[futureIndex] = leadA;
      senkouB[futureIndex] = leadB;
    }

    const pastIndex = i - 26;
    if (pastIndex >= 0) chikou[pastIndex] = history[i].close;
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

export function heikinAshi(history: OHLCVPoint[]): OHLCVPoint[] {
  if (!history.length) return [];
  const out: OHLCVPoint[] = [];

  let prevOpen = (history[0].open + history[0].close) / 2;
  let prevClose = (history[0].open + history[0].high + history[0].low + history[0].close) / 4;

  for (let i = 0; i < history.length; i += 1) {
    const row = history[i];
    const haClose = (row.open + row.high + row.low + row.close) / 4;
    const haOpen = i === 0 ? prevOpen : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(row.high, haOpen, haClose);
    const haLow = Math.min(row.low, haOpen, haClose);

    out.push({
      date: row.date,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: row.volume,
    });

    prevOpen = haOpen;
    prevClose = haClose;
  }

  return out;
}

function averageTrueRange(history: OHLCVPoint[], period = 14): number | null {
  if (history.length <= period) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const row = history[i];
    const prevClose = history[i - 1].close;
    const tr = Math.max(row.high - row.low, Math.abs(row.high - prevClose), Math.abs(row.low - prevClose));
    trueRanges.push(tr);
  }
  const recent = trueRanges.slice(-period);
  if (!recent.length) return null;
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
}

export function renko(history: OHLCVPoint[], brickSize?: number): OHLCVPoint[] {
  if (!history.length) return [];
  const latestClose = history[history.length - 1].close;
  const atr = averageTrueRange(history, 14);
  const defaultBrick = Math.max((atr ?? latestClose * 0.01) * 0.8, latestClose * 0.0025);
  const size = brickSize && brickSize > 0 ? brickSize : defaultBrick;

  const bricks: OHLCVPoint[] = [];
  let lastClose = history[0].close;

  for (let i = 1; i < history.length; i += 1) {
    const row = history[i];
    while (row.close - lastClose >= size) {
      const open = lastClose;
      const close = lastClose + size;
      bricks.push({
        date: row.date,
        open,
        close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: row.volume,
      });
      lastClose = close;
    }
    while (lastClose - row.close >= size) {
      const open = lastClose;
      const close = lastClose - size;
      bricks.push({
        date: row.date,
        open,
        close,
        high: Math.max(open, close),
        low: Math.min(open, close),
        volume: row.volume,
      });
      lastClose = close;
    }
  }

  if (!bricks.length) {
    const row = history[history.length - 1];
    return [
      {
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      },
    ];
  }

  return bricks;
}

type Pivot = { index: number; price: number; type: "high" | "low" };

function pivots(history: OHLCVPoint[], window = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = window; i < history.length - window; i += 1) {
    const current = history[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      if (history[j].high >= current.high) isHigh = false;
      if (history[j].low <= current.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: current.high, type: "high" });
    if (isLow) out.push({ index: i, price: current.low, type: "low" });
  }
  return out;
}

function linearRegressionSlope(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);

  const denominator = n * sumXX - sumX ** 2;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

export function detectPatterns(history: OHLCVPoint[]): PatternSignal[] {
  const out: PatternSignal[] = [];
  if (history.length < 60) return out;

  const allPivots = pivots(history, 3);
  const highs = allPivots.filter((pivot) => pivot.type === "high");
  const lows = allPivots.filter((pivot) => pivot.type === "low");

  if (highs.length >= 3) {
    const [h1, h2, h3] = highs.slice(-3);
    const shoulderDistance = Math.abs(h1.price - h3.price) / h2.price;
    if (h2.price > h1.price * 1.03 && h2.price > h3.price * 1.03 && shoulderDistance < 0.08) {
      out.push({
        name: "Head & Shoulders",
        direction: "Bearish",
        confidence: Math.max(0.4, 1 - shoulderDistance),
        description: "Middle peak is significantly above both shoulders. Downside breakdown risk is elevated.",
      });
    }
  }

  if (highs.length >= 2) {
    const [p1, p2] = highs.slice(-2);
    const diff = Math.abs(p1.price - p2.price) / ((p1.price + p2.price) / 2);
    if (diff < 0.03) {
      out.push({
        name: "Double Top",
        direction: "Bearish",
        confidence: 0.65 - diff,
        description: "Two similar highs suggest supply near resistance. Confirmation needs neckline break.",
      });
    }
  }

  if (lows.length >= 2) {
    const [p1, p2] = lows.slice(-2);
    const diff = Math.abs(p1.price - p2.price) / ((p1.price + p2.price) / 2);
    if (diff < 0.03) {
      out.push({
        name: "Double Bottom",
        direction: "Bullish",
        confidence: 0.65 - diff,
        description: "Repeated support reaction often precedes trend reversal if neckline breaks.",
      });
    }
  }

  const recentPivots = allPivots.filter((pivot) => pivot.index >= history.length - 80);
  const recentHighs = recentPivots.filter((pivot) => pivot.type === "high").slice(-5);
  const recentLows = recentPivots.filter((pivot) => pivot.type === "low").slice(-5);
  if (recentHighs.length >= 3 && recentLows.length >= 3) {
    const highSlope = linearRegressionSlope(recentHighs.map((pivot) => ({ x: pivot.index, y: pivot.price })));
    const lowSlope = linearRegressionSlope(recentLows.map((pivot) => ({ x: pivot.index, y: pivot.price })));
    const base = history[history.length - 1].close || 1;
    const highSlopeNorm = highSlope / base;
    const lowSlopeNorm = lowSlope / base;

    if (Math.abs(highSlopeNorm) < 0.001 && lowSlopeNorm > 0.0007) {
      out.push({
        name: "Ascending Triangle",
        direction: "Bullish",
        confidence: 0.62,
        description: "Flat resistance with rising lows indicates potential bullish breakout setup.",
      });
    } else if (highSlopeNorm < -0.0007 && lowSlopeNorm > 0.0007) {
      out.push({
        name: "Symmetrical Triangle",
        direction: "Neutral",
        confidence: 0.58,
        description: "Converging highs and lows indicate compression. Wait for breakout confirmation.",
      });
    } else if (highSlopeNorm < -0.0007 && Math.abs(lowSlopeNorm) < 0.001) {
      out.push({
        name: "Descending Triangle",
        direction: "Bearish",
        confidence: 0.6,
        description: "Descending highs against flat support often resolves to downside.",
      });
    }
  }

  return out.slice(0, 4);
}

export function detectSupportResistance(history: OHLCVPoint[]): SupportResistance {
  if (history.length < 20) return { supports: [], resistances: [] };
  const currentPrice = history[history.length - 1].close;
  const tolerance = currentPrice * 0.015;
  const pivotPoints = pivots(history, 3);

  const clusters = (items: Pivot[]) => {
    const sorted = [...items].sort((a, b) => a.price - b.price);
    const groups: Array<{ values: number[]; touches: number }> = [];
    for (const item of sorted) {
      const group = groups.find((entry) => Math.abs((entry.values.reduce((s, v) => s + v, 0) / entry.values.length) - item.price) <= tolerance);
      if (group) {
        group.values.push(item.price);
        group.touches += 1;
      } else {
        groups.push({ values: [item.price], touches: 1 });
      }
    }
    return groups.map((group) => ({
      level: group.values.reduce((sum, value) => sum + value, 0) / group.values.length,
      touches: group.touches,
    }));
  };

  const lowLevels = clusters(pivotPoints.filter((pivot) => pivot.type === "low")).filter((item) => item.level < currentPrice);
  const highLevels = clusters(pivotPoints.filter((pivot) => pivot.type === "high")).filter((item) => item.level > currentPrice);

  const supportSorted = lowLevels.sort((a, b) => b.touches - a.touches || b.level - a.level).slice(0, 3);
  const resistanceSorted = highLevels.sort((a, b) => b.touches - a.touches || a.level - b.level).slice(0, 3);

  return { supports: supportSorted, resistances: resistanceSorted };
}

export function volumeProfile(history: OHLCVPoint[], bins = 12): { bins: VolumeProfileBin[]; pointOfControl: number | null } {
  if (!history.length) return { bins: [], pointOfControl: null };
  const minPrice = Math.min(...history.map((row) => row.low));
  const maxPrice = Math.max(...history.map((row) => row.high));
  if (minPrice === maxPrice) {
    return {
      bins: [
        { from: minPrice, to: maxPrice, mid: minPrice, volume: history.reduce((sum, row) => sum + row.volume, 0), percent: 100 },
      ],
      pointOfControl: minPrice,
    };
  }

  const width = (maxPrice - minPrice) / bins;
  const volumeBins = new Array<number>(bins).fill(0);
  for (const row of history) {
    const position = Math.min(bins - 1, Math.max(0, Math.floor((row.close - minPrice) / width)));
    volumeBins[position] += row.volume;
  }

  const totalVolume = volumeBins.reduce((sum, value) => sum + value, 0);
  const profile: VolumeProfileBin[] = volumeBins.map((volume, index) => {
    const from = minPrice + index * width;
    const to = from + width;
    return {
      from,
      to,
      mid: (from + to) / 2,
      volume,
      percent: totalVolume === 0 ? 0 : (volume / totalVolume) * 100,
    };
  });

  const point = profile.reduce((max, item) => (item.volume > max.volume ? item : max), profile[0]);
  return { bins: profile, pointOfControl: point?.mid ?? null };
}

export function backtestSmaCrossover(history: OHLCVPoint[], fastPeriod = 20, slowPeriod = 50): BacktestResult {
  const closes = history.map((row) => row.close);
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);

  const initialCapital = 100000;
  let cash = initialCapital;
  let shares = 0;
  let openTrade: { date: string; price: number } | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ date: string; equity: number }> = [];

  for (let i = 1; i < history.length; i += 1) {
    const fPrev = fast[i - 1];
    const sPrev = slow[i - 1];
    const fNow = fast[i];
    const sNow = slow[i];
    const price = history[i].close;

    if (fPrev !== null && sPrev !== null && fNow !== null && sNow !== null) {
      const bullishCross = fPrev <= sPrev && fNow > sNow;
      const bearishCross = fPrev >= sPrev && fNow < sNow;

      if (bullishCross && shares === 0) {
        shares = cash / price;
        cash = 0;
        openTrade = { date: history[i].date, price };
      } else if (bearishCross && shares > 0) {
        cash = shares * price;
        shares = 0;
        if (openTrade) {
          trades.push({
            entryDate: openTrade.date,
            exitDate: history[i].date,
            entryPrice: openTrade.price,
            exitPrice: price,
            returnPercent: ((price - openTrade.price) / openTrade.price) * 100,
          });
          openTrade = null;
        }
      }
    }

    const equity = shares > 0 ? shares * price : cash;
    equityCurve.push({ date: history[i].date, equity });
  }

  if (shares > 0) {
    const last = history[history.length - 1];
    const finalValue = shares * last.close;
    cash = finalValue;
    if (openTrade) {
      trades.push({
        entryDate: openTrade.date,
        exitDate: last.date,
        entryPrice: openTrade.price,
        exitPrice: last.close,
        returnPercent: ((last.close - openTrade.price) / openTrade.price) * 100,
      });
    }
    shares = 0;
  }

  const finalCapital = cash;
  const totalReturnPercent = ((finalCapital - initialCapital) / initialCapital) * 100;
  const years = Math.max((history.length - 1) / 252, 1 / 252);
  const cagrPercent = (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100;

  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak === 0 ? 0 : ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  const wins = trades.filter((trade) => trade.returnPercent > 0).length;
  const winRatePercent = trades.length ? (wins / trades.length) * 100 : 0;

  return {
    initialCapital,
    finalCapital,
    totalReturnPercent,
    cagrPercent,
    maxDrawdownPercent: maxDrawdown,
    tradesCount: trades.length,
    winRatePercent,
    trades,
    equityCurve,
  };
}

export function summarizeTimeframe(timeframe: string, history: OHLCVPoint[]): TimeframeSignal {
  if (!history.length) {
    return {
      timeframe,
      signal: "Neutral",
      score: 0,
      close: null,
      sma20: null,
      ema20: null,
      rsi14: null,
      macd: null,
      macdSignal: null,
    };
  }

  const closes = history.map((row) => row.close);
  const sma20 = sma(closes, 20);
  const ema20 = ema(closes, 20);
  const rsi14 = rsi(closes, 14);
  const macdSeries = macd(closes);

  const close = closes[closes.length - 1];
  const latestSma = lastValue(sma20);
  const latestEma = lastValue(ema20);
  const latestRsi = lastValue(rsi14);
  const latestMacd = lastValue(macdSeries.macd);
  const latestSignal = lastValue(macdSeries.signal);

  let score = 0;
  if (latestSma !== null && close > latestSma) score += 1;
  if (latestEma !== null && close > latestEma) score += 1;
  if (latestRsi !== null && latestRsi > 55) score += 1;
  if (latestMacd !== null && latestSignal !== null && latestMacd > latestSignal) score += 1;

  let signal: "Bullish" | "Bearish" | "Neutral" = "Neutral";
  if (score >= 3) signal = "Bullish";
  else if (score <= 1) signal = "Bearish";

  return {
    timeframe,
    signal,
    score,
    close,
    sma20: latestSma,
    ema20: latestEma,
    rsi14: latestRsi,
    macd: latestMacd,
    macdSignal: latestSignal,
  };
}

export function latestIndicatorSummary(history: OHLCVPoint[]) {
  const closes = history.map((row) => row.close);
  const sma20 = sma(closes, 20);
  const ema20 = ema(closes, 20);
  const wma20 = wma(closes, 20);
  const macdSeries = macd(closes);
  const rsi14 = rsi(closes, 14);
  const bb = bollinger(closes, 20, 2);
  const stoch = stochastic(history, 14, 3, 3);
  const adx14 = adx(history, 14);
  const vwapSeries = vwap(history);
  const ichi = ichimoku(history);

  return {
    series: {
      sma20,
      ema20,
      wma20,
      bollingerUpper: bb.upper,
      bollingerMiddle: bb.middle,
      bollingerLower: bb.lower,
      vwap: vwapSeries,
    },
    latest: {
      sma20: lastValue(sma20),
      ema20: lastValue(ema20),
      wma20: lastValue(wma20),
      macd: lastValue(macdSeries.macd),
      macdSignal: lastValue(macdSeries.signal),
      macdHistogram: lastValue(macdSeries.histogram),
      rsi14: lastValue(rsi14),
      bollingerUpper: lastValue(bb.upper),
      bollingerMiddle: lastValue(bb.middle),
      bollingerLower: lastValue(bb.lower),
      stochasticK: lastValue(stoch.k),
      stochasticD: lastValue(stoch.d),
      adx14: lastValue(adx14),
      vwap: lastValue(vwapSeries),
      ichimokuTenkan: lastValue(ichi.tenkan),
      ichimokuKijun: lastValue(ichi.kijun),
      ichimokuSenkouA: lastValue(ichi.senkouA),
      ichimokuSenkouB: lastValue(ichi.senkouB),
    },
  };
}

export function indicatorTone(value: MaybeNumber, low: number, high: number): "success" | "warning" | "danger" | "neutral" {
  if (value === null) return "neutral";
  if (value < low) return "danger";
  if (value > high) return "success";
  return "warning";
}

export function nearest(values: Array<{ level: number; touches: number }>, reference: number | null): number | null {
  if (!values.length || reference === null) return null;
  let best = values[0].level;
  let minDistance = Math.abs(reference - best);
  for (const item of values) {
    const distance = Math.abs(reference - item.level);
    if (distance < minDistance) {
      minDistance = distance;
      best = item.level;
    }
  }
  return best;
}

export function pctDistance(reference: number | null, target: number | null): number | null {
  if (reference === null || target === null || reference === 0) return null;
  return ((target - reference) / reference) * 100;
}
