// Market data: Yahoo Finance via yahoo-finance2, cached on disk so the app keeps working offline.
import YahooFinanceDefault from 'yahoo-finance2';
import { readJson, writeJson, CACHE_DIR } from './store.mjs';
import path from 'node:path';

const yf = typeof YahooFinanceDefault === 'function'
  ? new YahooFinanceDefault({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
  : YahooFinanceDefault;

const CHART_TTL_MS = 10 * 60 * 1000; // daily history refresh interval
const QUOTE_TTL_MS = 45 * 1000; // live quote refresh interval
const PROFILE_TTL_MS = 3 * 24 * 3600 * 1000;
const HISTORY_YEARS = 6;

let lastOnline = null; // timestamp of last successful upstream call
let lastError = null;

export function marketStatus() {
  return { lastOnline, lastError };
}

const safeName = (s) => s.replace(/[^A-Za-z0-9._=^-]/g, '_');
const isoLocal = (date, gmtoffset = 0) => new Date(date.getTime() + gmtoffset * 1000).toISOString().slice(0, 10);

// small concurrency limiter so we do not hammer Yahoo
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}
const limit = limiter(4);

async function upstream(fn) {
  try {
    const r = await limit(fn);
    lastOnline = Date.now();
    lastError = null;
    return r;
  } catch (e) {
    lastError = String(e?.message || e);
    throw e;
  }
}

// ---------- daily history (bars, dividends, splits) ----------
async function fetchChart(symbol) {
  const period1 = new Date(Date.now() - HISTORY_YEARS * 365 * 24 * 3600 * 1000);
  const res = await upstream(() => yf.chart(symbol, { period1, interval: '1d', events: 'div|split' }, { validateResult: false }));
  const meta = res.meta || {};
  const off = meta.gmtoffset || 0;
  const bars = [];
  for (const q of res.quotes || []) {
    if (q.close == null) continue;
    const d = isoLocal(new Date(q.date), off);
    const row = [d, q.open ?? q.close, q.high ?? q.close, q.low ?? q.close, q.close];
    if (bars.length && bars[bars.length - 1][0] === d) bars[bars.length - 1] = row; else bars.push(row);
  }
  const dividends = (res.events?.dividends || []).map((x) => [isoLocal(new Date(x.date), off), x.amount]).sort((a, b) => a[0].localeCompare(b[0]));
  const splits = (res.events?.splits || []).map((x) => [isoLocal(new Date(x.date), off), x.numerator / x.denominator]).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    symbol,
    currency: meta.currency || null,
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    instrumentType: meta.instrumentType || null,
    name: meta.longName || meta.shortName || null,
    gmtoffset: off,
    timezone: meta.exchangeTimezoneName || null,
    bars,
    dividends,
    splits,
    fetchedAt: Date.now(),
  };
}

export async function getCharts(symbols, { force = false } = {}) {
  const out = {};
  await Promise.all(symbols.map(async (symbol) => {
    const file = path.join(CACHE_DIR, 'chart', safeName(symbol) + '.json');
    const cached = await readJson(file, null);
    const fresh = cached && Date.now() - cached.fetchedAt < CHART_TTL_MS;
    if (cached && fresh && !force) { out[symbol] = cached; return; }
    try {
      const data = await fetchChart(symbol);
      if (!data.bars.length && cached) { out[symbol] = { ...cached, stale: true }; return; }
      await writeJson(file, data);
      out[symbol] = data;
    } catch (e) {
      out[symbol] = cached ? { ...cached, stale: true } : { symbol, error: String(e?.message || e), bars: [], dividends: [], splits: [] };
    }
  }));
  return out;
}

// ---------- live quotes ----------
function mapQuote(q) {
  return {
    symbol: q.symbol,
    price: q.regularMarketPrice ?? null,
    prevClose: q.regularMarketPreviousClose ?? null,
    change: q.regularMarketChange ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    time: q.regularMarketTime ? new Date(q.regularMarketTime).getTime() : null,
    marketState: q.marketState ?? null,
    currency: q.currency ?? null,
    name: q.longName || q.shortName || q.symbol,
    shortName: q.shortName || null,
    quoteType: q.quoteType ?? null,
    exchange: q.fullExchangeName || q.exchange || null,
    high52: q.fiftyTwoWeekHigh ?? null,
    low52: q.fiftyTwoWeekLow ?? null,
    dividendRate: q.trailingAnnualDividendRate ?? null,
    dividendYield: q.trailingAnnualDividendYield ?? null,
  };
}

export async function getQuotes(symbols, { force = false } = {}) {
  const file = path.join(CACHE_DIR, 'quotes.json');
  const cache = await readJson(file, {});
  const now = Date.now();
  const need = symbols.filter((s) => force || !cache[s] || now - cache[s].fetchedAt > QUOTE_TTL_MS);
  let offline = false;
  if (need.length) {
    try {
      const res = await upstream(() => yf.quote(need, { return: 'array' }, { validateResult: false }));
      for (const q of res || []) cache[q.symbol] = { ...mapQuote(q), fetchedAt: now };
      await writeJson(file, cache);
    } catch {
      offline = true;
    }
  }
  const out = {};
  for (const s of symbols) if (cache[s]) out[s] = cache[s];
  return { quotes: out, offline };
}

// ---------- company profile: sector / industry / country / dividend calendar ----------
const toIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function getProfiles(symbols, { force = false } = {}) {
  const out = {};
  await Promise.all(symbols.map(async (symbol) => {
    const file = path.join(CACHE_DIR, 'profile', safeName(symbol) + '.json');
    const cached = await readJson(file, null);
    if (cached && !force && Date.now() - cached.fetchedAt < PROFILE_TTL_MS) { out[symbol] = cached; return; }
    try {
      const s = await upstream(() => yf.quoteSummary(symbol, { modules: ['assetProfile', 'calendarEvents', 'summaryDetail', 'price', 'quoteType'] }, { validateResult: false }));
      const ap = s.assetProfile || {};
      const ce = s.calendarEvents || {};
      const data = {
        symbol,
        name: s.price?.longName || s.price?.shortName || s.quoteType?.longName || symbol,
        quoteType: s.quoteType?.quoteType || s.price?.quoteType || null,
        exchange: s.price?.exchangeName || s.quoteType?.exchange || null,
        currency: s.price?.currency || null,
        sector: ap.sector || null,
        industry: ap.industry || null,
        country: ap.country || null,
        exDividendDate: toIso(ce.exDividendDate || s.summaryDetail?.exDividendDate),
        dividendDate: toIso(ce.dividendDate),
        dividendRate: s.summaryDetail?.dividendRate ?? s.summaryDetail?.trailingAnnualDividendRate ?? null,
        fetchedAt: Date.now(),
      };
      await writeJson(file, data);
      out[symbol] = data;
    } catch (e) {
      out[symbol] = cached ? { ...cached, stale: true } : { symbol, error: String(e?.message || e) };
    }
  }));
  return out;
}

export async function search(q) {
  const res = await upstream(() => yf.search(q, { quotesCount: 12, newsCount: 0 }, { validateResult: false }));
  return (res.quotes || [])
    .filter((x) => x.symbol)
    .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange, type: x.typeDisp || x.quoteType }));
}
