// Server-side market logic for the Muse space: the yahooGet allow-list, the market-data snapshot and the scheduled
// refresh. Plain TypeScript with no imports, so it runs in any server runtime (Muse's Bun runtime, Node, a worker).
// Storage comes in through the small `SnapshotStore` interface; actions.ts connects it to this space's tables.
//
// Snapshot rows are raw Yahoo responses, keyed exactly as the app asks for them:
//   chart:<SYMBOL>          daily history, dividends and splits (6 years)
//   spark:<SYM,SYM,...>     latest quotes, in the app's chunks of 20
//   search:<SYMBOL>         company profile (name, sector, industry)
// The app reads them through window.portfolioHost.loadMarketCache and parses them like live answers.

export const ALLOWED_PREFIXES = ['https://query1.finance.yahoo.com/', 'https://query2.finance.yahoo.com/'];
const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';
export const SNAPSHOT_PREFIXES = ['chart:', 'spark:', 'search:'];
const HISTORY_YEARS = 6; // same window as the app
const SPARK_BATCH = 20; // Yahoo's limit per quote request, and the app's chunk size
const PARALLEL = 6; // requests at a time
const TIMEOUT_MS = 20_000;
const MAX_SAVE = 60; // entries per saveSnapshotEntries call

export interface SnapshotRow { key: string; data: string; fetchedAt: number }
export interface SnapshotEntry { key: string; data: unknown; fetchedAt: number }

/** where the snapshot lives: in the Muse space, the market_cache table (see actions.ts) */
export interface SnapshotStore {
  /** the saved app state JSON (key "portfolio"), or null */
  readState(): Promise<string | null>;
  /** snapshot rows, optionally only those fetched after `since` (epoch ms) */
  readRows(since?: number): Promise<SnapshotRow[]>;
  /** insert or replace rows by key */
  writeRows(rows: SnapshotRow[]): Promise<void>;
  deleteRows(keys: string[]): Promise<void>;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

// ---------------------------------------------------------------- yahooGet

export function isAllowedUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 4096 && ALLOWED_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * GET a Yahoo Finance URL and return the parsed JSON body, also when the status is not 200 (Yahoo reports errors
 * as JSON and the app handles them). Throws for any other host, a timeout, or a body that isn't JSON.
 */
export async function yahooGet(url: unknown, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<unknown> {
  if (!isAllowedUrl(url)) throw new Error('yahooGet only accepts https://query1.finance.yahoo.com/ or https://query2.finance.yahoo.com/ URLs');
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (portfolio-tracker)', accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`yahooGet: non-JSON body (HTTP ${res.status})`);
  }
}

/** like yahooGet, but null on any failure, so one bad symbol never fails a whole refresh */
async function tryGet(url: string, fetchImpl: FetchLike): Promise<any> {
  try {
    return await yahooGet(url, fetchImpl);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the URLs the app requests (src/market/yahoo.ts)

const enc = encodeURIComponent;
export const chartUrl = (symbol: string, now = Date.now()) => {
  const t = Math.floor(now / 1000);
  return `${Q1}/v8/finance/chart/${enc(symbol)}?period1=${t - HISTORY_YEARS * 365 * 86400}&period2=${t + 86400}&interval=1d&events=div%7Csplit&includeAdjustedClose=false`;
};
export const sparkUrl = (symbols: string[]) => `${Q1}/v7/finance/spark?symbols=${symbols.map(enc).join(',')}&range=1d&interval=1d`;
export const profileUrl = (symbol: string) => `${Q2}/v1/finance/search?q=${enc(symbol)}&quotesCount=6&newsCount=0&listsCount=0&enableFuzzyQuery=false`;

// ---------------------------------------------------------------- which symbols a portfolio needs

const MINOR_UNITS: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ILA: 'ILS', ZAc: 'ZAR' };
export const currencyCode = (c: string | null | undefined) => (!c ? 'USD' : MINOR_UNITS[c] ?? c.toUpperCase());

export interface Needed {
  base: string;
  /** listed instruments held or traded (not CASH, not custom assets) */
  assets: string[];
  benchmarks: string[];
  /** currencies known without looking anything up: transaction and custom-asset currencies */
  currencies: string[];
}

/** the same symbols the app loads, from the saved state (the active portfolio, else the first) */
export function neededSymbols(stateJson: string | null): Needed | null {
  if (!stateJson) return null;
  let state: any;
  try {
    state = JSON.parse(stateJson);
    if (typeof state === 'string') state = JSON.parse(state);
  } catch {
    return null;
  }
  const portfolios: any[] = Array.isArray(state?.portfolios) ? state.portfolios : [];
  const p = portfolios.find((x) => x?.id === state?.activePortfolioId) ?? portfolios[0];
  if (!p) return null;
  const custom = new Set<string>((p.customAssets ?? []).map((c: any) => String(c?.symbol ?? '')));
  const txns: any[] = Array.isArray(p.transactions) ? p.transactions : [];
  const assets = [...new Set(txns.map((t) => String(t?.symbol ?? '').trim().toUpperCase()).filter((s) => s && s !== 'CASH' && !custom.has(s)))];
  const benchmarks = [...new Set([...(Array.isArray(p.benchmarks) ? p.benchmarks : []), p.benchmark].filter((s): s is string => typeof s === 'string' && !!s))];
  const currencies = new Set<string>();
  for (const t of txns) if (t?.currency && t.currency !== 'Market') currencies.add(String(t.currency).toUpperCase());
  for (const c of p.customAssets ?? []) if (c?.currency) currencies.add(String(c.currency).toUpperCase());
  return { base: String(p.currency || 'USD').toUpperCase(), assets, benchmarks, currencies: [...currencies] };
}

// ---------------------------------------------------------------- the scheduled refresh

async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export interface RefreshResult { ok: true; symbols: number; updated: number; failed: number; at: number }

/**
 * Brings the snapshot up to date for the saved portfolio: price history for every asset, benchmark and FX pair,
 * quotes for all of them, and company profiles for the assets. A failed fetch never deletes or overwrites a row,
 * so the last known data is always kept. Never throws for a missing or unreadable portfolio.
 */
export async function refreshMarketCache(store: SnapshotStore, fetchImpl: FetchLike = fetch as unknown as FetchLike, now = Date.now()): Promise<RefreshResult> {
  const need = neededSymbols(await store.readState());
  if (!need) return { ok: true, symbols: 0, updated: 0, failed: 0, at: now };
  const rows: SnapshotRow[] = [];
  let failed = 0;
  const keep = (key: string, body: unknown) => rows.push({ key, data: JSON.stringify(body), fetchedAt: now });

  // 1. price history; each instrument's own currency decides which FX pairs are needed
  const currencies = new Set(need.currencies);
  const charts = async (symbols: string[]) => inChunks(symbols, PARALLEL, async (s) => {
    const body = await tryGet(chartUrl(s, now), fetchImpl);
    const result = body?.chart?.result?.[0];
    if (!result) { failed++; return; }
    keep(`chart:${s}`, body);
    if (result.meta?.currency) currencies.add(currencyCode(result.meta.currency));
  });
  await charts([...need.assets, ...need.benchmarks]);
  currencies.delete(need.base);
  const fx = [...currencies].sort().map((c) => `${c}${need.base}=X`);
  await charts(fx);

  // 2. quotes, chunked exactly as the app asks for them: assets, then benchmarks, then FX
  const all = [...need.assets, ...need.benchmarks, ...fx];
  const sparkKeys: string[] = [];
  let sparkOk = true;
  for (let i = 0; i < all.length; i += SPARK_BATCH) {
    const chunk = all.slice(i, i + SPARK_BATCH);
    const key = `spark:${chunk.join(',')}`;
    sparkKeys.push(key);
    const body = await tryGet(sparkUrl(chunk), fetchImpl);
    if (body?.spark?.result?.length) keep(key, body);
    else { failed++; sparkOk = false; }
  }

  // 3. company profiles for the assets
  await inChunks(need.assets, PARALLEL, async (s) => {
    const body = await tryGet(profileUrl(s), fetchImpl);
    if (Array.isArray(body?.quotes)) keep(`search:${s}`, body);
    else failed++;
  });

  if (rows.length) await store.writeRows(rows);
  // quote chunks from an older symbol list are replaced by this run's, once all of this run's arrived
  if (sparkOk) {
    const current = new Set(sparkKeys);
    const stale = (await store.readRows()).map((r) => r.key).filter((k) => k.startsWith('spark:') && !current.has(k));
    if (stale.length) await store.deleteRows(stale);
  }
  return { ok: true, symbols: need.assets.length + need.benchmarks.length + fx.length, updated: rows.length, failed, at: now };
}

// ---------------------------------------------------------------- read and save the snapshot

/** every snapshot row (or those fetched after `since`), parsed; unreadable rows are skipped */
export async function getSnapshot(store: SnapshotStore, since = 0): Promise<{ entries: SnapshotEntry[]; updatedAt: number | null }> {
  const entries: SnapshotEntry[] = [];
  let updatedAt: number | null = null;
  for (const r of await store.readRows(since > 0 ? since : undefined)) {
    if (!SNAPSHOT_PREFIXES.some((p) => r.key.startsWith(p))) continue;
    try {
      entries.push({ key: r.key, data: JSON.parse(r.data), fetchedAt: r.fetchedAt });
      updatedAt = Math.max(updatedAt ?? 0, r.fetchedAt);
    } catch { /* skip */ }
  }
  return { entries, updatedAt };
}

/** responses the open app fetched live, written back so the next open (on any device) starts from them */
export async function saveSnapshotEntries(store: SnapshotStore, entries: unknown): Promise<{ ok: true; saved: number }> {
  const rows: SnapshotRow[] = [];
  for (const e of Array.isArray(entries) ? entries.slice(0, MAX_SAVE) : []) {
    const key = (e as SnapshotEntry)?.key;
    const data = (e as SnapshotEntry)?.data;
    const at = Number((e as SnapshotEntry)?.fetchedAt);
    if (typeof key !== 'string' || key.length > 600 || !SNAPSHOT_PREFIXES.some((p) => key.startsWith(p)) || data == null) continue;
    rows.push({ key, data: JSON.stringify(data), fetchedAt: Number.isFinite(at) && at > 0 ? Math.min(at, Date.now()) : Date.now() });
  }
  if (rows.length) await store.writeRows(rows);
  return { ok: true, saved: rows.length };
}
