// Choices + mutations for custom assets (stored per portfolio in activePortfolio.customAssets, priced by MarketView).
import type { CustomAsset, Portfolio } from '../../engine/types.ts';
import { activePortfolio } from '../../store.ts';

/**
 * MarketView caches each custom asset's price series and the store's marketView computed only tracks the
 * customAssets array itself, so after changing prices hand it a new array (same objects) to rebuild it.
 */
export function refreshCustomPrices(p: Portfolio | null = activePortfolio.value) {
  if (p) p.customAssets = [...p.customAssets];
}

export const ASSET_TYPES = ['Stock', 'ETF', 'Fund', 'Bond', 'Crypto', 'Real Estate', 'Private Equity', 'Commodity', 'Cash Equivalent', 'Collectible', 'Others'];
export const SECTORS = ['Technology', 'Financial Services', 'Healthcare', 'Consumer Cyclical', 'Consumer Defensive', 'Industrials', 'Energy', 'Utilities', 'Real Estate', 'Basic Materials', 'Communication Services', 'Others'];
export const COUNTRIES = [
  'Singapore', 'United States', 'Hong Kong', 'China', 'Japan', 'United Kingdom', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'India',
  'Australia', 'New Zealand', 'South Korea', 'Taiwan', 'Canada', 'Germany', 'France', 'Netherlands', 'Switzerland', 'Ireland', 'Luxembourg', 'Others',
];

/** sorted copy without duplicate dates (last write wins) */
export function normalizePrices(prices: Array<[string, number]>): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const [d, p] of prices) m.set(d, p);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function upsertPrice(a: CustomAsset, date: string, price: number) {
  a.prices = normalizePrices([...a.prices.filter(([d]) => d !== date), [date, price]]);
  refreshCustomPrices();
}

export function setPrices(a: CustomAsset, prices: Array<[string, number]>) {
  a.prices = normalizePrices(prices);
  refreshCustomPrices();
}

export function lastPrice(a: CustomAsset): [string, number] | null {
  const n = normalizePrices(a.prices);
  return n[n.length - 1] ?? null;
}

/** change the ticker of a custom asset and everything in the portfolio that refers to it */
export function renameSymbol(p: Portfolio, from: string, to: string) {
  if (from === to) return;
  for (const t of p.transactions) if (t.symbol.toUpperCase() === from) t.symbol = to;
  const r = p.rebalance;
  if (r?.targets && from in r.targets) {
    r.targets[to] = r.targets[from];
    delete r.targets[from];
  }
  if (r?.extraAssets) r.extraAssets = r.extraAssets.map((s) => (s === from ? to : s));
}

export const cleanTicker = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '-');
