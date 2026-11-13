// Server-side market logic for the Muse space: the yahooGet allow-list, the market-data snapshot and the scheduled
// refresh. Plain TypeScript with no code imports, so it runs in any server runtime (Muse's Bun runtime, Node, a
// worker). Storage comes in through the small `SnapshotStore` interface and the dividend-date connectors through
// `PayoutKit`; actions.ts connects both.
//
// Snapshot rows are raw Yahoo responses, keyed exactly as the app asks for them:
//   chart:<SYMBOL>          daily history, dividends and splits (6 years)
//   spark:<SYM,SYM,...>     latest quotes, in the app's chunks of 20
//   search:<SYMBOL>         company profile (name, sector, industry)
// and, from the exchanges' own data (payouts.ts):
//   payouts:<SYMBOL>        each dividend's ex-date and payment date: { records, source, checkedAt, error? }
// The app reads them through window.portfolioHost.loadMarketCache and parses them like live answers.
import type { CustomPayouts, PayoutAsk, PayoutRecord, PayoutResult } from './payouts';

export const ALLOWED_PREFIXES = ['https://query1.finance.yahoo.com/', 'https://query2.finance.yahoo.com/'];
const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';
export const SNAPSHOT_PREFIXES = ['chart:', 'spark:', 'search:', 'payouts:'];
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

/** payouts.ts's connectors and the space's own (custom-payouts.ts), handed in by actions.ts */
export interface PayoutKit {
  fetchPayouts: (a: PayoutAsk, fetchImpl: FetchLike, custom?: CustomPayouts) => Promise<PayoutResult>;
  mergePayouts: (before: PayoutRecord[], fresh: PayoutRecord[]) => PayoutRecord[];
  custom?: CustomPayouts;
}

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

export interface RefreshResult { ok: true; symbols: number; updated: number; failed: number; payouts: number; at: number }

/**
 * Brings the snapshot up to date for the saved portfolio: price history for every asset, benchmark and FX pair,
 * quotes for all of them, and company profiles for the assets. A failed fetch never deletes or overwrites a row,
 * so the last known data is always kept. Never throws for a missing or unreadable portfolio.
 */
export async function refreshMarketCache(store: SnapshotStore, fetchImpl: FetchLike = fetch as unknown as FetchLike, now = Date.now(), kit?: PayoutKit): Promise<RefreshResult> {
  const need = neededSymbols(await store.readState());
  if (!need) return { ok: true, symbols: 0, updated: 0, failed: 0, payouts: 0, at: now };
  const rows: SnapshotRow[] = [];
  let failed = 0;
  const keep = (key: string, body: unknown) => rows.push({ key, data: JSON.stringify(body), fetchedAt: now });

  // 1. price history; each instrument's own currency decides which FX pairs are needed
  const currencies = new Set(need.currencies);
  const payers: PayoutAsk[] = [];
  const assetSet = new Set(need.assets);
  const charts = async (symbols: string[]) => inChunks(symbols, PARALLEL, async (s) => {
    const body = await tryGet(chartUrl(s, now), fetchImpl);
    const result = body?.chart?.result?.[0];
    if (!result) { failed++; return; }
    keep(`chart:${s}`, body);
    if (result.meta?.currency) currencies.add(currencyCode(result.meta.currency));
    // holdings that have paid a dividend get their payment dates looked up (step 4)
    if (assetSet.has(s) && result.events?.dividends && Object.keys(result.events.dividends).length) {
      payers.push({ symbol: s, exchange: result.meta?.exchangeName ?? null, currency: result.meta?.currency ?? null, name: result.meta?.longName ?? result.meta?.shortName ?? null });
    }
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

  // 4. payment dates from the exchanges, at most once a day per holding (payouts.ts)
  const payouts = kit ? await updatePayouts(store, payers, kit, { now, fetchImpl }) : { checked: 0 };

  // quote chunks from an older symbol list are replaced by this run's, once all of this run's arrived
  if (sparkOk) {
    const current = new Set(sparkKeys);
    const stale = (await store.readRows()).map((r) => r.key).filter((k) => k.startsWith('spark:') && !current.has(k));
    if (stale.length) await store.deleteRows(stale);
  }
  return { ok: true, symbols: need.assets.length + need.benchmarks.length + fx.length, updated: rows.length, failed, payouts: payouts.checked, at: now };
}

// ---------------------------------------------------------------- dividend payment dates

/** a holding's known payouts, as saved under payouts:<SYMBOL> */
export interface PayoutRow {
  records: PayoutRecord[];
  /** the connector that answered last, or null when none covers the holding */
  source: string | null;
  checkedAt: number;
  error?: string;
}

/** each holding is looked up at most this often by the scheduled refresh: companies announce dates days ahead */
export const PAYOUT_TTL_MS = 20 * 3600_000;
/** "Check now" in the app asks again at most this often */
const PAYOUT_FORCE_GAP_MS = 60_000;

async function payoutRows(store: SnapshotStore): Promise<Map<string, PayoutRow>> {
  const out = new Map<string, PayoutRow>();
  for (const r of await store.readRows()) {
    if (!r.key.startsWith('payouts:')) continue;
    try { out.set(r.key.slice(8), JSON.parse(r.data)); } catch { /* skip */ }
  }
  return out;
}

/**
 * Looks up payment dates for `asks` whose saved row is older than PAYOUT_TTL_MS (or, with `force`, a minute),
 * merges them into what was saved (a failed look-up never deletes a date) and saves them. Returns every asked
 * holding's row and how many were looked up now. Never throws for a failed look-up.
 */
export async function updatePayouts(store: SnapshotStore, asks: PayoutAsk[], kit: PayoutKit, opts: { force?: boolean; now?: number; fetchImpl?: FetchLike } = {}): Promise<{ rows: Record<string, PayoutRow>; checked: number }> {
  const now = opts.now ?? Date.now();
  const known = await payoutRows(store);
  const out: Record<string, PayoutRow> = {};
  const save: SnapshotRow[] = [];
  await inChunks(asks, 3, async (a) => {
    const prev = known.get(a.symbol);
    const age = prev ? now - prev.checkedAt : Infinity;
    if (prev && (opts.force ? age < PAYOUT_FORCE_GAP_MS : age < PAYOUT_TTL_MS)) { out[a.symbol] = prev; return; }
    const r = await kit.fetchPayouts(a, (opts.fetchImpl ?? (fetch as unknown as FetchLike)), kit.custom);
    const row: PayoutRow = {
      records: kit.mergePayouts(prev?.records ?? [], r.records),
      source: r.source ?? (r.error ? prev?.source ?? null : null),
      checkedAt: now,
      ...(r.error ? { error: r.error } : {}),
    };
    out[a.symbol] = row;
    save.push({ key: `payouts:${a.symbol}`, data: JSON.stringify(row), fetchedAt: now });
  });
  if (save.length) await store.writeRows(save);
  return { rows: out, checked: save.length };
}

/** the getPayouts action: the app's "Check now", and its first look at a holding the scheduled refresh hasn't reached */
export async function getPayouts(store: SnapshotStore, input: unknown, kit: PayoutKit, fetchImpl: FetchLike = fetch as unknown as FetchLike) {
  const i = (input ?? {}) as { asks?: unknown; force?: unknown };
  const asks: PayoutAsk[] = (Array.isArray(i.asks) ? i.asks : []).slice(0, 60)
    .filter((a: any) => typeof a?.symbol === 'string' && a.symbol.length <= 30)
    .map((a: any) => ({ symbol: a.symbol.toUpperCase(), exchange: typeof a.exchange === 'string' ? a.exchange : null, currency: typeof a.currency === 'string' ? a.currency : null, name: typeof a.name === 'string' ? a.name : null }));
  const { rows } = await updatePayouts(store, asks, kit, { force: i.force === true, fetchImpl });
  return { ok: true as const, payouts: rows };
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
