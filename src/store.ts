// Global app store: persisted state (see platform/storage.ts), market data (market/client.ts), and the computed portfolio.
import { computed, reactive, shallowRef, watch } from 'vue';
import type { AppState, MarketBundle, Method, Portfolio, Txn } from './engine/types.ts';
import { MarketView, fxSymbol } from './engine/market.ts';
import { computePortfolio, type EngineResult } from './engine/portfolio.ts';
import type { PeriodKey } from './engine/periods.ts';
import { todayLocal, uid } from './engine/util.ts';
import { freshState, loadState, newPortfolio, requestPersistence, saveState } from './platform/storage.ts';
import { cachedCharts, cachedProfiles, cachedQuotes, getCharts, getProfiles, getQuotes, search, seedFromHost } from './market/client.ts';

export { newPortfolio };

export const BENCH_NAMES: Record<string, string> = {
  '^GSPC': 'S&P500', '^IXIC': 'NASDAQ', '^NYA': 'NYSE', SPY: 'SPY', '^DJI': 'Dow Jones', '^STI': 'STI', '^HSI': 'Hang Seng',
  QQQ: 'QQQ', VT: 'VT', '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', 'ES3.SI': 'STI ETF', 'URTH': 'MSCI World',
};
export const benchName = (s: string) => BENCH_NAMES[s] ?? s;

export const store = reactive({
  state: null as AppState | null,
  loading: true,
  /** price histories ready / needed, shown while the very first open on a device downloads them */
  progress: { done: 0, total: 0 },
  error: '' as string,
  refreshing: false,
  offline: false,
  lastUpdated: null as number | null,
  saveError: '',
  method: 'MWR' as Method,
  headerPeriod: 'All' as PeriodKey,
  today: todayLocal(),
  get base(): string {
    return activePortfolio.value?.currency ?? 'USD';
  },
  snackbar: { show: false, text: '', color: '' },
  helpOpen: false,
  addDialog: { open: false, prefill: null as Partial<Txn> | null },
});

export const market = shallowRef<MarketBundle>({ charts: {}, quotes: {}, profiles: {} });

export const activePortfolio = computed<Portfolio | null>(() => {
  const s = store.state;
  if (!s) return null;
  return s.portfolios.find((p) => p.id === s.activePortfolioId) ?? s.portfolios[0] ?? null;
});

export const marketView = computed(() => {
  const p = activePortfolio.value;
  const custom = p?.customAssets ?? [];
  // MarketView caches price series, so depend on every custom price point to rebuild it after edits
  for (const c of custom) for (const pt of c.prices) void (pt[0] + pt[1]);
  return new MarketView(market.value, p?.currency ?? 'USD', store.today, custom);
});

export const result = computed<EngineResult | null>(() => {
  const p = activePortfolio.value;
  if (!p || !store.state) return null;
  try {
    return computePortfolio(p, marketView.value, { costMethod: store.state.preferences.costMethod, today: store.today });
  } catch (e) {
    console.error('engine failed', e);
    return null;
  }
});

export function toast(text: string, color = '') {
  store.snackbar.text = text;
  store.snackbar.color = color;
  store.snackbar.show = true;
}

// ---------------- persistence ----------------
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;
function scheduleSave() {
  if (!loaded) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      if (store.state) await saveState(store.state);
      store.saveError = '';
    } catch (e) {
      store.saveError = String(e instanceof Error ? e.message : e);
      toast('Could not save your changes', 'error');
    }
  }, 350);
}

// ---------------- market data ----------------
function neededSymbols(): { assets: string[]; benches: string[] } {
  const p = activePortfolio.value;
  if (!p) return { assets: [], benches: [] };
  const custom = new Set(p.customAssets.map((c) => c.symbol));
  const assets = [...new Set(p.transactions.map((t) => t.symbol.toUpperCase()).filter((s) => s && s !== 'CASH' && !custom.has(s)))];
  const benches = [...new Set([...(p.benchmarks || []), p.benchmark].filter(Boolean))];
  return { assets, benches };
}

function fxPairs(symbols: string[]): string[] {
  const p = activePortfolio.value;
  if (!p) return [];
  const mv = marketView.value;
  const ccys = new Set<string>();
  for (const s of symbols) ccys.add(mv.currencyOf(s));
  for (const t of p.transactions) if (t.currency && t.currency !== 'Market') ccys.add(t.currency.toUpperCase());
  for (const c of p.customAssets) ccys.add(c.currency.toUpperCase());
  ccys.delete(p.currency);
  return [...ccys].map((c) => fxSymbol(c, p.currency));
}

async function loadCharts(symbols: string[], force = false) {
  if (!symbols.length) return;
  const counting = store.loading;
  if (counting) store.progress.total += symbols.length;
  const charts = await getCharts(symbols, { force, onEach: counting ? () => { store.progress.done++; } : undefined });
  market.value = { ...market.value, charts: { ...market.value.charts, ...charts } };
  if (Object.values(charts).some((c) => c.stale)) store.offline = true;
}

async function loadQuotes(symbols: string[], force = false) {
  if (!symbols.length) return;
  const r = await getQuotes(symbols, { force });
  market.value = { ...market.value, quotes: { ...market.value.quotes, ...r.quotes } };
  store.offline = r.offline;
  const times = Object.values(r.quotes).map((q) => q.fetchedAt).filter(Boolean);
  if (times.length) store.lastUpdated = Math.max(...times);
}

async function loadProfiles(symbols: string[], force = false) {
  if (!symbols.length) return;
  const profiles = await getProfiles(symbols, { force });
  market.value = { ...market.value, profiles: { ...market.value.profiles, ...profiles } };
}

/**
 * Brings market data up to date. By default only symbols not loaded yet (e.g. after adding a transaction);
 * `all` checks every symbol against its cache age, `force` downloads everything again (the refresh button).
 */
export async function refreshMarket(force = false, all = false) {
  const { assets, benches } = neededSymbols();
  const pick = (list: string[], have: Record<string, unknown>) => list.filter((s) => force || all || !have[s]);
  store.refreshing = true;
  try {
    // price histories first: the numbers on screen depend on them; FX pairs follow once currencies are known
    await loadCharts(pick([...assets, ...benches], market.value.charts), force);
    const fx = fxPairs([...assets, ...benches]);
    await loadCharts(pick(fx, market.value.charts), force);
    await loadQuotes([...assets, ...benches, ...fx], force);
    store.today = todayLocal();
  } catch (e) {
    store.offline = true;
    console.warn('market refresh failed', e);
  } finally {
    store.refreshing = false;
  }
  // company details (name, sector, country) come last, so they never hold up prices; nothing waits for them
  loadProfiles(pick(assets, market.value.profiles)).catch((e) => console.warn('profiles failed', e));
}

/**
 * Puts what this device has cached in place, however old, so the portfolio shows at once. True when every
 * price history it needs was there; otherwise the app waits for the download (only the first open on a device).
 */
async function openFromCache(): Promise<boolean> {
  const { assets, benches } = neededSymbols();
  const symbols = [...assets, ...benches];
  if (!symbols.length) return true;
  const charts = await cachedCharts(symbols);
  if (Object.keys(charts).length < symbols.length) return false;
  market.value = { ...market.value, charts }; // FX pairs depend on the currencies these report
  const fx = fxPairs(symbols);
  const fxCharts = await cachedCharts(fx);
  if (Object.keys(fxCharts).length < fx.length) return false;
  const [quotes, profiles] = await Promise.all([cachedQuotes([...symbols, ...fx]), cachedProfiles(assets)]);
  market.value = { charts: { ...charts, ...fxCharts }, quotes, profiles };
  const times = Object.values(quotes).map((q) => q.fetchedAt).filter(Boolean);
  if (times.length) store.lastUpdated = Math.max(...times);
  return true;
}

/** periodic: quotes every 60s, full daily history every 10 min */
let tick = 0;
function startTimers() {
  setInterval(async () => {
    tick++;
    const { assets, benches } = neededSymbols();
    const fx = fxPairs([...assets, ...benches]);
    try {
      if (tick % 10 === 0) await loadCharts([...assets, ...benches, ...fx]);
      await loadQuotes([...assets, ...benches, ...fx]);
      store.today = todayLocal();
    } catch {
      store.offline = true;
    }
  }, 60_000);
}

/** how long the saved portfolio may take to arrive before the app says so (it never starts empty instead) */
const LOAD_TIMEOUT_MS = 30_000;
/** how long the first paint waits for a host's saved market data while the portfolio is already here */
const HOST_CACHE_WAIT_MS = 2_000;

const within = <T>(p: Promise<T>, ms: number, message: string) => Promise.race([
  p,
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
]);

export async function init() {
  // a host's saved market data loads alongside the portfolio
  const hostCache = seedFromHost();
  try {
    // first run starts empty: one portfolio, no transactions. If the saved data can't be read, stop here
    // (nothing is saved over it) and say so, with a way to try again.
    store.state = (await within(loadState(), LOAD_TIMEOUT_MS, 'the saved portfolio took too long to load')) ?? freshState();
    requestPersistence();
    loaded = true;
    watch(() => store.state, scheduleSave, { deep: true });
    // new symbols (e.g. after adding a transaction) trigger a fetch
    watch(() => `${neededSymbols().assets.join(',')}|${neededSymbols().benches.join(',')}|${activePortfolio.value?.currency ?? ''}`, () => refreshMarket(false));
    const hostCacheOrWait = () => Promise.race([hostCache, new Promise<number>((r) => setTimeout(() => r(0), HOST_CACHE_WAIT_MS))]);
    // open on this device's cached prices straight away; failing that, on the host's saved market data
    let opened = await openFromCache();
    if (!opened) opened = (await hostCacheOrWait()) > 0 && (await openFromCache());
    if (opened) {
      store.loading = false;
      // then bring everything up to date in the background, starting from the host's data where that is newer
      void (async () => {
        if ((await hostCacheOrWait()) > 0) await openFromCache();
        await refreshMarket(false, true);
      })();
    } else {
      // nothing cached anywhere yet (the very first open): wait for the download, with a count
      await refreshMarket(false, true);
    }
    startTimers();
  } catch (e) {
    store.error = String(e instanceof Error ? e.message : e);
  } finally {
    store.loading = false;
  }
}

// ---------------- mutations ----------------
export function addTransactions(txns: Omit<Txn, 'id'>[]) {
  const p = activePortfolio.value;
  if (!p) return;
  for (const t of txns) p.transactions.push({ ...t, id: uid('t'), symbol: t.symbol.trim().toUpperCase() });
}

export function updateTransaction(id: string, patch: Partial<Txn>) {
  const p = activePortfolio.value;
  const t = p?.transactions.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
}

export function deleteTransactions(ids: string[]) {
  const p = activePortfolio.value;
  if (!p) return;
  const set = new Set(ids);
  p.transactions = p.transactions.filter((t) => !set.has(t.id));
}

export function removePosition(symbol: string) {
  const p = activePortfolio.value;
  if (!p) return;
  p.transactions = p.transactions.filter((t) => t.symbol.toUpperCase() !== symbol.toUpperCase());
}

export function openAddTransaction(prefill: Partial<Txn> | null = null) {
  store.addDialog.prefill = prefill;
  store.addDialog.open = true;
}

export function fetchSearch(q: string) {
  return search(q);
}
