// Saving and loading the app state: the host's storage when it provides one, otherwise this browser
// (localStorage). Automatic snapshots of earlier versions are kept in IndexedDB either way.
import type { AppState, Portfolio, Preferences } from '../engine/types.ts';
import { uid } from '../engine/util.ts';
import { host } from './host.ts';
import { kvDelete, kvGet, kvKeys, kvPersistent, kvSet } from './kv.ts';

const STATE_KEY = 'portfolio-tracker:state';
const SNAP_PREFIX = 'snapshot:';
const SNAP_EVERY_MS = 5 * 60 * 1000;
const SNAP_KEEP = 30;

export const DEFAULT_PREFERENCES: Preferences = {
  hideValues: false, decimalSeparator: '.', thousandSeparator: ',', costMethod: 'FIFO', accent: '', theme: '', userInitial: '',
};

// Without a host, the state goes to localStorage, else IndexedDB. Some embedded or private views block both;
// then it only lives in memory until the page closes, and the app says so.
type BrowserTarget = 'local' | 'indexeddb' | 'memory';
let browserTarget: BrowserTarget | null = null;
async function detectBrowserTarget(): Promise<BrowserTarget> {
  if (browserTarget) return browserTarget;
  try {
    const probe = STATE_KEY + ':probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    browserTarget = 'local';
  } catch {
    browserTarget = (await kvPersistent()) ? 'indexeddb' : 'memory';
  }
  return browserTarget;
}

/** where the state lives, for the Settings screen (call after loadState) */
export function storageInfo(): { kind: 'host' | 'browser' | 'memory'; label: string } {
  const h = host();
  if (h?.loadState && h?.saveState) return { kind: 'host', label: h.name || 'Storage provided by the host app' };
  if (browserTarget === 'memory') return { kind: 'memory', label: 'Not saved: this page blocks browser storage' };
  return { kind: 'browser', label: 'This browser' };
}

export function newPortfolio(name: string, currency = 'USD'): Portfolio {
  return {
    id: uid('p'), name, currency, benchmark: '^GSPC', benchmarks: ['^GSPC', '^IXIC', '^NYA', 'SPY'], dividendTaxRate: 0, autoDividend: true, margin: false,
    transactions: [], customAssets: [], goal: null, rebalance: { mode: 'pct', targets: {}, extraAssets: [] },
  };
}

// currency for a brand-new portfolio, from the browser's region (falls back to USD)
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', SG: 'SGD', GB: 'GBP', HK: 'HKD', AU: 'AUD', CA: 'CAD', JP: 'JPY', CN: 'CNY', MY: 'MYR', TH: 'THB', IN: 'INR', KR: 'KRW',
  TW: 'TWD', CH: 'CHF', NZ: 'NZD', ID: 'IDR', PH: 'PHP', DE: 'EUR', FR: 'EUR', NL: 'EUR', IE: 'EUR', ES: 'EUR', IT: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', FI: 'EUR', LU: 'EUR', GR: 'EUR',
};
export function defaultCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region ?? '';
    return REGION_CURRENCY[region] ?? 'USD';
  } catch {
    return 'USD';
  }
}

/** an empty app: one portfolio, no transactions */
export function freshState(): AppState {
  const p = newPortfolio('My Portfolio', defaultCurrency());
  return { version: 1, activePortfolioId: p.id, preferences: { ...DEFAULT_PREFERENCES }, portfolios: [p] };
}

/** validates and fills in a state loaded from storage or a backup file; throws on anything unusable */
export function normalizeState(raw: unknown, fallbackPrefs: Partial<Preferences> = {}): AppState {
  const d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<AppState>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.portfolios) || !d.portfolios.length) throw new Error('This file has no portfolios');
  const portfolios: Portfolio[] = d.portfolios.map((p, i) => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.transactions)) throw new Error(`Portfolio ${i + 1} has no transactions list`);
    const blank = newPortfolio(String(p.name || `Portfolio ${i + 1}`), String(p.currency || 'USD'));
    return { ...blank, ...p, id: String(p.id || blank.id), customAssets: Array.isArray(p.customAssets) ? p.customAssets : [], benchmarks: Array.isArray(p.benchmarks) && p.benchmarks.length ? p.benchmarks : blank.benchmarks };
  });
  const preferences: Preferences = { ...DEFAULT_PREFERENCES, ...fallbackPrefs, ...((d.preferences ?? {}) as Partial<Preferences>) };
  const active = portfolios.some((p) => p.id === d.activePortfolioId) ? String(d.activePortfolioId) : portfolios[0].id;
  return { version: Number(d.version) || 1, activePortfolioId: active, preferences, portfolios };
}

/** the saved state, or null on first run */
export async function loadState(): Promise<AppState | null> {
  const h = host();
  let raw: unknown = null;
  if (h?.loadState) raw = await h.loadState();
  else if ((await detectBrowserTarget()) === 'local') raw = localStorage.getItem(STATE_KEY);
  else raw = await kvGet<string>(STATE_KEY);
  if (raw == null || raw === '') return null;
  return normalizeState(raw);
}

let lastSnapAt = 0;

export async function saveState(state: AppState): Promise<void> {
  const json = JSON.stringify(state);
  const h = host();
  if (h?.saveState) await h.saveState(JSON.parse(json));
  else if ((await detectBrowserTarget()) === 'local') {
    // a full localStorage (quota) falls through to IndexedDB from then on
    try { localStorage.setItem(STATE_KEY, json); } catch { browserTarget = (await kvPersistent()) ? 'indexeddb' : 'memory'; await kvSet(STATE_KEY, json); }
  } else await kvSet(STATE_KEY, json);
  if (Date.now() - lastSnapAt >= SNAP_EVERY_MS) {
    lastSnapAt = Date.now();
    await kvSet(SNAP_PREFIX + new Date().toISOString(), json);
    const keys = await kvKeys(SNAP_PREFIX);
    for (const k of keys.slice(0, Math.max(0, keys.length - SNAP_KEEP))) await kvDelete(k);
  }
}

export interface Snapshot { key: string; at: string; portfolios: number; transactions: number }

/** automatic snapshots, newest first */
export async function listSnapshots(): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  for (const key of (await kvKeys(SNAP_PREFIX)).reverse()) {
    try {
      const s = JSON.parse((await kvGet<string>(key)) ?? '') as AppState;
      out.push({ key, at: key.slice(SNAP_PREFIX.length), portfolios: s.portfolios.length, transactions: s.portfolios.reduce((n, p) => n + p.transactions.length, 0) });
    } catch { /* unreadable snapshot: skip */ }
  }
  return out;
}

export async function readSnapshot(key: string): Promise<AppState> {
  return normalizeState(await kvGet<string>(key));
}

/** ask the browser not to evict our storage under pressure (no-op where unsupported) */
export function requestPersistence() {
  if (host()?.saveState) return;
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
}
