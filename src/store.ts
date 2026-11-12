// Global app store: persisted state (see platform/storage.ts), market data (market/client.ts), and the computed portfolio.
import { computed, reactive, shallowRef, watch } from 'vue';
import type { AppState, MarketBundle, Method, Portfolio, Txn } from './engine/types.ts';
import { MarketView, fxSymbol } from './engine/market.ts';
import { computePortfolio, type EngineResult } from './engine/portfolio.ts';
import type { PeriodKey } from './engine/periods.ts';
import { todayLocal, uid } from './engine/util.ts';
import { freshState, loadState, newPortfolio, requestPersistence, saveState } from './platform/storage.ts';
import { getCharts, getProfiles, getQuotes, search } from './market/client.ts';

export { newPortfolio };

export const BENCH_NAMES: Record<string, string> = {
  '^GSPC': 'S&P500', '^IXIC': 'NASDAQ', '^NYA': 'NYSE', SPY: 'SPY', '^DJI': 'Dow Jones', '^STI': 'STI', '^HSI': 'Hang Seng',
  QQQ: 'QQQ', VT: 'VT', '^FTSE': 'FTSE 100', '^N225': 'Nikkei 225', 'ES3.SI': 'STI ETF', 'URTH': 'MSCI World',
};
export const benchName = (s: string) => BENCH_NAMES[s] ?? s;

export const store = reactive({
  state: null as AppState | null,
  loading: true,
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
  const charts = await getCharts(symbols, { force });
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

export async function refreshMarket(force = false) {
  const { assets, benches } = neededSymbols();
  store.refreshing = true;
  try {
    const missingCharts = [...assets, ...benches].filter((s) => force || !market.value.charts[s]);
    await Promise.all([loadCharts(missingCharts.length ? missingCharts : [], force), loadProfiles(assets.filter((s) => force || !market.value.profiles[s]), false)]);
    const fx = fxPairs([...assets, ...benches]);
    const missingFx = fx.filter((s) => force || !market.value.charts[s]);
    await loadCharts(missingFx, force);
    await loadQuotes([...assets, ...benches, ...fx], force);
    store.today = todayLocal();
  } catch (e) {
    store.offline = true;
    console.warn('market refresh failed', e);
  } finally {
    store.refreshing = false;
  }
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

export async function init() {
  try {
    // first run starts empty: one portfolio, no transactions
    store.state = (await loadState()) ?? freshState();
    requestPersistence();
    loaded = true;
    watch(() => store.state, scheduleSave, { deep: true });
    // new symbols (e.g. after adding a transaction) trigger a fetch
    watch(() => `${neededSymbols().assets.join(',')}|${neededSymbols().benches.join(',')}|${activePortfolio.value?.currency ?? ''}`, () => refreshMarket(false));
    await refreshMarket(false);
    startTimers();
  } catch (e) {
    store.error = String(e);
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
