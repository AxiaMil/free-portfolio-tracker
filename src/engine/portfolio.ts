// Core portfolio engine. Pure functions: (transactions + market data) -> everything the UI shows.
import type { DayPoint, DividendEvent, Holding, LedgerEntry, Lot, Portfolio, Txn } from './types.ts';
import { MarketView } from './market.ts';
import { addDays, addYears, daysBetween, eachDay, lastIndexLE, xirr } from './util.ts';

const INFLOW_CASH = new Set(['Deposit', 'Interest income', 'Other income', 'Dividend']);
const OUTFLOW_CASH = new Set(['Withdraw', 'Fees', 'Taxes', 'Interest expense', 'Other expense']);
const ORDER: Record<string, number> = {
  Deposit: 0, 'Transfer in': 1, Dividend: 2, 'Stock dividend': 2, 'Interest income': 2, 'Other income': 2,
  Sell: 3, Buy: 4, Fees: 5, Taxes: 5, 'Interest expense': 5, 'Other expense': 5, 'Transfer out': 6, Withdraw: 7,
};

export interface EngineOptions {
  costMethod: 'FIFO' | 'Average';
  today: string;
}

export interface EngineResult {
  base: string;
  today: string;
  inception: string | null;
  userLedger: LedgerEntry[];
  ledger: LedgerEntry[]; // adjusted, chronological
  /** price: the trade price is outside the day's low-high range; oversold: more shares sold than held (low = high = shares held then, as entered) */
  warnings: Array<{ id: string; date: string; symbol: string; message: string; low: number; high: number; kind: 'price' | 'oversold' }>;
  series: DayPoint[];
  dateIndex: Map<string, number>;
  holdings: Holding[]; // open positions, sorted by market value desc
  cashRow: Holding;
  /** "Dividends to be paid" shown beside cash, or null when there are none */
  toBePaidRow: Holding | null;
  closed: string[];
  lots: Lot[];
  dividends: DividendEvent[];
  value: number;
  /** cash paid in: dividends count only from their payment date */
  cash: number;
  /** dividends past their ex-date, not paid yet, after withholding: in value, not in cash (value = cash + holdings + toBePaid) */
  toBePaid: number;
  netDeposits: number;
  pnl: { unrealized: number; realized: number; dividends: number; fees: number; taxes: number; interests: number; others: number };
  symbols: string[];
  benchmarks: string[];
  realizedBySymbol: Record<string, number>;
  feesBySymbol: Record<string, number>;
  /** dividends received per holding, after withholding tax (what reached your cash) */
  dividendsBySymbol: Record<string, number>;
  /** currencies the portfolio uses that have no exchange rate to the base currency yet: their values are not converted */
  missingFx: string[];
}

const isCashSymbol = (s: string) => !s || s.toUpperCase() === 'CASH';

export function resolveTxns(p: Portfolio, m: MarketView): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const t of p.transactions) {
    const cash = isCashSymbol(t.symbol) || ['Deposit', 'Withdraw', 'Fees', 'Taxes', 'Interest income', 'Interest expense', 'Other income', 'Other expense'].includes(t.action);
    const currency = t.currency && t.currency !== 'Market' ? t.currency.toUpperCase() : cash ? p.currency : m.currencyOf(t.symbol);
    const fx = m.fxAt(currency, t.date);
    const gross = (Number(t.price) || 0) * (Number(t.shares) || 0);
    out.push({
      id: t.id,
      date: t.date,
      action: t.action,
      symbol: cash ? 'CASH' : t.symbol.toUpperCase(),
      price: Number(t.price) || 0,
      currency,
      shares: Number(t.shares) || 0,
      commission: Number(t.commission) || 0,
      commissionBase: (Number(t.commission) || 0) * fx,
      amountBase: gross * fx,
      fx,
      auto: null,
      status: 'confirmed',
      sourceId: t.id,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (ORDER[a.action] ?? 9) - (ORDER[b.action] ?? 9));
}

/** a typical wait from ex-date to payment where a company's own isn't known: US listings mostly pay within 2-4 weeks */
export const DEFAULT_PAY_LAG = { us: 21, other: 30 };

/**
 * usual days from ex-date to payment for this holding, to estimate a payment date that isn't published: its own
 * published dates (the median of the latest 4), else Yahoo's profile, else a typical wait for its market
 */
export function payLag(m: MarketView, symbol: string): number {
  const lags = (m.payoutInfo(symbol)?.records ?? []).flatMap((r) => (r.payDate ? [daysBetween(r.exDate, r.payDate)] : [])).slice(0, 4).filter((x) => x >= 0 && x <= 120);
  if (lags.length) return lags.sort((a, b) => a - b)[Math.floor(lags.length / 2)] ?? 0;
  const p = m.profile(symbol);
  if (p?.exDividendDate && p?.dividendDate) {
    const lag = daysBetween(p.exDividendDate, p.dividendDate);
    if (lag >= 0 && lag <= 120) return lag;
  }
  return symbol.includes('.') ? DEFAULT_PAY_LAG.other : DEFAULT_PAY_LAG.us;
}

/** shares held (split-adjusted) strictly before `date`; entries in date order. Without margin, never below zero. */
function sharesBefore(entries: LedgerEntry[], symbol: string, date: string, m: MarketView, margin: boolean): number {
  let s = 0;
  for (const e of entries) {
    if (e.symbol !== symbol || e.date >= date) continue;
    const f = m.splitFactorAfter(symbol, e.date);
    if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') s += e.shares * f;
    else if (e.action === 'Sell' || e.action === 'Transfer out') s = margin ? s - e.shares * f : Math.max(0, s - e.shares * f);
  }
  return s;
}

export function computePortfolio(p: Portfolio, m: MarketView, opts: EngineOptions): EngineResult {
  const base = p.currency;
  const today = opts.today;
  const user = resolveTxns(p, m).filter((e) => e.date <= today);
  const assetSymbols = [...new Set(user.filter((e) => e.symbol !== 'CASH').map((e) => e.symbol))];
  const benchmarks = p.benchmarks?.length ? p.benchmarks : [p.benchmark];

  // ---------- price warnings (trade price outside the day's low/high) ----------
  const warnings: EngineResult['warnings'] = [];
  for (const e of user) {
    if (e.action !== 'Buy' && e.action !== 'Sell') continue;
    if (m.custom.has(e.symbol)) continue;
    const r = m.dayRange(e.symbol, e.date);
    if (!r) continue;
    const f = m.splitFactorAfter(e.symbol, e.date);
    // compared in the instrument's own currency, whatever currency the trade was entered in
    const c = m.currencyOf(e.symbol);
    const px = (e.currency === c ? e.price : (e.price * e.fx) / m.fxAt(c, e.date)) / f;
    const tol = 0.005;
    if (px < r.low * (1 - tol) || px > r.high * (1 + tol)) {
      warnings.push({ id: e.id, date: e.date, symbol: e.symbol, low: r.low * f, high: r.high * f, kind: 'price', message: `The transaction is added, but your trading price is not in low and high range (${+(r.low * f).toFixed(4)} - ${+(r.high * f).toFixed(4)}${e.currency === c ? '' : ` ${c}`}) of the given date.` });
    }
  }

  // ---------- auto dividends (+ withholding tax) ----------
  // A dividend is income on its ex-date (the share price drops by it that morning), so it counts in value and gains
  // from then. Its cash arrives on its payment date: the one the company published (from a connector) or you typed.
  // Until then it is "to be paid". Where no date is published, the date is estimated from the company's usual wait
  // (payLag) and shown as an estimate; it never stays unpaid for ever.
  const autoEntries: LedgerEntry[] = [];
  const dividendEvents: DividendEvent[] = [];
  const firstDate = user.length ? user[0].date : today;
  const taxRate = (p.dividendTaxRate || 0) / 100;
  if (p.autoDividend) {
    for (const sym of assetSymbols) {
      if (m.custom.has(sym)) continue;
      const ccy = m.currencyOf(sym);
      const manual = user.filter((e) => e.symbol === sym && e.action === 'Dividend');
      let lag: number | undefined; // worked out once, for the first dividend without a published date
      for (const [exDate, perShare] of m.dividends(sym)) {
        if (exDate <= firstDate) continue;
        const shares = sharesBefore(user, sym, exDate, m, p.margin);
        if (shares <= 1e-9) continue;
        const typed = p.payDates?.[`${sym}|${exDate}`];
        const rec = m.payoutFor(sym, exDate);
        const known = typed && typed >= exDate ? typed : rec?.payDate ?? null;
        const paySource = typed && typed >= exDate ? 'you' : rec?.payDate ? rec.source : null;
        const payDate = known ?? addDays(exDate, (lag ??= payLag(m, sym)));
        if (manual.some((x) => x.date >= addDays(exDate, -5) && x.date <= addDays(payDate, 20))) continue;
        const ahead = exDate > today;
        const paid = !ahead && payDate <= today;
        // converted on the day it is paid; until then at today's rate
        const fx = m.fxAt(ccy, paid ? payDate : today);
        const amountLocal = perShare * shares;
        const taxBase = amountLocal * fx * taxRate;
        dividendEvents.push({
          symbol: sym, exDate, payDate, payKnown: known != null, paySource, perShare, shares, currency: ccy,
          amountBase: amountLocal * fx, taxBase, status: ahead ? 'confirmed' : paid ? 'received' : 'toBePaid',
        });
        autoEntries.push({
          id: `auto-div-${sym}-${exDate}`, date: exDate, payDate, action: 'Dividend', symbol: sym, price: perShare, currency: ccy, shares,
          commission: 0, commissionBase: 0, amountBase: amountLocal * fx, fx, auto: 'dividend', taxBase, status: ahead ? 'upcoming' : 'confirmed',
        });
        if (taxRate > 0) {
          autoEntries.push({
            id: `auto-tax-${sym}-${exDate}`, date: exDate, payDate, action: 'Taxes', symbol: 'CASH', price: 1, currency: ccy, shares: amountLocal * taxRate,
            commission: 0, commissionBase: 0, amountBase: amountLocal * taxRate * fx, fx, auto: 'tax', status: ahead ? 'upcoming' : 'confirmed',
          });
        }
      }
    }
  }
  for (const e of user.filter((x) => x.action === 'Dividend' && x.symbol !== 'CASH')) {
    // entered by hand: paid on the date you gave, with no automatic withholding
    dividendEvents.push({ symbol: e.symbol, exDate: e.date, payDate: e.date, payKnown: true, paySource: 'you', manual: true, perShare: e.price, shares: e.shares, currency: e.currency, amountBase: e.amountBase, taxBase: 0, status: 'received' });
  }

  // ---------- merge + auto deposits ----------
  const merged = [...user, ...autoEntries.filter((e) => e.status === 'confirmed')].sort(
    (a, b) => a.date.localeCompare(b.date) || (ORDER[a.action] ?? 9) - (ORDER[b.action] ?? 9),
  );
  const ledger: LedgerEntry[] = [];
  let cashRun = 0;
  /** what an entry does to cash, whenever that happens */
  const cashFlowOf = (e: LedgerEntry): number => {
    switch (e.action) {
      case 'Buy': return -(e.amountBase + e.commissionBase);
      case 'Sell': return e.amountBase - e.commissionBase;
      case 'Dividend': return e.amountBase - e.commissionBase;
      default:
        if (INFLOW_CASH.has(e.action)) return e.amountBase - e.commissionBase;
        if (OUTFLOW_CASH.has(e.action)) return -(e.amountBase + e.commissionBase);
        return -e.commissionBase; // transfers / stock dividends only cost commission
    }
  };
  // an automatic dividend (and its withholding) moves cash on its payment date, not on its ex-date
  const deferred = (e: LedgerEntry) => e.payDate !== undefined && e.payDate !== e.date;
  const cashDelta = (e: LedgerEntry): number => (deferred(e) ? 0 : cashFlowOf(e));
  /** cash that arrives on a date: dividends paid then, after withholding */
  const settles = new Map<string, number>();
  for (const e of merged) {
    if (deferred(e) && e.payDate && e.payDate <= today) settles.set(e.payDate, (settles.get(e.payDate) ?? 0) + cashFlowOf(e));
  }
  const settleDays = [...settles.keys()].sort();
  let settled = 0;
  let owed = 0; // to be paid: income booked, cash not arrived yet
  for (let i = 0; i < merged.length; i++) {
    const day = merged[i].date;
    for (; settled < settleDays.length && settleDays[settled] <= day; settled++) {
      cashRun += settles.get(settleDays[settled])!;
      owed -= settles.get(settleDays[settled])!;
    }
    const dayEntries: LedgerEntry[] = [];
    while (i < merged.length && merged[i].date === day) dayEntries.push(merged[i++]);
    i--;
    for (const e of dayEntries) {
      cashRun += cashDelta(e);
      if (deferred(e)) owed += cashFlowOf(e);
      ledger.push(e);
    }
    // money spent that you hadn't recorded depositing: an automatic deposit. Dividends to be paid count as yours here,
    // so one whose payment date isn't published yet never turns into a deposit you didn't make
    if (!p.margin && cashRun + owed < -0.004) {
      const amt = -(cashRun + owed);
      ledger.push({ id: `auto-dep-${day}`, date: day, action: 'Deposit', symbol: 'CASH', price: 1, currency: base, shares: amt, commission: 0, commissionBase: 0, amountBase: amt, fx: 1, auto: 'deposit', status: 'confirmed' });
      cashRun += amt;
    }
  }
  const upcomingEntries = autoEntries.filter((e) => e.status === 'upcoming');

  // ---------- lots, realised gains, fees ----------
  // a lot's price per share in the instrument's own currency, split-adjusted (a trade can be entered in another currency)
  const localPrice = (e: LedgerEntry, f: number) => {
    const c = m.currencyOf(e.symbol);
    return (e.currency === c ? e.price : (e.price * e.fx) / m.fxAt(c, e.date)) / f;
  };
  const lots: Lot[] = [];
  const realizedBySymbol: Record<string, number> = {};
  const feesBySymbol: Record<string, number> = {};
  const dividendsBySymbol: Record<string, number> = {};
  let lotSeq = 0;
  const realize = (sym: string, r: number) => { realizedBySymbol[sym] = (realizedBySymbol[sym] || 0) + r; };
  for (const e of ledger) {
    if (e.symbol === 'CASH') continue;
    const f = m.splitFactorAfter(e.symbol, e.date);
    const sh = e.shares * f;
    feesBySymbol[e.symbol] = (feesBySymbol[e.symbol] || 0) + e.commissionBase;
    // after the automatic withholding tax, which the ledger also books as its own Taxes entry
    if (e.action === 'Dividend') { dividendsBySymbol[e.symbol] = (dividendsBySymbol[e.symbol] || 0) + e.amountBase - (e.taxBase ?? 0); continue; }
    if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') {
      const costBase = e.action === 'Stock dividend' ? 0 : e.amountBase;
      lots.push({ id: `lot${++lotSeq}`, symbol: e.symbol, side: 'long', openDate: e.date, price: localPrice(e, f), currency: m.currencyOf(e.symbol), shares: sh, openShares: sh, costBase, closedShares: 0, realized: 0, closeDate: null, sourceId: e.id });
    } else if (e.action === 'Sell' || e.action === 'Transfer out') {
      let remaining = sh;
      const open = lots.filter((l) => l.symbol === e.symbol && l.openShares > 1e-12);
      const proceedsPerShare = e.amountBase / (sh || 1);
      if (opts.costMethod === 'Average') {
        const totShares = open.reduce((s, l) => s + l.openShares, 0);
        const totCost = open.reduce((s, l) => s + (l.costBase * l.openShares) / l.shares, 0);
        const avg = totShares > 0 ? totCost / totShares : 0;
        const sold = Math.min(remaining, totShares);
        for (const l of open) {
          const take = Math.min(l.openShares, (sold * l.openShares) / totShares);
          const r = take * (proceedsPerShare - avg);
          l.openShares -= take; l.closedShares += take; l.realized += r;
          if (l.openShares <= 1e-9) l.closeDate = e.date;
          realize(e.symbol, r);
        }
        remaining -= sold;
      } else {
        for (const l of open) {
          if (remaining <= 1e-12) break;
          const take = Math.min(l.openShares, remaining);
          const costPart = (l.costBase * take) / l.shares;
          const r = take * proceedsPerShare - costPart;
          l.openShares -= take; l.closedShares += take; l.realized += r;
          if (l.openShares <= 1e-9) l.closeDate = e.date;
          remaining -= take;
          realize(e.symbol, r);
        }
      }
      if (remaining > 1e-9 && p.margin) {
        lots.push({ id: `lot${++lotSeq}`, symbol: e.symbol, side: 'short', openDate: e.date, price: localPrice(e, f), currency: m.currencyOf(e.symbol), shares: -remaining, openShares: -remaining, costBase: -remaining * proceedsPerShare, closedShares: 0, realized: 0, closeDate: null, sourceId: e.id });
      } else if (remaining > 1e-9) {
        // more shares sold than held, without margin: the extra shares had no recorded cost, so all they brought in is
        // gain. The position ends at zero (the daily values do the same) and the sale is listed under warnings.
        realize(e.symbol, remaining * proceedsPerShare);
        const held = (sh - remaining) / f; // in the terms the trade was entered in, before later splits
        warnings.push({ id: e.id, date: e.date, symbol: e.symbol, low: held, high: held, kind: 'oversold', message: `This ${e.action === 'Sell' ? 'sale' : 'transfer'} is of ${+e.shares.toFixed(6)} shares, but you held ${+held.toFixed(6)} then. Add the missing buy or transfer in, or correct the number of shares.` });
      }
    }
  }

  // ---------- daily series ----------
  const inception = ledger.length ? ledger[0].date : null;
  const series: DayPoint[] = [];
  const dateIndex = new Map<string, number>();
  if (inception) {
    const byDate = new Map<string, LedgerEntry[]>();
    for (const e of ledger) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    }
    const shares: Record<string, number> = {};
    const ccyOf: Record<string, string> = {};
    for (const s of assetSymbols) ccyOf[s] = m.currencyOf(s);
    const benchCcy: Record<string, string> = {};
    for (const b of benchmarks) benchCcy[b] = m.currencyOf(b);
    const benchUnits: Record<string, number> = Object.fromEntries(benchmarks.map((b) => [b, 0]));
    const benchStart: Record<string, number> = {};
    const benchStartLocal: Record<string, number> = {};
    let cash = 0;
    let toBePaid = 0;
    let nd = 0;
    let gross = 0;
    let prevValue = 0;
    let idx = 1;
    for (const d of eachDay(inception, today)) {
      let flow = 0;
      const arrives = settles.get(d);
      if (arrives) { cash += arrives; toBePaid -= arrives; }
      for (const e of byDate.get(d) || []) {
        cash += cashDelta(e);
        if (deferred(e)) toBePaid += cashFlowOf(e);
        const f = e.symbol !== 'CASH' ? m.splitFactorAfter(e.symbol, e.date) : 1;
        if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') shares[e.symbol] = (shares[e.symbol] || 0) + e.shares * f;
        if (e.action === 'Sell' || e.action === 'Transfer out') {
          const left = (shares[e.symbol] || 0) - e.shares * f;
          shares[e.symbol] = p.margin ? left : Math.max(0, left); // without margin a position can't go below zero
        }
        if (e.action === 'Deposit') { flow += e.amountBase; gross += e.amountBase; }
        if (e.action === 'Withdraw') flow -= e.amountBase;
        if (e.action === 'Transfer in') { flow += e.amountBase; gross += e.amountBase; }
        if (e.action === 'Transfer out') flow -= e.amountBase;
      }
      nd += flow;
      let hv = 0;
      const isToday = d === today;
      for (const s of assetSymbols) {
        const q = shares[s];
        if (!q) continue;
        // today: the latest price, as the holdings use (an exchange ahead of your time zone may already trade tomorrow)
        const px = isToday ? m.lastPrice(s) : m.priceAt(s, d);
        if (px == null) continue;
        hv += q * px * m.fxAt(ccyOf[s], d);
      }
      const value = cash + hv + toBePaid;
      const denom = prevValue + flow;
      if (series.length === 0) idx = flow > 0 ? value / flow : 1;
      else if (denom > 1e-9) idx = idx * (value / denom);
      const bench: Record<string, number> = {};
      const benchIndex: Record<string, number> = {};
      const benchLocal: Record<string, number> = {};
      for (const b of benchmarks) {
        const px = isToday ? m.lastPrice(b) : m.priceAt(b, d);
        const fx = m.fxAt(benchCcy[b], d);
        const bp = px != null ? px * fx : null;
        if (bp) {
          if (benchStart[b] == null) { benchStart[b] = bp; benchStartLocal[b] = px!; }
          benchLocal[b] = px! / benchStartLocal[b];
          benchUnits[b] += flow / bp;
          bench[b] = benchUnits[b] * bp;
          benchIndex[b] = bp / benchStart[b];
        } else {
          bench[b] = nd;
          benchIndex[b] = 1;
          benchLocal[b] = 1;
        }
      }
      dateIndex.set(d, series.length);
      series.push({ date: d, value, cash, holdingsValue: hv, netDeposits: nd, toBePaid, flow, grossDeposits: gross, twrIndex: idx, gain: value - nd, bench, benchIndex, benchLocal });
      prevValue = value;
    }
  }

  // ---------- holdings ----------
  const last = series[series.length - 1];
  const value = last ? last.value : 0;
  const cash = last ? last.cash : 0;
  const toBePaid = last ? last.toBePaid : 0;
  const holdings: Holding[] = [];
  const closed: string[] = [];
  for (const sym of assetSymbols) {
    const open = lots.filter((l) => l.symbol === sym && Math.abs(l.openShares) > 1e-9);
    const sh = open.reduce((s, l) => s + l.openShares, 0);
    if (Math.abs(sh) < 1e-9) { closed.push(sym); continue; }
    const ccy = m.currencyOf(sym);
    const lastPx = m.lastPrice(sym) ?? 0;
    const fxNow = m.fxAt(ccy, today);
    const bars = m.bars(sym);
    const lastBarDate = bars.dates[bars.dates.length - 1] || today;
    const prevIdx = lastIndexLE(bars.dates, lastBarDate) - 1;
    const prevDate = prevIdx >= 0 ? bars.dates[prevIdx] : lastBarDate;
    const prevClose = prevIdx >= 0 ? bars.close[prevIdx] : lastPx;
    const fxPrev = m.fxAt(ccy, prevDate);
    const costValue = open.reduce((s, l) => s + (l.costBase * l.openShares) / l.shares, 0);
    const localCost = open.reduce((s, l) => s + l.price * l.openShares, 0);
    const mv = sh * lastPx * fxNow;
    // shares held before the last session (positions opened today have no 1D gain from prev close)
    const shPrev = open.filter((l) => l.openDate < lastBarDate).reduce((s, l) => s + l.openShares, 0);
    const prevMv = shPrev * prevClose * fxPrev;
    const todaysBuys = open.filter((l) => l.openDate >= lastBarDate).reduce((s, l) => s + (l.costBase * l.openShares) / l.shares, 0);
    const dayGain = mv - prevMv - todaysBuys;
    const realized = realizedBySymbol[sym] || 0;
    const divs = dividendsBySymbol[sym] || 0;
    const fees = feesBySymbol[sym] || 0;
    const unrealized = mv - costValue;
    const totalGain = unrealized + realized + divs - fees;
    // per-holding money-weighted return
    const flows: Array<[string, number]> = [];
    for (const e of ledger) {
      if (e.symbol !== sym) continue;
      if (e.action === 'Buy' || e.action === 'Transfer in') flows.push([e.date, -(e.amountBase + e.commissionBase)]);
      else if (e.action === 'Sell' || e.action === 'Transfer out') flows.push([e.date, e.amountBase - e.commissionBase]);
      else if (e.action === 'Dividend') flows.push([e.date, e.amountBase - (e.taxBase ?? 0) - e.commissionBase]);
      else if (e.commissionBase) flows.push([e.date, -e.commissionBase]); // a stock dividend's commission
    }
    flows.push([today, mv]);
    const first = flows[0][0];
    const days = Math.max(1, daysBetween(first, today));
    const r = xirr(flows);
    const invested = -flows.filter(([, a]) => a < 0).reduce((s, [, a]) => s + a, 0);
    const totalReturn = r != null ? Math.pow(1 + r, days / 365) - 1 : invested ? totalGain / invested : 0;
    const annualized = Math.pow(1 + totalReturn, 365 / days) - 1;
    const q = m.quote(sym);
    const meta = m.meta(sym);
    const high52 = q?.high52 ?? null;
    holdings.push({
      symbol: sym, name: m.name(sym), currency: ccy, shares: sh, last: lastPx, prevClose, fx: fxNow,
      avgCost: sh ? localCost / sh : 0, costValue, marketValue: mv, allocation: 0, costAllocation: 0,
      dayGain, dayGainPct: prevMv ? dayGain / prevMv : 0, unrealized, unrealizedPct: costValue ? unrealized / costValue : 0,
      realized, dividends: divs, fees, totalGain, totalReturn, annualizedReturn: annualized, firstDate: first,
      high52, low52: q?.low52 ?? null, offHigh52: high52 ? (high52 - lastPx) / high52 : null,
      ...meta, isCustom: m.custom.has(sym),
    });
  }
  const totalCost = holdings.reduce((s, h) => s + h.costValue, 0) + cash + toBePaid;
  for (const h of holdings) {
    h.allocation = value ? h.marketValue / value : 0;
    h.costAllocation = totalCost ? h.costValue / totalCost : 0;
  }
  holdings.sort((a, b) => b.marketValue - a.marketValue);
  const cashRow: Holding = {
    symbol: 'CASH', name: `${base} Cash`, currency: base, shares: cash, last: 1, prevClose: 1, fx: 1, avgCost: 1, costValue: cash, marketValue: cash,
    allocation: value ? cash / value : 0, costAllocation: totalCost ? cash / totalCost : 0, dayGain: 0, dayGainPct: 0, unrealized: 0, unrealizedPct: 0,
    realized: 0, dividends: 0, fees: 0, totalGain: 0, totalReturn: 0, annualizedReturn: 0, firstDate: inception || today, high52: null, low52: null,
    offHigh52: null, sector: 'Cash', industry: 'Cash', country: 'Cash', region: 'Cash', market: 'Cash', assetType: 'Cash', isCash: true,
  };
  const toBePaidRow: Holding | null = toBePaid > 0.005 ? {
    ...cashRow, symbol: 'TO BE PAID', name: 'Dividends to be paid', shares: toBePaid, costValue: toBePaid, marketValue: toBePaid,
    allocation: value ? toBePaid / value : 0, costAllocation: totalCost ? toBePaid / totalCost : 0,
  } : null;

  // ---------- P&L ----------
  const sumAction = (a: string) => ledger.filter((e) => e.action === a).reduce((s, e) => s + e.amountBase, 0);
  const commissions = ledger.reduce((s, e) => s + e.commissionBase, 0);
  const pnl = {
    unrealized: holdings.reduce((s, h) => s + h.unrealized, 0),
    realized: Object.values(realizedBySymbol).reduce((s, x) => s + x, 0),
    dividends: sumAction('Dividend'),
    fees: -(commissions + sumAction('Fees')),
    taxes: -sumAction('Taxes'),
    interests: sumAction('Interest income') - sumAction('Interest expense'),
    others: sumAction('Other income') - sumAction('Other expense'),
  };

  // ---------- upcoming dividends: confirmed + estimated over the next 12 months ----------
  const horizon = addYears(today, 1);
  const upcoming: DividendEvent[] = dividendEvents.filter((d) => d.status === 'confirmed');
  for (const h of holdings) {
    if (h.isCustom) continue;
    const sym = h.symbol;
    const lag = payLag(m, sym);
    const fxNow = m.fxAt(h.currency, today);
    const hist = m.dividends(sym);
    const prof = m.profile(sym);
    const lastAmt = hist.length ? hist[hist.length - 1][1] : 0;
    const known = upcoming.filter((u) => u.symbol === sym);
    // announced by the company (a connector lists it), with its own dates; an amount it doesn't give is the last one paid
    for (const r of m.payoutInfo(sym)?.records ?? []) {
      const amt = r.amount != null && r.amount > 0 ? r.amount : lastAmt;
      if (r.exDate <= today || !(amt > 0) || (r.amount != null && r.currency && r.currency !== h.currency)) continue;
      if (known.some((k) => Math.abs(daysBetween(k.exDate, r.exDate)) <= 3)) continue;
      const amountBase = amt * h.shares * fxNow;
      const ev: DividendEvent = { symbol: sym, exDate: r.exDate, payDate: r.payDate ?? addDays(r.exDate, lag), payKnown: !!r.payDate, paySource: r.payDate ? r.source : null, perShare: amt, shares: h.shares, currency: h.currency, amountBase, taxBase: p.autoDividend ? amountBase * taxRate : 0, status: 'confirmed' };
      upcoming.push(ev);
      known.push(ev);
    }
    if (prof?.exDividendDate && prof.exDividendDate > today && lastAmt > 0 && !known.some((k) => Math.abs(daysBetween(k.exDate, prof.exDividendDate!)) < 20)) {
      const published = prof.dividendDate && prof.dividendDate >= prof.exDividendDate ? prof.dividendDate : null;
      const amountBase = lastAmt * h.shares * fxNow;
      const ev: DividendEvent = { symbol: sym, exDate: prof.exDividendDate, payDate: published ?? addDays(prof.exDividendDate, lag), payKnown: !!published, paySource: published ? 'yahoo' : null, perShare: lastAmt, shares: h.shares, currency: h.currency, amountBase, taxBase: p.autoDividend ? amountBase * taxRate : 0, status: 'confirmed' };
      upcoming.push(ev);
      known.push(ev);
    }
    const lastYear = hist.filter(([d]) => d > addYears(today, -1) && d <= today);
    for (const [exDate, amt] of lastYear) {
      const projEx = addYears(exDate, 1);
      if (projEx <= today) continue;
      if (known.some((k) => Math.abs(daysBetween(k.exDate, projEx)) < 25)) continue;
      const payDate = addDays(projEx, lag);
      if (payDate > horizon) continue;
      const amountBase = amt * h.shares * fxNow;
      upcoming.push({ symbol: sym, exDate: projEx, payDate, payKnown: false, paySource: null, perShare: amt, shares: h.shares, currency: h.currency, amountBase, taxBase: p.autoDividend ? amountBase * taxRate : 0, status: 'estimated' });
    }
  }
  const dividends = [...dividendEvents.filter((d) => d.status === 'received' || d.status === 'toBePaid'), ...upcoming].sort((a, b) => a.payDate.localeCompare(b.payDate));

  // currencies in use without a rate to the base currency (their amounts count 1:1 until one loads)
  const used = new Set<string>([...user.map((e) => e.currency), ...assetSymbols.map((s) => m.currencyOf(s)), ...benchmarks.map((b) => m.currencyOf(b))]);
  const missingFx = [...used].filter((c) => c && !m.hasFx(c)).sort();

  return {
    base, today, inception, userLedger: user, ledger: [...ledger, ...upcomingEntries].sort((a, b) => a.date.localeCompare(b.date)),
    warnings, series, dateIndex, holdings, cashRow, toBePaidRow, closed, lots, dividends, value, cash, toBePaid, netDeposits: last ? last.netDeposits : 0, pnl,
    symbols: assetSymbols, benchmarks, realizedBySymbol, feesBySymbol, dividendsBySymbol, missingFx,
  };
}

export type { Txn };
