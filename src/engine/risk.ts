// Risk metrics computed from the time-weighted index (trading days only).
import type { DayPoint } from './types.ts';
import { addDays, covariance, daysBetween, isWeekend, lastIndexLE, mean, stdev } from './util.ts';

export interface RiskMetrics {
  ret: number; // cumulative TWR over the window
  cagr: number;
  vol: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDD: number;
  maxDDDate: string | null;
  currentDD: number;
  longestDD: number; // calendar days
  beta: number | null;
  alpha: number | null;
  days: number;
  enough: boolean; // >= ~6 months of history for annualised measures
  bench: { ret: number; cagr: number; vol: number; sharpe: number | null; sortino: number | null; calmar: number | null; maxDD: number };
}

const TRADING_DAYS = 252;

function sample(series: DayPoint[], from: number, to: number, idx: (p: DayPoint) => number) {
  const pts: Array<{ date: string; v: number }> = [];
  // since inception: the index starts at 1.0 on the day before the first deposit
  if (from === 0 && series.length) pts.push({ date: addDays(series[0].date, -1), v: 1 });
  for (let i = from; i <= to; i++) {
    const p = series[i];
    if (isWeekend(p.date) && i !== to && i !== from) continue;
    pts.push({ date: p.date, v: idx(p) });
  }
  return pts;
}

function returns(pts: Array<{ v: number }>) {
  const r: number[] = [];
  for (let i = 1; i < pts.length; i++) r.push(pts[i - 1].v ? pts[i].v / pts[i - 1].v - 1 : 0);
  return r;
}

function drawdownStats(pts: Array<{ date: string; v: number }>) {
  let peak = -Infinity;
  let peakDate = pts[0]?.date;
  let maxDD = 0;
  let maxDDDate: string | null = null;
  let longest = 0;
  let inDDSince: string | null = null;
  for (const p of pts) {
    if (p.v >= peak) {
      if (inDDSince) longest = Math.max(longest, daysBetween(inDDSince, p.date));
      inDDSince = null;
      peak = p.v;
      peakDate = p.date;
    } else {
      if (!inDDSince) inDDSince = peakDate;
      const dd = p.v / peak - 1;
      if (dd < maxDD) { maxDD = dd; maxDDDate = p.date; }
    }
  }
  const lastPt = pts[pts.length - 1];
  if (inDDSince && lastPt) longest = Math.max(longest, daysBetween(inDDSince, lastPt.date));
  const currentDD = lastPt ? lastPt.v / Math.max(peak, lastPt.v) - 1 : 0;
  return { maxDD, maxDDDate, longest, currentDD };
}

function core(pts: Array<{ date: string; v: number }>) {
  const r = returns(pts);
  const days = pts.length > 1 ? daysBetween(pts[0].date, pts[pts.length - 1].date) : 0;
  const ret = pts.length > 1 && pts[0].v ? pts[pts.length - 1].v / pts[0].v - 1 : 0;
  const cagr = days > 0 ? Math.pow(1 + ret, 365 / days) - 1 : 0;
  const vol = stdev(r) * Math.sqrt(TRADING_DAYS);
  const mu = mean(r) * TRADING_DAYS;
  const downside = Math.sqrt(mean(r.map((x) => Math.min(0, x) ** 2))) * Math.sqrt(TRADING_DAYS);
  const dd = drawdownStats(pts);
  return {
    r, days, ret, cagr, vol,
    sharpe: vol ? cagr / vol : null,
    sortino: downside ? cagr / downside : null,
    mu,
    calmar: dd.maxDD ? cagr / Math.abs(dd.maxDD) : null,
    ...dd,
  };
}

export function riskMetrics(series: DayPoint[], fromDate: string | null, toDate: string, bench: string): RiskMetrics | null {
  if (series.length < 2) return null;
  const dates = series.map((p) => p.date);
  const to = lastIndexLE(dates, toDate);
  let from = fromDate ? lastIndexLE(dates, fromDate) : 0;
  if (from < 0) from = 0;
  if (to - from < 1) return null;
  const pp = sample(series, from, to, (p) => p.twrIndex);
  const bp = sample(series, from, to, (p) => p.benchLocal?.[bench] ?? p.benchIndex[bench] ?? 1);
  const P = core(pp);
  const B = core(bp);
  const n = Math.min(P.r.length, B.r.length);
  const varB = stdev(B.r.slice(0, n)) ** 2;
  const beta = varB ? covariance(P.r.slice(0, n), B.r.slice(0, n)) / varB : null;
  const enough = P.days >= 182;
  const alpha = enough && beta != null ? P.cagr - beta * B.cagr : null;
  return {
    ret: P.ret, cagr: P.cagr, vol: P.vol,
    sharpe: enough ? P.sharpe : null, sortino: enough ? P.sortino : null, calmar: enough ? P.calmar : null,
    maxDD: P.maxDD, maxDDDate: P.maxDDDate, currentDD: P.currentDD, longestDD: P.longest,
    beta, alpha, days: P.days, enough,
    bench: { ret: B.ret, cagr: B.cagr, vol: B.vol, sharpe: B.sharpe, sortino: B.sortino, calmar: B.calmar, maxDD: B.maxDD },
  };
}

/** drawdown series (TWR based) for charting */
export function drawdownSeries(series: DayPoint[], fromIdx = 0): Array<[string, number]> {
  let peak = -Infinity;
  const out: Array<[string, number]> = [];
  for (let i = fromIdx; i < series.length; i++) {
    const v = series[i].twrIndex;
    peak = Math.max(peak, v);
    out.push([series[i].date, peak > 0 ? v / peak - 1 : 0]);
  }
  return out;
}

/** rolling metric series over a trailing window of trading days */
export function rollingSeries(series: DayPoint[], bench: string, metric: 'Volatility' | 'Sharpe' | 'Sortino' | 'Beta' | 'Alpha', window = 63, fromIdx = 0): Array<[string, number | null]> {
  const pts = sample(series, 0, series.length - 1, (p) => p.twrIndex);
  const bpts = sample(series, 0, series.length - 1, (p) => p.benchLocal?.[bench] ?? p.benchIndex[bench] ?? 1);
  const pr = returns(pts);
  const br = returns(bpts);
  const out: Array<[string, number | null]> = [];
  const startDate = series[fromIdx]?.date ?? '';
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].date < startDate) continue;
    const a = Math.max(0, i - window);
    const rp = pr.slice(a, i);
    const rb = br.slice(a, i);
    if (rp.length < Math.min(20, window)) { out.push([pts[i].date, null]); continue; }
    const vol = stdev(rp) * Math.sqrt(TRADING_DAYS);
    const mu = mean(rp) * TRADING_DAYS;
    let v: number | null = null;
    if (metric === 'Volatility') v = vol;
    else if (metric === 'Sharpe') v = vol ? mu / vol : null;
    else if (metric === 'Sortino') {
      const dd = Math.sqrt(mean(rp.map((x) => Math.min(0, x) ** 2))) * Math.sqrt(TRADING_DAYS);
      v = dd ? mu / dd : null;
    } else {
      const vb = stdev(rb) ** 2;
      const beta = vb ? covariance(rp, rb) / vb : 0;
      v = metric === 'Beta' ? beta : mu - beta * mean(rb) * TRADING_DAYS;
    }
    out.push([pts[i].date, v]);
  }
  return out;
}
