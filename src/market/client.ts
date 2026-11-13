// Market data for the app. Finds a route to Yahoo Finance that works where the app is running, caches results
// in IndexedDB, and serves the cache when offline. Routes, in order:
//   1. host  — window.portfolioHost.fetchJson (a host app's server action; see docs/HOSTING.md)
//   2. proxy — VITE_MARKET_PROXY set at build time (any URL-forwarding endpoint you run yourself)
//   3. local — ./yahoo/q1 and ./yahoo/q2 on the same origin (forwarded by `npm run dev` / `npm start`)
//   4. direct — Yahoo itself (works where the runtime doesn't enforce CORS)
import type { ChartData, PayoutInfo, Profile, Quote } from '../engine/types.ts';
import { host, type MarketCacheEntry } from '../platform/host.ts';
import { kvGet, kvSet } from '../platform/kv.ts';
import { YAHOO_HOSTS, fetchChart, fetchProfile, fetchQuotes, searchSymbols, type GetJson, type SearchHit } from './yahoo.ts';

const CHART_TTL_MS = 10 * 60 * 1000;
const QUOTE_TTL_MS = 45 * 1000;
const PROFILE_TTL_MS = 3 * 24 * 3600 * 1000;

class RouteError extends Error {}

/** Yahoo answers errors (unknown symbol, bad request) with JSON too; anything else means this route doesn't reach Yahoo */
async function readJson(r: Response): Promise<unknown> {
  const type = r.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new RouteError(`HTTP ${r.status} (${type || 'no content type'})`);
  return r.json();
}

interface Route { name: string; get: GetJson }

function routes(): Route[] {
  const out: Route[] = [];
  const h = host();
  if (h?.fetchJson) out.push({ name: 'host', get: async (u) => { try { return await h.fetchJson!(u); } catch (e) { throw new RouteError(String(e)); } } });
  const proxy = (import.meta.env.VITE_MARKET_PROXY as string | undefined)?.trim();
  if (proxy) out.push({ name: 'proxy', get: (u) => fetch(proxy.includes('{url}') ? proxy.replace('{url}', encodeURIComponent(u)) : proxy + encodeURIComponent(u)).then(readJson, (e) => { throw new RouteError(String(e)); }) });
  const local = (u: string) => u.replace(YAHOO_HOSTS[0], './yahoo/q1').replace(YAHOO_HOSTS[1], './yahoo/q2');
  out.push({ name: 'local', get: (u) => fetch(local(u), { credentials: 'omit' }).then(readJson, (e) => { throw new RouteError(String(e)); }) });
  out.push({ name: 'direct', get: (u) => fetch(u, { credentials: 'omit' }).then(readJson, (e) => { throw new RouteError(String(e)); }) });
  return out;
}

let chosen: Route | null = null;
let lastOnline: number | null = null;
let lastError: string | null = null;

// at most 6 requests to Yahoo at a time (what a browser allows per host anyway)
const MAX_ACTIVE = 6;
let active = 0;
const queue: Array<() => void> = [];
function limited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => { active++; fn().then(resolve, reject).finally(() => { active--; queue.shift()?.(); }); };
    if (active < MAX_ACTIVE) start(); else queue.push(start);
  });
}

/** tries each route in order; the first one that returns JSON is remembered for later requests */
async function probe(url: string): Promise<unknown> {
  let err: unknown = new RouteError('no route to Yahoo Finance');
  for (const r of routes()) {
    try {
      const body = await r.get(url);
      chosen = r;
      return body;
    } catch (e) {
      if (!(e instanceof RouteError)) throw e;
      err = e;
    }
  }
  throw err;
}

function once(url: string): Promise<unknown> {
  return limited(async () => {
    try {
      const body = chosen ? await chosen.get(url) : await probe(url);
      lastOnline = Date.now();
      lastError = null;
      return body;
    } catch (e) {
      lastError = String(e instanceof Error ? e.message : e);
      if (e instanceof RouteError) chosen = null; // look for a route again next time (network back, host attached, ...)
      throw e;
    }
  });
}

/**
 * What a request asks for, so the same data asked for twice at once costs one request. Chart URLs carry the
 * current time in their window, so they are keyed by symbol alone; quotes by the symbol list.
 */
export function requestKey(url: string): string {
  try {
    const u = new URL(url);
    const chart = u.pathname.match(/^\/v8\/finance\/chart\/([^/]+)$/);
    if (chart) return `chart:${decodeURIComponent(chart[1])}`;
    if (u.pathname === '/v7/finance/spark') return `spark:${u.searchParams.get('symbols') ?? ''}`;
  } catch { /* not a URL: use it as it is */ }
  return url;
}

/** the key a response is kept under in a host's market cache: chart:SYM, spark:SYM,SYM or search:SYM (profile lookups) */
function cacheKey(url: string): string | null {
  const k = requestKey(url);
  if (k.startsWith('chart:') || k.startsWith('spark:')) return k;
  try {
    const u = new URL(url);
    // company profiles ask for 6 matches; ticker search as you type asks for more and isn't worth keeping
    if (u.pathname === '/v1/finance/search' && u.searchParams.get('quotesCount') === '6') return `search:${u.searchParams.get('q') ?? ''}`;
  } catch { /* ignore */ }
  return null;
}

const RETRY_AFTER_MS = 700;
const inflight = new Map<string, Promise<unknown>>();

/** one request per key at a time; a failure is retried once after a short pause when a route has worked before */
const get: GetJson = (url) => {
  const key = requestKey(url);
  const running = inflight.get(key);
  if (running) return running;
  const p = once(url)
    .catch(async (e) => {
      // a host bridge or a route that has answered before is worth a second try (a busy server, a dropped request);
      // with no route at all, fail fast and show cached prices
      if (!host()?.fetchJson && lastOnline == null) throw e;
      await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
      return once(url);
    })
    .then((body) => { keepForHost(url, body); return body; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export function marketStatus() {
  return { route: chosen?.name ?? null, lastOnline, lastError };
}

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------- the host's market cache (optional) ----------------
// A host that keeps market data between visits (window.portfolioHost.loadMarketCache, e.g. refreshed on a schedule)
// lets the app open on it at once on any device. Fresh quotes and profiles fetched here go back to it.

const SAVE_DELAY_MS = 15_000;
const SAVE_MAX = 60;
const toSave = new Map<string, MarketCacheEntry>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let flushOnHide = false;

function keepForHost(url: string, data: unknown) {
  if (!host()?.saveMarketCache || data == null) return;
  const key = cacheKey(url);
  // charts are large, change slowly and are the host's own scheduled refresh's job
  if (!key || key.startsWith('chart:')) return;
  // keep only real answers, never an error body in place of good data
  const d = data as { spark?: { result?: unknown[] }; quotes?: unknown[] };
  if (key.startsWith('spark:') ? !d.spark?.result?.length : !Array.isArray(d.quotes) || !d.quotes.length) return;
  toSave.set(key, { key, data, fetchedAt: Date.now() });
  if (!flushOnHide && typeof document !== 'undefined') {
    flushOnHide = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushToHost(); });
  }
  if (!saveTimer) saveTimer = setTimeout(() => void flushToHost(), SAVE_DELAY_MS);
}

async function flushToHost() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const h = host();
  if (saving || !toSave.size || !h?.saveMarketCache) return;
  const batch = [...toSave.values()].slice(0, SAVE_MAX);
  for (const e of batch) toSave.delete(e.key);
  saving = true;
  try {
    await h.saveMarketCache(batch);
  } catch {
    // best effort: the host's own refresh keeps its copy current anyway
  } finally {
    saving = false;
    if (toSave.size && !saveTimer) saveTimer = setTimeout(() => void flushToHost(), 1000);
  }
}

/**
 * Puts the host's saved market data into this device's cache wherever it is newer than what is here.
 * Returns how many items it added. Never throws.
 */
export async function seedFromHost(): Promise<number> {
  const h = host();
  if (!h?.loadMarketCache) return 0;
  try {
    // only what is newer than this device's own data (a couple of minutes' margin for clock differences)
    const quotes = (await kvGet<Record<string, Quote>>('quotes')) ?? {};
    const newest = Math.max(0, ...Object.values(quotes).map((q) => q.fetchedAt || 0));
    const raw = await h.loadMarketCache(newest ? newest - 2 * 60_000 : 0);
    const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    return await seedMarketCache(entries);
  } catch (e) {
    console.warn('host market cache unavailable', e);
    return 0;
  }
}

export async function seedMarketCache(entries: MarketCacheEntry[]): Promise<number> {
  let added = 0;
  const quotes = (await kvGet<Record<string, Quote>>('quotes')) ?? {};
  let quotesChanged = false;
  for (const e of entries) {
    if (!e || typeof e.key !== 'string' || e.data == null) continue;
    const at = Number(e.fetchedAt) || 0;
    const serve: GetJson = async () => e.data; // parse the saved response exactly as a live one
    try {
      if (e.key.startsWith('chart:')) {
        const symbol = e.key.slice(6);
        const cur = await kvGet<ChartData>(`chart:${symbol}`);
        if (cur?.bars?.length && (cur.fetchedAt ?? 0) >= at) continue;
        const data = await fetchChart(symbol, serve, at);
        if (!data.bars.length) continue;
        await kvSet(`chart:${symbol}`, plain(data));
        added++;
      } else if (e.key.startsWith('spark:')) {
        const symbols = e.key.slice(6).split(',').filter(Boolean);
        for (const [s, q] of Object.entries(await fetchQuotes(symbols, serve, at))) {
          if (quotes[s] && quotes[s].fetchedAt >= at) continue;
          quotes[s] = q;
          quotesChanged = true;
          added++;
        }
      } else if (e.key.startsWith('payouts:')) {
        const symbol = e.key.slice(8);
        const cur = await kvGet<PayoutInfo>(`payouts:${symbol}`);
        const info = asPayoutInfo(e.data);
        if (!info || (cur && (cur.checkedAt ?? 0) >= info.checkedAt)) continue;
        await kvSet(`payouts:${symbol}`, plain(info));
        added++;
      } else if (e.key.startsWith('search:')) {
        const symbol = e.key.slice(7);
        const cur = await kvGet<Profile & { fetchedAt?: number }>(`profile:${symbol}`);
        if (cur && !cur.error && (cur.fetchedAt ?? 0) >= at) continue;
        await kvSet(`profile:${symbol}`, plain(await fetchProfile(symbol, serve, at)));
        added++;
      }
    } catch {
      // one unreadable entry never stops the rest
    }
  }
  if (quotesChanged) await kvSet('quotes', plain(quotes));
  return added;
}

/** `onEach` is called as each symbol is ready (from the cache or downloaded), for progress on a first open */
export async function getCharts(symbols: string[], { force = false, onEach }: { force?: boolean; onEach?: () => void } = {}): Promise<Record<string, ChartData>> {
  const out: Record<string, ChartData> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const key = `chart:${symbol}`;
    const cached = await kvGet<ChartData>(key);
    try {
      if (cached && !force && Date.now() - (cached.fetchedAt ?? 0) < CHART_TTL_MS) { out[symbol] = cached; return; }
      try {
        const data = await fetchChart(symbol, get);
        if (!data.bars.length && cached) { out[symbol] = { ...cached, stale: true }; return; }
        await kvSet(key, plain(data));
        out[symbol] = data;
      } catch (e) {
        out[symbol] = cached ? { ...cached, stale: true } : { symbol, currency: null, exchange: null, name: null, error: String(e instanceof Error ? e.message : e), bars: [], dividends: [], splits: [] };
      }
    } finally {
      onEach?.();
    }
  }));
  return out;
}

// What this device has cached, however old, without asking the network. The app opens on these at once and
// brings them up to date in the background.
export async function cachedCharts(symbols: string[]): Promise<Record<string, ChartData>> {
  const out: Record<string, ChartData> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const c = await kvGet<ChartData>(`chart:${symbol}`);
    if (c?.bars?.length) out[symbol] = c;
  }));
  return out;
}

export async function cachedQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const cache = (await kvGet<Record<string, Quote>>('quotes')) ?? {};
  const out: Record<string, Quote> = {};
  for (const s of symbols) if (cache[s]) out[s] = cache[s];
  return out;
}

export async function cachedProfiles(symbols: string[]): Promise<Record<string, Profile>> {
  const out: Record<string, Profile> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const p = await kvGet<Profile>(`profile:${symbol}`);
    if (p && !p.error) out[symbol] = p;
  }));
  return out;
}

export async function getQuotes(symbols: string[], { force = false } = {}): Promise<{ quotes: Record<string, Quote>; offline: boolean }> {
  const cache = (await kvGet<Record<string, Quote>>('quotes')) ?? {};
  const now = Date.now();
  const need = symbols.filter((s) => force || !cache[s] || now - cache[s].fetchedAt > QUOTE_TTL_MS);
  let offline = false;
  if (need.length) {
    try {
      Object.assign(cache, await fetchQuotes(need, get, now));
      await kvSet('quotes', plain(cache));
    } catch {
      offline = true;
    }
  }
  const quotes: Record<string, Quote> = {};
  for (const s of symbols) if (cache[s]) quotes[s] = cache[s];
  return { quotes, offline };
}

export async function getProfiles(symbols: string[], { force = false } = {}): Promise<Record<string, Profile>> {
  const out: Record<string, Profile> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const key = `profile:${symbol}`;
    const cached = await kvGet<Profile & { fetchedAt?: number }>(key);
    if (cached && !force && Date.now() - (cached.fetchedAt ?? 0) < PROFILE_TTL_MS) { out[symbol] = cached; return; }
    try {
      const data = await fetchProfile(symbol, get);
      await kvSet(key, plain(data));
      out[symbol] = data;
    } catch (e) {
      out[symbol] = cached ?? { symbol, error: String(e instanceof Error ? e.message : e) };
    }
  }));
  return out;
}

export async function search(q: string): Promise<SearchHit[]> {
  try {
    return await searchSymbols(q, get);
  } catch {
    return [];
  }
}

// ---------------- dividend payment dates ----------------
// From the exchanges' own data, through the host (a Muse space's getPayouts action) or, with `npm run dev` /
// `npm start`, the same connectors behind ./payouts. A static copy with neither has no payment dates: you type them.

const PAYOUT_TTL_MS = 12 * 3600 * 1000;

export interface PayoutAsk { symbol: string; exchange: string | null; currency: string | null; name: string | null }

/** a saved or fetched payout row, checked; null when it isn't one */
function asPayoutInfo(x: unknown): PayoutInfo | null {
  const o = x as Partial<PayoutInfo> | null;
  if (!o || !Array.isArray(o.records)) return null;
  const records = o.records.filter((r) => r && typeof r.exDate === 'string').map((r) => ({
    exDate: r.exDate, payDate: typeof r.payDate === 'string' ? r.payDate : null, recordDate: r.recordDate ?? null,
    amount: typeof r.amount === 'number' ? r.amount : null, currency: r.currency ?? null, source: String(r.source ?? 'unknown'),
  }));
  return { records, source: typeof o.source === 'string' ? o.source : null, checkedAt: Number(o.checkedAt) || 0, ...(o.error ? { error: String(o.error) } : {}) };
}

/** which way payment dates can be looked up from here: the host, this app's own server, or none */
export type PayoutRoute = 'host' | 'local' | null;
let payoutRouteSeen: PayoutRoute | undefined;
export function payoutRoute(): PayoutRoute | undefined {
  return host()?.fetchPayouts ? 'host' : payoutRouteSeen;
}

export async function cachedPayouts(symbols: string[]): Promise<Record<string, PayoutInfo>> {
  const out: Record<string, PayoutInfo> = {};
  await Promise.all(symbols.map(async (s) => {
    const p = asPayoutInfo(await kvGet<PayoutInfo>(`payouts:${s}`));
    if (p) out[s] = p;
  }));
  return out;
}

/**
 * Payment dates for the holdings asked about: from this device's copy while it is younger than 12 hours (unless
 * `force`), else from the host or the local route. Whatever can't be fetched keeps its saved copy.
 */
export async function getPayouts(asks: PayoutAsk[], { force = false } = {}): Promise<Record<string, PayoutInfo>> {
  const out = await cachedPayouts(asks.map((a) => a.symbol));
  const now = Date.now();
  const need = asks.filter((a) => force || !out[a.symbol] || now - out[a.symbol].checkedAt > PAYOUT_TTL_MS);
  if (!need.length) return out;
  let body: unknown = null;
  const h = host();
  try {
    if (h?.fetchPayouts) {
      body = await h.fetchPayouts(need, { force });
    } else if (payoutRouteSeen !== null) {
      const r = await fetch(`./payouts?asks=${encodeURIComponent(JSON.stringify(need))}${force ? '&force=1' : ''}`, { credentials: 'omit' });
      body = (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : null;
      payoutRouteSeen = body && (body as { ok?: boolean }).ok ? 'local' : null;
    }
  } catch (e) {
    if (!h?.fetchPayouts) payoutRouteSeen = null;
    console.warn('payment dates unavailable', e);
  }
  const got = ((body ?? {}) as { payouts?: Record<string, unknown> }).payouts ?? {};
  for (const a of need) {
    const info = asPayoutInfo(got[a.symbol]);
    if (!info) continue;
    out[a.symbol] = info;
    await kvSet(`payouts:${a.symbol}`, plain(info));
  }
  return out;
}
