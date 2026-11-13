// Trade analysis: per-lot results (FIFO or average cost), win rates against the benchmark
// and trading activity per period. Pure functions over the resolved ledger + market data.
import type { DayPoint, LedgerEntry } from './types.ts';
import type { MarketView } from './market.ts';
import { daysBetween, xirr } from './util.ts';

export interface LotClose {
  date: string;
  shares: number;
  /** sale proceeds (long) or cost to cover (short), base currency, before commission */
  amount: number;
  fee: number;
}

export interface TradeLot {
  id: string;
  symbol: string;
  name: string;
  side: 'long' | 'short';
  openDate: string;
  /** opening price per share in the instrument's trading currency (split-adjusted), whatever currency the trade was entered in */
  price: number;
  /** the instrument's trading currency */
  currency: string;
  /** original shares (split-adjusted) */
  shares: number;
  openShares: number;
  closedShares: number;
  /** base currency value of the opening trade for all original shares, excl. commission */
  costBasis: number;
  openFee: number;
  /** all commissions attributed to the lot (opening + its share of closing trades), base currency */
  fees: number;
  /** dividends received on the lot's shares, base currency, after withholding tax (as in the holdings table) */
  dividends: number;
  /** gain on the closed part, before fees and dividends */
  realized: number;
  /** open shares at the latest price, base currency */
  marketValue: number;
  unrealized: number;
  /** realized + unrealized + dividends - fees */
  totalGain: number;
  /** money-weighted (XIRR) cumulative return over the holding period; null when nothing was invested */
  totalReturn: number | null;
  benchReturn: number | null;
  /** totalReturn minus the benchmark's return (base currency) over the same holding period */
  alpha: number | null;
  closeDate: string | null;
  endDate: string;
  holdingDays: number;
  closes: LotClose[];
}

export interface LotOptions {
  costMethod: 'FIFO' | 'Average';
  today: string;
  benchmark: string;
  margin: boolean;
}

const EPS = 1e-9;
const OPENING = new Set(['Buy', 'Transfer in', 'Stock dividend']);
const CLOSING = new Set(['Sell', 'Transfer out']);

/** ex-date of a dividend ledger entry (auto dividends carry it in their id, manual ones use the entry date) */
function exDateOf(e: LedgerEntry): string {
  if (e.auto === 'dividend') {
    const d = e.id.slice(-10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return e.date;
}

export function buildTradeLots(ledger: LedgerEntry[], m: MarketView, o: LotOptions): TradeLot[] {
  const entries = ledger.filter((e) => e.symbol !== 'CASH' && e.status === 'confirmed' && e.date <= o.today);
  const lots: TradeLot[] = [];
  const divEntries: LedgerEntry[] = [];
  let seq = 0;

  const openLots = (symbol: string, side: 'long' | 'short') => lots.filter((l) => l.symbol === symbol && l.side === side && l.openShares > EPS);

  const takeFrom = (l: TradeLot, take: number, e: LedgerEntry, perShare: number, feePerShare: number, costOut: number) => {
    const amount = take * perShare;
    const fee = take * feePerShare;
    l.closes.push({ date: e.date, shares: take, amount, fee });
    l.fees += fee;
    l.realized += l.side === 'long' ? amount - costOut : costOut - amount;
    l.openShares -= take;
    l.closedShares += take;
    if (l.openShares <= EPS) { l.openShares = 0; l.closeDate = e.date; }
  };

  for (const e of entries) {
    if (e.action === 'Dividend') { divEntries.push(e); continue; }
    const opening = OPENING.has(e.action);
    if (!opening && !CLOSING.has(e.action)) continue;
    const f = m.splitFactorAfter(e.symbol, e.date);
    const sh = e.shares * f;
    if (!(sh > EPS)) continue;
    const value = e.action === 'Stock dividend' ? 0 : e.amountBase;
    const perShare = value / sh;
    const feePerShare = e.commissionBase / sh;
    let remaining = sh;

    // a buy first covers open shorts, a sell first closes open longs
    const opp = openLots(e.symbol, opening ? 'short' : 'long');
    if (opp.length) {
      if (!opening && o.costMethod === 'Average') {
        const tot = opp.reduce((s, l) => s + l.openShares, 0);
        const avg = opp.reduce((s, l) => s + (l.costBasis / l.shares) * l.openShares, 0) / tot;
        const sold = Math.min(remaining, tot);
        for (const l of opp) {
          const take = Math.min(l.openShares, (sold * l.openShares) / tot);
          takeFrom(l, take, e, perShare, feePerShare, take * avg);
        }
        remaining -= sold;
      } else {
        for (const l of opp) {
          if (remaining <= EPS) break;
          const take = Math.min(l.openShares, remaining);
          takeFrom(l, take, e, perShare, feePerShare, (take * l.costBasis) / l.shares);
          remaining -= take;
        }
      }
    }

    if (remaining > EPS && (opening || o.margin)) {
      const fee = remaining * feePerShare;
      const ccy = m.currencyOf(e.symbol);
      const price = (e.currency === ccy ? e.price : (e.price * e.fx) / m.fxAt(ccy, e.date)) / f;
      lots.push({
        id: `tl${++seq}`, symbol: e.symbol, name: m.name(e.symbol), side: opening ? 'long' : 'short', openDate: e.date,
        price, currency: ccy, shares: remaining, openShares: remaining, closedShares: 0,
        costBasis: remaining * perShare, openFee: fee, fees: fee, dividends: 0, realized: 0, marketValue: 0, unrealized: 0,
        totalGain: 0, totalReturn: null, benchReturn: null, alpha: null, closeDate: null, endDate: o.today, holdingDays: 0, closes: [],
      });
    }
  }

  // dividends: split each payment over the long lots that held shares before the ex-date
  const divFlows = new Map<TradeLot, Array<[string, number]>>();
  for (const e of divEntries) {
    const ex = exDateOf(e);
    const held = lots
      .filter((l) => l.symbol === e.symbol && l.side === 'long' && l.openDate < ex)
      .map((l) => [l, l.shares - l.closes.filter((c) => c.date < ex).reduce((s, c) => s + c.shares, 0)] as const)
      .filter(([, q]) => q > EPS);
    const tot = held.reduce((s, [, q]) => s + q, 0);
    if (tot <= EPS) continue;
    const net = e.amountBase - e.commissionBase - (e.taxBase ?? 0);
    for (const [l, q] of held) {
      const amt = (net * q) / tot;
      l.dividends += amt;
      if (!divFlows.has(l)) divFlows.set(l, []);
      divFlows.get(l)!.push([e.date, amt]);
    }
  }

  // valuation, returns and benchmark comparison
  const bccy = m.currencyOf(o.benchmark);
  const benchAt = (d: string) => {
    const px = m.priceAt(o.benchmark, d);
    return px == null ? null : px * m.fxAt(bccy, d);
  };
  for (const l of lots) {
    const last = m.lastPrice(l.symbol) ?? l.price;
    const fxNow = m.fxAt(l.currency, o.today);
    const cps = l.costBasis / l.shares;
    l.marketValue = l.openShares * last * fxNow;
    l.unrealized = l.side === 'long' ? l.marketValue - cps * l.openShares : cps * l.openShares - l.marketValue;
    l.totalGain = l.realized + l.unrealized + l.dividends - l.fees;
    l.endDate = l.closeDate ?? o.today;
    l.holdingDays = Math.max(0, daysBetween(l.openDate, l.endDate));

    const invested = l.costBasis + l.openFee;
    const simple = invested > EPS ? l.totalGain / invested : null;
    let ret = simple;
    if (l.side === 'long' && invested > EPS && l.holdingDays > 0) {
      const flows: Array<[string, number]> = [[l.openDate, -invested]];
      for (const c of l.closes) flows.push([c.date, c.amount - c.fee]);
      for (const d of divFlows.get(l) ?? []) flows.push(d);
      if (l.openShares > EPS) flows.push([o.today, l.marketValue]);
      flows.sort((a, b) => a[0].localeCompare(b[0]));
      const r = xirr(flows);
      if (r != null && isFinite(r)) {
        const cum = Math.pow(1 + r, l.holdingDays / 365) - 1;
        if (isFinite(cum)) ret = cum;
      }
    }
    l.totalReturn = ret;

    const b0 = benchAt(l.openDate);
    const b1 = benchAt(l.endDate);
    l.benchReturn = b0 && b1 ? b1 / b0 - 1 : null;
    l.alpha = l.totalReturn != null && l.benchReturn != null ? l.totalReturn - l.benchReturn : null;
  }
  return lots;
}

export interface TradeStats {
  lots: number;
  closed: number;
  wins: number;
  losses: number;
  winRate: number | null;
  benchWins: number;
  benchLosses: number;
  benchWinRate: number | null;
  totalGain: number;
}

/** win = positive total gain; win vs benchmark = positive alpha over the lot's own holding period */
export function tradeStats(lots: TradeLot[]): TradeStats {
  const wins = lots.filter((l) => l.totalGain > 0).length;
  const compared = lots.filter((l) => l.alpha != null);
  const benchWins = compared.filter((l) => l.alpha! > 0).length;
  return {
    lots: lots.length,
    closed: lots.filter((l) => l.closeDate != null).length,
    wins,
    losses: lots.length - wins,
    winRate: lots.length ? wins / lots.length : null,
    benchWins,
    benchLosses: compared.length - benchWins,
    benchWinRate: compared.length ? benchWins / compared.length : null,
    totalGain: lots.reduce((s, l) => s + l.totalGain, 0),
  };
}

// ---------------- activity & costs ----------------
export type Bucket = 'Monthly' | 'Quarterly' | 'Annually';

export interface ActivityRow {
  key: string;
  label: string;
  buys: number;
  sells: number;
  buyValue: number;
  sellValue: number;
  buyFees: number;
  sellFees: number;
  fees: number;
  trades: number;
  tradeValue: number;
  /** average daily portfolio value over the period */
  avgValue: number;
  feePct: number | null;
  turnover: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketKey(date: string, b: Bucket): string {
  if (b === 'Annually') return date.slice(0, 4);
  if (b === 'Quarterly') return `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
  return date.slice(0, 7);
}

export function bucketLabel(key: string, b: Bucket): string {
  if (b === 'Annually') return key;
  if (b === 'Quarterly') return key.replace('-', ' ');
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

function finishRow(r: ActivityRow, valueSum: number, days: number): ActivityRow {
  r.fees = r.buyFees + r.sellFees;
  r.trades = r.buys + r.sells;
  r.tradeValue = r.buyValue + r.sellValue;
  r.avgValue = days ? valueSum / days : 0;
  r.feePct = r.avgValue > EPS ? r.fees / r.avgValue : null;
  r.turnover = r.avgValue > EPS ? Math.min(r.buyValue, r.sellValue) / r.avgValue : null;
  return r;
}

const emptyRow = (key: string, label: string): ActivityRow => ({
  key, label, buys: 0, sells: 0, buyValue: 0, sellValue: 0, buyFees: 0, sellFees: 0, fees: 0, trades: 0, tradeValue: 0, avgValue: 0, feePct: null, turnover: null,
});

/**
 * Buys and sells per calendar period (oldest first) plus a total row.
 * Portfolio turnover = lesser of purchases and sales / average portfolio value (the usual fund definition).
 */
export function tradeActivity(ledger: LedgerEntry[], series: DayPoint[], b: Bucket, filter?: (e: LedgerEntry) => boolean): { rows: ActivityRow[]; total: ActivityRow } {
  const trades = ledger.filter((e) => (e.action === 'Buy' || e.action === 'Sell') && e.auto == null && e.status === 'confirmed' && (!filter || filter(e)));
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const p of series) {
    const k = bucketKey(p.date, b);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  for (const e of trades) {
    const k = bucketKey(e.date, b);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  keys.sort();
  const rows = new Map(keys.map((k) => [k, emptyRow(k, bucketLabel(k, b))]));
  const total = emptyRow('total', 'Total');
  for (const e of trades) {
    const r = rows.get(bucketKey(e.date, b))!;
    for (const x of [r, total]) {
      if (e.action === 'Buy') { x.buys++; x.buyValue += e.amountBase; x.buyFees += e.commissionBase; }
      else { x.sells++; x.sellValue += e.amountBase; x.sellFees += e.commissionBase; }
    }
  }
  const sums = new Map<string, [number, number]>();
  let allSum = 0;
  for (const p of series) {
    const k = bucketKey(p.date, b);
    const s = sums.get(k) ?? [0, 0];
    s[0] += p.value; s[1] += 1;
    sums.set(k, s);
    allSum += p.value;
  }
  const out = keys.map((k) => { const [v, n] = sums.get(k) ?? [0, 0]; return finishRow(rows.get(k)!, v, n); });
  return { rows: out, total: finishRow(total, allSum, series.length) };
}
