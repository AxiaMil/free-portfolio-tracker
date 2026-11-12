// Dividend analytics for the Dividends page: growth-adjusted projections, 12-month windows,
// headline yields, ticker x month pivots and chart buckets. Pure functions over the engine result.
// Every amount here is net of the portfolio's withholding tax (what actually reaches the portfolio's cash);
// the gross amount and the tax are kept on each event so the page can show gross - withholding = net.
import type { EngineResult } from './portfolio.ts';
import type { MarketView } from './market.ts';
import type { DividendEvent } from './types.ts';
import { addDays, addMonths, addYears, daysBetween } from './util.ts';

export type DivLabel = 'Received' | 'Confirmed' | 'Estimated' | 'Estimated*';

export interface DivEvent extends DividendEvent {
  /** net amount in the base currency: gross - withholding */
  amountBase: number;
  /** gross amount before withholding, in the base currency */
  grossBase: number;
  key: string;
  upcoming: boolean;
  label: DivLabel;
  /** dividend per share converted to the base currency */
  perShareBase: number;
  /** growth factor applied to an estimated payout (1 = none) */
  growth: number;
}

export type Freq = 'Monthly' | 'Quarterly' | 'Annually';

/**
 * Dividend growth used for estimated payouts: the latest payment compared with the payment made
 * about one year before it (same period last year), clamped to [0.25, 2].
 */
export function dividendGrowth(m: MarketView, symbol: string, today: string): number {
  const hist = m.dividends(symbol).filter(([d, a]) => d <= today && a > 0);
  if (hist.length < 2) return 1;
  const [lastDate, lastAmt] = hist[hist.length - 1];
  const target = addYears(lastDate, -1);
  let prev = 0;
  let gap = 46;
  for (let i = 0; i < hist.length - 1; i++) {
    const g = Math.abs(daysBetween(hist[i][0], target));
    if (g < gap) {
      gap = g;
      prev = hist[i][1];
    }
  }
  if (!prev) return 1;
  return Math.min(2, Math.max(0.25, lastAmt / prev));
}

/** engine dividend events + growth on estimates + display labels, sorted by pay date */
export function buildDividendEvents(r: EngineResult, m: MarketView): DivEvent[] {
  const growth = new Map<string, number>();
  const out: DivEvent[] = r.dividends.map((d, i) => {
    let g = 1;
    if (d.status === 'estimated') {
      if (!growth.has(d.symbol)) growth.set(d.symbol, dividendGrowth(m, d.symbol, r.today));
      g = growth.get(d.symbol)!;
    }
    const grossBase = d.amountBase * g;
    const taxBase = (d.taxBase ?? 0) * g;
    const amountBase = grossBase - taxBase;
    const netShare = grossBase ? amountBase / grossBase : 1;
    const perShare = d.perShare * g * netShare;
    const prof = m.profile(d.symbol);
    let label: DivLabel = 'Received';
    if (d.status === 'confirmed') label = prof?.dividendDate ? 'Confirmed' : 'Estimated*';
    else if (d.status === 'estimated') label = 'Estimated';
    return {
      ...d,
      perShare,
      amountBase,
      grossBase,
      taxBase,
      key: `${d.symbol}-${d.exDate}-${i}`,
      upcoming: d.status !== 'received',
      label,
      perShareBase: d.shares ? amountBase / d.shares : 0,
      growth: g,
    };
  });
  return out.sort((a, b) => a.payDate.localeCompare(b.payDate) || a.symbol.localeCompare(b.symbol));
}

export function endOfMonth(isoDate: string): string {
  return addDays(addMonths(`${isoDate.slice(0, 7)}-01`, 1), -1);
}

/** consecutive month keys "YYYY-MM" from..to (inclusive) */
export function monthKeys(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let d = `${fromIso.slice(0, 7)}-01`;
  const end = toIso.slice(0, 7);
  while (d.slice(0, 7) <= end && out.length < 1200) {
    out.push(d.slice(0, 7));
    d = addMonths(d, 1);
  }
  return out;
}

export interface DivWindow {
  from: string; // exclusive
  to: string; // inclusive
  months: string[];
  events: DivEvent[];
}

/** upcoming payouts from today through the end of the 12th calendar month (current month included) */
export function upcomingWindow(events: DivEvent[], today: string): DivWindow {
  const to = endOfMonth(addMonths(`${today.slice(0, 7)}-01`, 11));
  return { from: today, to, months: monthKeys(today, to), events: events.filter((e) => e.upcoming && e.payDate <= to) };
}

/** payouts received over the trailing 12 months (today - 1y, today] */
export function historicalWindow(events: DivEvent[], today: string, yearsBack = 0): DivWindow {
  const to = addYears(today, -yearsBack);
  const from = addYears(to, -1);
  return { from, to, months: monthKeys(addDays(from, 1), to), events: events.filter((e) => !e.upcoming && e.payDate > from && e.payDate <= to) };
}

export interface DivSummary {
  /** net income in the window (after withholding) */
  total: number;
  /** the same before withholding, and the tax withheld: gross - withheld = total */
  gross: number;
  withheld: number;
  /** growth vs the comparison window (null when there is nothing to compare with) */
  yoy: number | null;
  yieldTTM: number;
  yieldOnCost: number;
  avgMonthly: number;
  avgDaily: number;
  /** total of the comparison window (past 12 months for Upcoming, the 12 months before for Historical) */
  prev: number;
  byTicker: Array<{ name: string; value: number }>;
  /** held symbols that paid in the past 12 months or will pay in the next 12 */
  payers: string[];
  window: DivWindow;
}

const sumAmt = (xs: DivEvent[]) => xs.reduce((s, e) => s + e.amountBase, 0);

export function summarize(events: DivEvent[], r: EngineResult, mode: 'Upcoming' | 'Historical'): DivSummary {
  const past = historicalWindow(events, r.today);
  const window = mode === 'Upcoming' ? upcomingWindow(events, r.today) : past;
  const compare = mode === 'Upcoming' ? past : historicalWindow(events, r.today, 1);
  const total = sumAmt(window.events);
  const prev = sumAmt(compare.events);
  const cost = r.holdings.reduce((s, h) => s + h.costValue, 0);
  const by = new Map<string, number>();
  for (const e of window.events) by.set(e.symbol, (by.get(e.symbol) ?? 0) + e.amountBase);
  const held = new Set(r.holdings.map((h) => h.symbol));
  const payers = new Set([...upcomingWindow(events, r.today).events, ...past.events].map((e) => e.symbol).filter((s) => held.has(s)));
  const withheld = window.events.reduce((a, e) => a + e.taxBase, 0);
  return {
    total,
    gross: total + withheld,
    withheld,
    yoy: prev > 0 ? total / prev - 1 : null,
    prev,
    yieldTTM: r.value ? total / r.value : 0,
    yieldOnCost: cost ? total / cost : 0,
    avgMonthly: total / 12,
    avgDaily: total / 365,
    byTicker: [...by.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    payers: [...payers],
    window,
  };
}

export interface PivotRow {
  symbol: string;
  cells: Record<string, number>;
  total: number;
}

export function pivotByMonth(events: DivEvent[], months: string[]): { rows: PivotRow[]; totals: Record<string, number>; total: number } {
  const rows = new Map<string, PivotRow>();
  const totals: Record<string, number> = {};
  let total = 0;
  const allowed = new Set(months);
  for (const e of events) {
    const k = e.payDate.slice(0, 7);
    if (!allowed.has(k)) continue;
    const row = rows.get(e.symbol) ?? { symbol: e.symbol, cells: {}, total: 0 };
    row.cells[k] = (row.cells[k] ?? 0) + e.amountBase;
    row.total += e.amountBase;
    rows.set(e.symbol, row);
    totals[k] = (totals[k] ?? 0) + e.amountBase;
    total += e.amountBase;
  }
  return { rows: [...rows.values()].sort((a, b) => b.total - a.total), totals, total };
}

export function bucketKey(isoDate: string, f: Freq): string {
  if (f === 'Monthly') return isoDate.slice(0, 7);
  if (f === 'Quarterly') return `${isoDate.slice(0, 4)}-Q${Math.ceil(Number(isoDate.slice(5, 7)) / 3)}`;
  return isoDate.slice(0, 4);
}

export interface DivBucket {
  key: string;
  received: number;
  upcoming: number;
  tickers: Array<{ symbol: string; amount: number; upcoming: boolean }>;
}

/** stacked received / upcoming totals per calendar bucket, with no gaps between first and last */
export function bucketize(events: DivEvent[], f: Freq): DivBucket[] {
  if (!events.length) return [];
  const first = events[0].payDate;
  const last = events[events.length - 1].payDate;
  const keys: string[] = [];
  for (const m of monthKeys(first, last)) {
    const k = bucketKey(`${m}-01`, f);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  const map = new Map<string, DivBucket>(keys.map((k) => [k, { key: k, received: 0, upcoming: 0, tickers: [] }]));
  for (const e of events) {
    const b = map.get(bucketKey(e.payDate, f));
    if (!b) continue;
    if (e.upcoming) b.upcoming += e.amountBase;
    else b.received += e.amountBase;
    const t = b.tickers.find((x) => x.symbol === e.symbol && x.upcoming === e.upcoming);
    if (t) t.amount += e.amountBase;
    else b.tickers.push({ symbol: e.symbol, amount: e.amountBase, upcoming: e.upcoming });
  }
  for (const b of map.values()) b.tickers.sort((a, z) => z.amount - a.amount);
  return keys.map((k) => map.get(k)!);
}

export interface PositionRow {
  symbol: string;
  name: string;
  shares: number;
  marketValue: number;
  costValue: number;
  annualPerShare: number; // base currency
  projected: number;
  yield: number;
  yieldOnCost: number;
  receivedTTM: number;
  receivedAll: number;
  nextEx: string | null;
  nextPay: string | null;
  nextAmount: number | null;
}

/** one row per dividend-paying holding: projected income, yields and the next payout */
export function positionRows(events: DivEvent[], r: EngineResult): PositionRow[] {
  const up = upcomingWindow(events, r.today).events;
  const past = historicalWindow(events, r.today).events;
  const out: PositionRow[] = [];
  for (const h of r.holdings) {
    const mine = up.filter((e) => e.symbol === h.symbol);
    const recv = past.filter((e) => e.symbol === h.symbol);
    if (!mine.length && !recv.length) continue;
    const projected = sumAmt(mine);
    const next = events.find((e) => e.symbol === h.symbol && e.upcoming) ?? null;
    out.push({
      symbol: h.symbol,
      name: h.name,
      shares: h.shares,
      marketValue: h.marketValue,
      costValue: h.costValue,
      annualPerShare: h.shares ? projected / h.shares : 0,
      projected,
      yield: h.marketValue ? projected / h.marketValue : 0,
      yieldOnCost: h.costValue ? projected / h.costValue : 0,
      receivedTTM: sumAmt(recv),
      receivedAll: sumAmt(events.filter((e) => e.symbol === h.symbol && !e.upcoming)),
      nextEx: next?.exDate ?? null,
      nextPay: next?.payDate ?? null,
      nextAmount: next?.amountBase ?? null,
    });
  }
  return out.sort((a, b) => b.projected - a.projected || b.receivedTTM - a.receivedTTM);
}
