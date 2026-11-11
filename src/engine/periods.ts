// Period returns (MWR / TWR / SR) for the portfolio and its "what if" benchmark simulations.
import type { DayPoint, Method } from './types.ts';
import { addDays, addMonths, addYears, daysBetween, lastIndexLE, xirr } from './util.ts';

export type PeriodKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | '5Y' | 'All';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '1D': '1D', '1W': '1W', '1M': '1M', '3M': '3M', '6M': '6M', YTD: 'YTD', '1Y': '1Y', '2Y': '2Y', '3Y': '3Y', '5Y': '5Y', All: 'All',
};

/** Base date for a period: the value at the END of this date is the starting value. */
export function periodBaseDate(key: PeriodKey, today: string): string | null {
  switch (key) {
    case '1D': return addDays(today, -1);
    case '1W': return addDays(today, -7);
    case '1M': return addMonths(today, -1);
    case '3M': return addMonths(today, -3);
    case '6M': return addMonths(today, -6);
    case 'YTD': return `${Number(today.slice(0, 4)) - 1}-12-31`;
    case '1Y': return addYears(today, -1);
    case '2Y': return addYears(today, -2);
    case '3Y': return addYears(today, -3);
    case '5Y': return addYears(today, -5);
    case 'All': return null;
  }
}

/** true when the portfolio is older than the period (otherwise UI shows "-") */
export function periodAvailable(key: PeriodKey, today: string, inception: string | null): boolean {
  if (!inception) return false;
  if (key === 'All') return true;
  const b = periodBaseDate(key, today)!;
  return b >= addDays(inception, -1) || key === 'YTD' || key === '1D' || key === '1W' || key === '1M';
}

export interface PeriodResult {
  gain: number;
  pct: number;
  annualized: number;
  startValue: number;
  endValue: number;
  netFlows: number;
  days: number;
  startDate: string;
  endDate: string;
}

type Accessor = { value: (p: DayPoint) => number; index: (p: DayPoint) => number };

export const portfolioAccessor: Accessor = { value: (p) => p.value, index: (p) => p.twrIndex };
export function benchAccessor(sym: string): Accessor {
  return { value: (p) => p.bench[sym] ?? 0, index: (p) => p.benchIndex[sym] ?? 1 };
}

/**
 * Return between two dates (inclusive end). baseDate = null (or before inception) means "since inception".
 * Flows on days after the base date up to the end date are external cash flows.
 */
export function periodReturn(series: DayPoint[], baseDate: string | null, endDate: string, method: Method, acc: Accessor = portfolioAccessor): PeriodResult | null {
  if (!series.length) return null;
  const dates = series.map((p) => p.date);
  const e = lastIndexLE(dates, endDate);
  if (e < 0) return null;
  let s = baseDate ? lastIndexLE(dates, baseDate) : -1;
  if (s >= e) s = e - 1;
  const startValue = s >= 0 ? acc.value(series[s]) : 0;
  const endValue = acc.value(series[e]);
  let netFlows = 0;
  let posFlows = 0;
  const cfs: Array<[string, number]> = [];
  const t0 = s >= 0 ? series[s].date : series[0].date;
  if (s >= 0 && startValue > 0) cfs.push([series[s].date, -startValue]);
  for (let i = s + 1; i <= e; i++) {
    const f = series[i].flow;
    if (!f) continue;
    netFlows += f;
    if (f > 0) posFlows += f;
    cfs.push([series[i].date, -f]);
  }
  cfs.push([series[e].date, endValue]);
  const gain = endValue - startValue - netFlows;
  const days = Math.max(1, daysBetween(t0, series[e].date));
  let pct = 0;
  if (method === 'TWR') {
    const i0 = s >= 0 ? acc.index(series[s]) : 1;
    pct = i0 ? acc.index(series[e]) / i0 - 1 : 0;
  } else if (method === 'SR') {
    const denom = startValue + posFlows;
    pct = denom ? gain / denom : 0;
  } else {
    const r = xirr(cfs);
    if (r == null) {
      const denom = startValue + posFlows;
      pct = denom ? gain / denom : 0;
    } else pct = Math.pow(1 + r, days / 365) - 1;
  }
  const annualized = Math.pow(1 + pct, 365 / days) - 1;
  return { gain, pct, annualized, startValue, endValue, netFlows, days, startDate: t0, endDate: series[e].date };
}

export function periodReturnByKey(series: DayPoint[], key: PeriodKey, today: string, method: Method, acc: Accessor = portfolioAccessor) {
  return periodReturn(series, periodBaseDate(key, today), today, method, acc);
}

/** Calendar buckets (month / quarter / year) with returns per bucket */
export function bucketReturns(series: DayPoint[], bucket: 'Monthly' | 'Quarterly' | 'Annually', method: Method, acc: Accessor = portfolioAccessor) {
  if (!series.length) return [];
  const keyOf = (d: string) => (bucket === 'Monthly' ? d.slice(0, 7) : bucket === 'Quarterly' ? `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}` : d.slice(0, 4));
  const out: Array<{ key: string; start: string; end: string; result: PeriodResult | null }> = [];
  let curKey = keyOf(series[0].date);
  let startIdx = 0;
  for (let i = 1; i <= series.length; i++) {
    const k = i < series.length ? keyOf(series[i].date) : null;
    if (k !== curKey) {
      const base = startIdx > 0 ? series[startIdx - 1].date : null;
      out.push({ key: curKey, start: series[startIdx].date, end: series[i - 1].date, result: periodReturn(series, base, series[i - 1].date, method, acc) });
      if (k) { curKey = k; startIdx = i; }
    }
  }
  return out;
}
