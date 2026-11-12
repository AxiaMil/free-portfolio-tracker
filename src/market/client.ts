// Market data for the app. Finds a route to Yahoo Finance that works where the app is running, caches results
// in IndexedDB, and serves the cache when offline. Routes, in order:
//   1. host  — window.portfolioHost.fetchJson (a host app's server action; see docs/HOSTING.md)
//   2. proxy — VITE_MARKET_PROXY set at build time (any URL-forwarding endpoint you run yourself)
//   3. local — ./yahoo/q1 and ./yahoo/q2 on the same origin (forwarded by `npm run dev` / `npm start`)
//   4. direct — Yahoo itself (works where the runtime doesn't enforce CORS)
import type { ChartData, Profile, Quote } from '../engine/types.ts';
import { host } from '../platform/host.ts';
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

// at most 4 requests to Yahoo at a time
let active = 0;
const queue: Array<() => void> = [];
function limited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => { active++; fn().then(resolve, reject).finally(() => { active--; queue.shift()?.(); }); };
    if (active < 4) start(); else queue.push(start);
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

const get: GetJson = (url) => limited(async () => {
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

export function marketStatus() {
  return { route: chosen?.name ?? null, lastOnline, lastError };
}

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export async function getCharts(symbols: string[], { force = false } = {}): Promise<Record<string, ChartData>> {
  const out: Record<string, ChartData> = {};
  await Promise.all(symbols.map(async (symbol) => {
    const key = `chart:${symbol}`;
    const cached = await kvGet<ChartData>(key);
    if (cached && !force && Date.now() - (cached.fetchedAt ?? 0) < CHART_TTL_MS) { out[symbol] = cached; return; }
    try {
      const data = await fetchChart(symbol, get);
      if (!data.bars.length && cached) { out[symbol] = { ...cached, stale: true }; return; }
      await kvSet(key, plain(data));
      out[symbol] = data;
    } catch (e) {
      out[symbol] = cached ? { ...cached, stale: true } : { symbol, currency: null, exchange: null, name: null, error: String(e instanceof Error ? e.message : e), bars: [], dividends: [], splits: [] };
    }
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
