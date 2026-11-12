// Rebalance calculator: current vs target value for cash, every holding and any asset added as a new target.
// Settings live in activePortfolio.rebalance (saved to disk by the store's deep watcher).
import { getQuotes } from '../../market/client.ts';
import { computed, shallowRef, watch } from 'vue';
import { activePortfolio, market, result, store, toast } from '../../store.ts';
import { MarketView, fxSymbol, normalizeCurrency } from '../../engine/market.ts';
import type { Portfolio, Quote } from '../../engine/types.ts';
import { PALETTE } from '../../charts.ts';
import { CASH_COLOR, cashLabel } from '../alloc/allocData.ts';

/** `cashValue` (optional) overrides the cash amount used by the calculator, e.g. to plan with new money */
export type RebalanceSettings = Portfolio['rebalance'] & { cashValue?: number | null };
export type RebalanceMode = RebalanceSettings['mode'];
export const CASH_KEY = 'CASH';

export interface RRow {
  key: string;
  kind: 'cash' | 'holding' | 'extra';
  symbol: string;
  name: string;
  current: number;
  currentPct: number;
  /** what the target field shows: percent (pct mode) or base-currency amount (value mode) */
  input: number;
  custom: boolean;
  targetValue: number;
  targetPct: number;
  delta: number;
  /** price of one unit in base currency, and in its own currency */
  unitPrice: number | null;
  lastLocal: number | null;
  currency: string;
  /** units to buy (+) or sell (-) at the last price */
  units: number | null;
  color: string;
}

const DEFAULT: RebalanceSettings = { mode: 'pct', targets: {}, extraAssets: [] };

// quotes for added assets the portfolio does not hold (and their FX pairs)
const extraQuotes = shallowRef<Record<string, Quote>>({});
const inflight = new Set<string>();

async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (!symbols.length) return {};
  return (await getQuotes(symbols)).quotes;
}

async function loadExtraQuotes(symbols: string[], base: string) {
  const known = (s: string) => !!market.value.quotes[s] || !!market.value.charts[s]?.bars?.length || !!extraQuotes.value[s];
  const custom = new Set((activePortfolio.value?.customAssets ?? []).map((c) => c.symbol));
  const need = symbols.filter((s) => !custom.has(s) && !known(s) && !inflight.has(s));
  if (!need.length) return;
  need.forEach((s) => inflight.add(s));
  try {
    let q = { ...extraQuotes.value, ...(await fetchQuotes(need)) };
    const fx = [...new Set(need.map((s) => normalizeCurrency(q[s]?.currency).code).filter((c) => c && c !== base))]
      .map((c) => fxSymbol(c, base))
      .filter((s) => !known(s) && !q[s]);
    if (fx.length) q = { ...q, ...(await fetchQuotes(fx)) };
    extraQuotes.value = q;
  } catch {
    // offline: the added asset still works, just without a share estimate
  } finally {
    need.forEach((s) => inflight.delete(s));
  }
}

export function useRebalance() {
  const settings = computed<RebalanceSettings>(() => (activePortfolio.value?.rebalance as RebalanceSettings | undefined) ?? DEFAULT);
  const mode = computed<RebalanceMode>(() => settings.value.mode ?? 'pct');

  function ensure(): RebalanceSettings | null {
    const p = activePortfolio.value;
    if (!p) return null;
    if (!p.rebalance) p.rebalance = { mode: 'pct', targets: {}, extraAssets: [] };
    if (!p.rebalance.targets) p.rebalance.targets = {};
    if (!p.rebalance.extraAssets) p.rebalance.extraAssets = [];
    return p.rebalance as RebalanceSettings;
  }

  const heldSymbols = computed(() => new Set((result.value?.holdings ?? []).map((h) => h.symbol)));
  const extras = computed(() => (settings.value.extraAssets ?? []).filter((s) => !heldSymbols.value.has(s)));

  const view = computed(() => {
    const p = activePortfolio.value;
    const m = market.value;
    return new MarketView({ charts: m.charts, quotes: { ...m.quotes, ...extraQuotes.value }, profiles: m.profiles }, p?.currency ?? 'USD', store.today, p?.customAssets ?? []);
  });

  watch(
    () => extras.value.join(',') + '|' + (activePortfolio.value?.currency ?? ''),
    () => loadExtraQuotes(extras.value, activePortfolio.value?.currency ?? 'USD'),
    { immediate: true },
  );

  const actualCash = computed(() => result.value?.cash ?? 0);
  const cashValue = computed(() => settings.value.cashValue ?? actualCash.value);

  const rows = computed<RRow[]>(() => {
    const r = result.value;
    if (!r) return [];
    const rb = settings.value;
    const targets = rb.targets ?? {};
    const isPct = mode.value === 'pct';
    const cash = cashValue.value;
    const total = r.holdings.reduce((s, h) => s + h.marketValue, 0) + cash;
    const v = view.value;
    const make = (key: string, kind: RRow['kind'], name: string, current: number, color: string, unit: { base: number | null; local: number | null; ccy: string }): RRow => {
      const currentPct = total ? current / total : 0;
      const stored = targets[key];
      const custom = stored != null && isFinite(stored);
      const input = custom ? stored : isPct ? currentPct * 100 : current;
      const targetValue = isPct ? (input / 100) * total : input;
      const delta = targetValue - current;
      return {
        key, kind, symbol: key, name, current, currentPct, input, custom, targetValue, targetPct: total ? targetValue / total : 0, delta,
        unitPrice: unit.base, lastLocal: unit.local, currency: unit.ccy,
        units: kind === 'cash' || !unit.base ? null : delta / unit.base,
        color,
      };
    };
    const out: RRow[] = [make(CASH_KEY, 'cash', cashLabel(r.base), cash, CASH_COLOR, { base: 1, local: 1, ccy: r.base })];
    r.holdings.forEach((h, i) => {
      out.push(make(h.symbol, 'holding', h.name, h.marketValue, PALETTE[i % PALETTE.length], { base: h.last != null ? h.last * h.fx : null, local: h.last, ccy: h.currency }));
    });
    extras.value.forEach((s, j) => {
      const ccy = v.currencyOf(s);
      const last = v.lastPrice(s);
      const fx = v.fxAt(ccy, store.today);
      out.push(make(s, 'extra', v.name(s), 0, PALETTE[(r.holdings.length + j) % PALETTE.length], { base: last != null ? last * fx : null, local: last, ccy }));
    });
    return out;
  });

  const totals = computed(() => {
    const rs = rows.value;
    const current = rs.reduce((s, x) => s + x.current, 0);
    const target = rs.reduce((s, x) => s + x.targetValue, 0);
    const sumPct = current ? target / current : 0;
    return {
      current,
      target,
      sumPct,
      sumOk: Math.abs(sumPct - 1) < 0.00005,
      positions: rs.filter((x) => x.kind !== 'cash' && x.targetValue > 0.005).length,
      buy: rs.filter((x) => x.kind !== 'cash' && x.delta > 0).reduce((s, x) => s + x.delta, 0),
      sell: -rs.filter((x) => x.kind !== 'cash' && x.delta < 0).reduce((s, x) => s + x.delta, 0),
    };
  });

  function setTarget(key: string, value: number | null) {
    const rb = ensure();
    if (!rb) return;
    if (value == null || !isFinite(value)) delete rb.targets[key];
    else rb.targets[key] = Math.max(0, value);
  }

  function setCash(value: number | null) {
    const rb = ensure();
    if (!rb) return;
    // the field shows cents, so a value within half a cent of the real cash means "no override"
    if (value == null || !isFinite(value) || Math.abs(value - actualCash.value) < 0.005) delete rb.cashValue;
    else rb.cashValue = Math.max(0, value);
  }

  /** switching % <-> amount converts the targets already typed, relative to the current total */
  function setMode(m: RebalanceMode) {
    const rb = ensure();
    if (!rb || rb.mode === m) return;
    const total = totals.value.current;
    for (const k of Object.keys(rb.targets)) {
      const t = rb.targets[k];
      rb.targets[k] = m === 'value' ? +((t / 100) * total).toFixed(6) : total ? +((t / total) * 100).toFixed(6) : 0;
    }
    rb.mode = m;
  }

  function reset() {
    const rb = ensure();
    if (!rb) return;
    rb.targets = {};
    rb.extraAssets = [];
    delete rb.cashValue;
  }

  function addAsset(symbol: string) {
    const rb = ensure();
    const s = symbol.trim().toUpperCase();
    if (!rb || !s) return false;
    if (s === CASH_KEY) return false;
    if (heldSymbols.value.has(s) || rb.extraAssets.includes(s)) {
      toast(`${s} is already in the calculator`);
      return false;
    }
    rb.extraAssets.push(s);
    return true;
  }

  function removeAsset(symbol: string) {
    const rb = ensure();
    if (!rb) return;
    rb.extraAssets = rb.extraAssets.filter((x) => x !== symbol);
    delete rb.targets[symbol];
  }

  return { settings, mode, rows, totals, cashValue, actualCash, setTarget, setCash, setMode, reset, addAsset, removeAsset };
}
