// Slices for the allocation donuts (by ticker, or grouped by a holding attribute), cash and dividends to be paid last.
import type { Holding } from '../../engine/types.ts';
import { PALETTE, SECTOR_PALETTE } from '../../charts.ts';
import { ccySymbol } from '../../format.ts';
import type { DonutItem } from './AllocDonut.vue';

/** the cash slice keeps the same khaki colour in every allocation chart */
export const CASH_COLOR = '#A9B787';
/** the grouped (sector, country, ...) donut cycles through the theme's sector colours */
export const GROUP_PALETTE = SECTOR_PALETTE.slice(0, 5);

export const cashLabel = (base: string) => `${ccySymbol(base).trim()} Cash`;
/** dividends past their ex-date that haven't reached cash yet: a paler cash colour */
export const TO_BE_PAID_COLOR = '#D3DBBE';
export const TO_BE_PAID_LABEL = 'Dividends to be paid';

export type TickerMetric = 'Market Value' | 'Cost' | 'Gain' | 'Loss';
export type GroupKey = 'Sector' | 'Industry' | 'Country' | 'Region' | 'Market' | 'Assets Type';

const GROUP_FIELD: Record<GroupKey, keyof Holding> = {
  Sector: 'sector', Industry: 'industry', Country: 'country', Region: 'region', Market: 'market', 'Assets Type': 'assetType',
};

export function tickerSlices(holdings: Holding[], cash: number, base: string, metric: TickerMetric, toBePaid = 0): DonutItem[] {
  const val = (h: Holding) =>
    metric === 'Market Value' ? h.marketValue : metric === 'Cost' ? h.costValue : metric === 'Gain' ? Math.max(0, h.unrealized) : Math.max(0, -h.unrealized);
  const items = holdings
    .map((h) => ({ name: h.symbol, value: val(h) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((x, i) => ({ ...x, color: PALETTE[i % PALETTE.length] }));
  if ((metric === 'Market Value' || metric === 'Cost') && cash > 0) items.push({ name: cashLabel(base), value: cash, color: CASH_COLOR });
  if ((metric === 'Market Value' || metric === 'Cost') && toBePaid > 0.005) items.push({ name: TO_BE_PAID_LABEL, value: toBePaid, color: TO_BE_PAID_COLOR });
  return items;
}

export function groupSlices(holdings: Holding[], cash: number, base: string, key: GroupKey, toBePaid = 0): DonutItem[] {
  const field = GROUP_FIELD[key];
  const sums = new Map<string, number>();
  for (const h of holdings) {
    const g = String(h[field] || 'Others');
    sums.set(g, (sums.get(g) ?? 0) + h.marketValue);
  }
  const items = [...sums.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: GROUP_PALETTE[i % GROUP_PALETTE.length] }));
  if (cash > 0) items.push({ name: cashLabel(base), value: cash, color: CASH_COLOR });
  if (toBePaid > 0.005) items.push({ name: TO_BE_PAID_LABEL, value: toBePaid, color: TO_BE_PAID_COLOR });
  return items;
}
