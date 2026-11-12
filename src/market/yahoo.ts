// Yahoo Finance over plain HTTP: public endpoints that need no API key, cookie or login, and no Node APIs.
// Every function takes `get` (URL in, parsed JSON out), so the same code runs in a browser, behind the dev proxy,
// or inside a host app's server action. src/market/client.ts decides which route `get` takes.
import type { ChartData, Profile, Quote } from '../engine/types.ts';

export type GetJson = (url: string) => Promise<any>;

export const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'] as const;
const [Q1, Q2] = YAHOO_HOSTS;
/** years of daily history loaded per symbol */
export const HISTORY_YEARS = 6;
/** Yahoo's batch quote endpoint takes at most 20 symbols per request */
const SPARK_BATCH = 20;

const enc = encodeURIComponent;
/** exchange-local calendar date of a Unix timestamp */
const isoLocal = (sec: number, gmtoffset = 0) => new Date((sec + gmtoffset) * 1000).toISOString().slice(0, 10);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** daily bars, dividends and splits */
export async function fetchChart(symbol: string, get: GetJson, now = Date.now()): Promise<ChartData> {
  const t = Math.floor(now / 1000);
  const url = `${Q1}/v8/finance/chart/${enc(symbol)}?period1=${t - HISTORY_YEARS * 365 * 86400}&period2=${t + 86400}&interval=1d&events=div%7Csplit&includeAdjustedClose=false`;
  const j = await get(url);
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error(j?.chart?.error?.description || `No price history for ${symbol}`);
  const meta = res.meta ?? {};
  const off = finite(meta.gmtoffset) ? meta.gmtoffset : 0;
  const ts: number[] = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars: ChartData['bars'] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (!finite(c)) continue;
    const d = isoLocal(ts[i], off);
    const row: ChartData['bars'][number] = [d, finite(q.open?.[i]) ? q.open[i] : c, finite(q.high?.[i]) ? q.high[i] : c, finite(q.low?.[i]) ? q.low[i] : c, c];
    if (bars.length && bars[bars.length - 1][0] === d) bars[bars.length - 1] = row; else bars.push(row);
  }
  const byDate = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]);
  const dividends = Object.values<any>(res.events?.dividends ?? {})
    .filter((x) => finite(x?.date) && finite(x?.amount))
    .map((x): [string, number] => [isoLocal(x.date, off), x.amount]).sort(byDate);
  const splits = Object.values<any>(res.events?.splits ?? {})
    .filter((x) => finite(x?.date) && finite(x?.numerator) && finite(x?.denominator) && x.denominator)
    .map((x): [string, number] => [isoLocal(x.date, off), x.numerator / x.denominator]).sort(byDate);
  return {
    symbol,
    currency: meta.currency ?? null,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    instrumentType: meta.instrumentType ?? null,
    name: meta.longName ?? meta.shortName ?? null,
    bars,
    dividends,
    splits,
    fetchedAt: now,
  };
}

/** latest price, previous close and day change for many symbols at once */
export async function fetchQuotes(symbols: string[], get: GetJson, now = Date.now()): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  for (let i = 0; i < symbols.length; i += SPARK_BATCH) {
    const chunk = symbols.slice(i, i + SPARK_BATCH);
    const j = await get(`${Q1}/v7/finance/spark?symbols=${chunk.map(enc).join(',')}&range=1d&interval=1d`);
    for (const r of j?.spark?.result ?? []) {
      const m = r?.response?.[0]?.meta;
      if (!r?.symbol || !m || !finite(m.regularMarketPrice)) continue;
      const price: number = m.regularMarketPrice;
      const prev: number | null = finite(m.chartPreviousClose) ? m.chartPreviousClose : finite(m.previousClose) ? m.previousClose : null;
      out[r.symbol] = {
        symbol: r.symbol,
        price,
        prevClose: prev,
        change: prev != null ? price - prev : null,
        changePct: finite(m.regularMarketChangePercent) ? m.regularMarketChangePercent : prev ? (price / prev - 1) * 100 : null,
        time: finite(m.regularMarketTime) ? m.regularMarketTime * 1000 : null,
        marketState: null,
        currency: m.currency ?? null,
        name: m.longName || m.shortName || r.symbol,
        shortName: m.shortName ?? null,
        quoteType: m.instrumentType ?? null,
        exchange: m.fullExchangeName ?? m.exchangeName ?? null,
        high52: finite(m.fiftyTwoWeekHigh) ? m.fiftyTwoWeekHigh : null,
        low52: finite(m.fiftyTwoWeekLow) ? m.fiftyTwoWeekLow : null,
        dividendRate: null,
        dividendYield: null,
        fetchedAt: now,
      };
    }
  }
  return out;
}

export interface SearchHit { symbol: string; name: string; exchange: string; type: string }

/** ticker search */
export async function searchSymbols(q: string, get: GetJson): Promise<SearchHit[]> {
  const j = await get(`${Q2}/v1/finance/search?q=${enc(q)}&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=false`);
  return (j?.quotes ?? [])
    .filter((x: any) => x?.symbol)
    .map((x: any) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange || '', type: x.typeDisp || x.quoteType || '' }));
}

/** name, asset type, sector and industry (country comes from the exchange suffix in the engine) */
export async function fetchProfile(symbol: string, get: GetJson, now = Date.now()): Promise<Profile & { fetchedAt: number }> {
  const j = await get(`${Q2}/v1/finance/search?q=${enc(symbol)}&quotesCount=6&newsCount=0&listsCount=0&enableFuzzyQuery=false`);
  const hit = (j?.quotes ?? []).find((x: any) => String(x?.symbol ?? '').toUpperCase() === symbol.toUpperCase());
  if (!hit) throw new Error(`No profile for ${symbol}`);
  return {
    symbol,
    name: hit.longname || hit.shortname || undefined,
    quoteType: hit.quoteType ?? null,
    exchange: hit.exchDisp ?? hit.exchange ?? null,
    sector: hit.sectorDisp || hit.sector || null,
    industry: hit.industryDisp || hit.industry || null,
    country: null,
    exDividendDate: null,
    dividendDate: null,
    dividendRate: null,
    fetchedAt: now,
  };
}
