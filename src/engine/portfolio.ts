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
  warnings: Array<{ id: string; date: string; symbol: string; message: string; low: number; high: number }>;
  series: DayPoint[];
  dateIndex: Map<string, number>;
  holdings: Holding[]; // open positions, sorted by market value desc
  cashRow: Holding;
  closed: string[];
  lots: Lot[];
  dividends: DividendEvent[];
  value: number;
  cash: number;
  netDeposits: number;
  pnl: { unrealized: number; realized: number; dividends: number; fees: number; taxes: number; interests: number; others: number };
  symbols: string[];
  benchmarks: string[];
  realizedBySymbol: Record<string, number>;
  feesBySymbol: Record<string, number>;
  dividendsBySymbol: Record<string, number>;
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

function payLag(m: MarketView, symbol: string): number {
  const p = m.profile(symbol);
  if (p?.exDividendDate && p?.dividendDate) {
    const lag = daysBetween(p.exDividendDate, p.dividendDate);
    if (lag >= 0 && lag <= 120) return lag;
  }
  return 0;
}

/** shares held (split-adjusted) strictly before `date` */
function sharesBefore(entries: LedgerEntry[], symbol: string, date: string, m: MarketView): number {
  let s = 0;
  for (const e of entries) {
    if (e.symbol !== symbol || e.date >= date) continue;
    const f = m.splitFactorAfter(symbol, e.date);
    if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') s += e.shares * f;
    else if (e.action === 'Sell' || e.action === 'Transfer out') s -= e.shares * f;
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
    const px = e.price / f;
    const tol = 0.005;
    if (px < r.low * (1 - tol) || px > r.high * (1 + tol)) {
      warnings.push({ id: e.id, date: e.date, symbol: e.symbol, low: r.low * f, high: r.high * f, message: `The transaction is added, but your trading price is not in low and high range (${+(r.low * f).toFixed(2)} - ${+(r.high * f).toFixed(2)}) of the given date.` });
    }
  }

  // ---------- auto dividends (+ withholding tax) ----------
  const autoEntries: LedgerEntry[] = [];
  const dividendEvents: DividendEvent[] = [];
  const firstDate = user.length ? user[0].date : today;
  if (p.autoDividend) {
    for (const sym of assetSymbols) {
      if (m.custom.has(sym)) continue;
      const lag = payLag(m, sym);
      const ccy = m.currencyOf(sym);
      const manual = user.filter((e) => e.symbol === sym && e.action === 'Dividend');
      for (const [exDate, perShare] of m.dividends(sym)) {
        if (exDate <= firstDate) continue;
        const shares = sharesBefore(user, sym, exDate, m);
        if (shares <= 1e-9) continue;
        const payDate = addDays(exDate, lag);
        if (manual.some((x) => x.date >= addDays(exDate, -5) && x.date <= addDays(payDate, 20))) continue;
        const received = payDate <= today;
        const fx = m.fxAt(ccy, received ? payDate : today);
        const amountLocal = perShare * shares;
        dividendEvents.push({ symbol: sym, exDate, payDate, perShare, shares, currency: ccy, amountBase: amountLocal * fx, status: received ? 'received' : 'confirmed' });
        const entry: LedgerEntry = {
          id: `auto-div-${sym}-${exDate}`, date: payDate, action: 'Dividend', symbol: sym, price: perShare, currency: ccy, shares,
          commission: 0, commissionBase: 0, amountBase: amountLocal * fx, fx, auto: 'dividend', status: received ? 'confirmed' : 'upcoming',
        };
        autoEntries.push(entry);
        const rate = (p.dividendTaxRate || 0) / 100;
        if (rate > 0) {
          autoEntries.push({
            id: `auto-tax-${sym}-${exDate}`, date: payDate, action: 'Taxes', symbol: 'CASH', price: 1, currency: ccy, shares: amountLocal * rate,
            commission: 0, commissionBase: 0, amountBase: amountLocal * rate * fx, fx, auto: 'tax', status: received ? 'confirmed' : 'upcoming',
          });
        }
      }
    }
  }
  for (const e of user.filter((x) => x.action === 'Dividend' && x.symbol !== 'CASH')) {
    dividendEvents.push({ symbol: e.symbol, exDate: e.date, payDate: e.date, perShare: e.price, shares: e.shares, currency: e.currency, amountBase: e.amountBase, status: 'received' });
  }

  // ---------- merge + auto deposits ----------
  const merged = [...user, ...autoEntries.filter((e) => e.status === 'confirmed')].sort(
    (a, b) => a.date.localeCompare(b.date) || (ORDER[a.action] ?? 9) - (ORDER[b.action] ?? 9),
  );
  const ledger: LedgerEntry[] = [];
  let cashRun = 0;
  const cashDelta = (e: LedgerEntry): number => {
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
  for (let i = 0; i < merged.length; i++) {
    const day = merged[i].date;
    const dayEntries: LedgerEntry[] = [];
    while (i < merged.length && merged[i].date === day) dayEntries.push(merged[i++]);
    i--;
    for (const e of dayEntries) {
      cashRun += cashDelta(e);
      ledger.push(e);
    }
    if (!p.margin && cashRun < -0.004) {
      const amt = -cashRun;
      ledger.push({ id: `auto-dep-${day}`, date: day, action: 'Deposit', symbol: 'CASH', price: 1, currency: base, shares: amt, commission: 0, commissionBase: 0, amountBase: amt, fx: 1, auto: 'deposit', status: 'confirmed' });
      cashRun = 0;
    }
  }
  const upcomingEntries = autoEntries.filter((e) => e.status === 'upcoming');

  // ---------- lots, realised gains, fees ----------
  const lots: Lot[] = [];
  const realizedBySymbol: Record<string, number> = {};
  const feesBySymbol: Record<string, number> = {};
  const dividendsBySymbol: Record<string, number> = {};
  let lotSeq = 0;
  for (const e of ledger) {
    if (e.symbol === 'CASH') continue;
    const f = m.splitFactorAfter(e.symbol, e.date);
    const sh = e.shares * f;
    if (e.action === 'Dividend') { dividendsBySymbol[e.symbol] = (dividendsBySymbol[e.symbol] || 0) + e.amountBase; continue; }
    feesBySymbol[e.symbol] = (feesBySymbol[e.symbol] || 0) + e.commissionBase;
    if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') {
      const costBase = e.action === 'Stock dividend' ? 0 : e.amountBase;
      lots.push({ id: `lot${++lotSeq}`, symbol: e.symbol, side: 'long', openDate: e.date, price: e.price / f, currency: e.currency, shares: sh, openShares: sh, costBase, closedShares: 0, realized: 0, closeDate: null, sourceId: e.id });
      if (opts.costMethod === 'Average') {
        // pool all open lots of the symbol at their average cost (keeps lot list for trade analysis dates)
      }
    } else if (e.action === 'Sell' || e.action === 'Transfer out') {
      let remaining = sh;
      const open = lots.filter((l) => l.symbol === e.symbol && l.openShares > 1e-12);
      const proceedsPerShare = e.amountBase / (sh || 1);
      if (opts.costMethod === 'Average') {
        const totShares = open.reduce((s, l) => s + l.openShares, 0) || 1;
        const totCost = open.reduce((s, l) => s + (l.costBase * l.openShares) / l.shares, 0);
        const avg = totCost / totShares;
        for (const l of open) {
          const take = Math.min(l.openShares, (remaining * l.openShares) / totShares);
          const r = take * (proceedsPerShare - avg);
          l.openShares -= take; l.closedShares += take; l.realized += r;
          if (l.openShares <= 1e-9) l.closeDate = e.date;
          realizedBySymbol[e.symbol] = (realizedBySymbol[e.symbol] || 0) + (e.action === 'Sell' ? r : 0);
        }
        remaining = 0;
      } else {
        for (const l of open) {
          if (remaining <= 1e-12) break;
          const take = Math.min(l.openShares, remaining);
          const costPart = (l.costBase * take) / l.shares;
          const r = take * proceedsPerShare - costPart;
          l.openShares -= take; l.closedShares += take; l.realized += r;
          if (l.openShares <= 1e-9) l.closeDate = e.date;
          remaining -= take;
          realizedBySymbol[e.symbol] = (realizedBySymbol[e.symbol] || 0) + (e.action === 'Sell' ? r : 0);
        }
      }
      if (remaining > 1e-9 && p.margin) {
        lots.push({ id: `lot${++lotSeq}`, symbol: e.symbol, side: 'short', openDate: e.date, price: e.price / f, currency: e.currency, shares: -remaining, openShares: -remaining, costBase: -remaining * proceedsPerShare, closedShares: 0, realized: 0, closeDate: null, sourceId: e.id });
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
    let nd = 0;
    let gross = 0;
    let prevValue = 0;
    let idx = 1;
    for (const d of eachDay(inception, today)) {
      let flow = 0;
      for (const e of byDate.get(d) || []) {
        cash += cashDelta(e);
        const f = e.symbol !== 'CASH' ? m.splitFactorAfter(e.symbol, e.date) : 1;
        if (e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend') shares[e.symbol] = (shares[e.symbol] || 0) + e.shares * f;
        if (e.action === 'Sell' || e.action === 'Transfer out') shares[e.symbol] = (shares[e.symbol] || 0) - e.shares * f;
        if (e.action === 'Deposit') { flow += e.amountBase; gross += e.amountBase; }
        if (e.action === 'Withdraw') flow -= e.amountBase;
        if (e.action === 'Transfer in') { flow += e.amountBase; gross += e.amountBase; }
        if (e.action === 'Transfer out') flow -= e.amountBase;
      }
      nd += flow;
      let hv = 0;
      for (const s of assetSymbols) {
        const q = shares[s];
        if (!q) continue;
        const px = m.priceAt(s, d);
        if (px == null) continue;
        hv += q * px * m.fxAt(ccyOf[s], d);
      }
      const value = cash + hv;
      const denom = prevValue + flow;
      if (series.length === 0) idx = flow > 0 ? value / flow : 1;
      else if (denom > 1e-9) idx = idx * (value / denom);
      const bench: Record<string, number> = {};
      const benchIndex: Record<string, number> = {};
      const benchLocal: Record<string, number> = {};
      for (const b of benchmarks) {
        const px = m.priceAt(b, d);
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
      series.push({ date: d, value, cash, holdingsValue: hv, netDeposits: nd, flow, grossDeposits: gross, twrIndex: idx, gain: value - nd, bench, benchIndex, benchLocal });
      prevValue = value;
    }
  }

  // ---------- holdings ----------
  const last = series[series.length - 1];
  const value = last ? last.value : 0;
  const cash = last ? last.cash : 0;
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
      else if (e.action === 'Dividend') flows.push([e.date, e.amountBase]);
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
  const totalCost = holdings.reduce((s, h) => s + h.costValue, 0) + cash;
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
    if (prof?.exDividendDate && prof.exDividendDate > today && lastAmt > 0 && !known.some((k) => Math.abs(daysBetween(k.exDate, prof.exDividendDate!)) < 20)) {
      const payDate = prof.dividendDate && prof.dividendDate >= prof.exDividendDate ? prof.dividendDate : addDays(prof.exDividendDate, lag);
      const ev: DividendEvent = { symbol: sym, exDate: prof.exDividendDate, payDate, perShare: lastAmt, shares: h.shares, currency: h.currency, amountBase: lastAmt * h.shares * fxNow, status: 'confirmed' };
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
      upcoming.push({ symbol: sym, exDate: projEx, payDate, perShare: amt, shares: h.shares, currency: h.currency, amountBase: amt * h.shares * fxNow, status: 'estimated' });
    }
  }
  const dividends = [...dividendEvents.filter((d) => d.status === 'received'), ...upcoming].sort((a, b) => a.payDate.localeCompare(b.payDate));

  return {
    base, today, inception, userLedger: user, ledger: [...ledger, ...upcomingEntries].sort((a, b) => a.date.localeCompare(b.date)),
    warnings, series, dateIndex, holdings, cashRow, closed, lots, dividends, value, cash, netDeposits: last ? last.netDeposits : 0, pnl,
    symbols: assetSymbols, benchmarks, realizedBySymbol, feesBySymbol, dividendsBySymbol,
  };
}

export type { Txn };
