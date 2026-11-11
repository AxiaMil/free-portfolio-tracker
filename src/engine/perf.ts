// Performance page maths: period-return table vs benchmarks, calendar buckets and heat colours.
import type { DayPoint, Method } from './types.ts';
import { benchAccessor, bucketReturns, periodAvailable, periodReturnByKey, portfolioAccessor, type PeriodKey, type PeriodResult } from './periods.ts';

export const TABLE_PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: '1M', label: '1 M' }, { key: '3M', label: '3 M' }, { key: '6M', label: '6 M' }, { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1 Yr' }, { key: '2Y', label: '2 Yr' }, { key: '5Y', label: '5 Yr' }, { key: 'All', label: 'All' },
];

export type ReturnKind = 'Total Return' | 'Annualized';

export interface ReturnRow {
  id: string; // 'portfolio' or benchmark symbol
  name: string;
  cells: Array<number | null>; // one per TABLE_PERIODS entry (null = history too short)
  annualized: number | null; // since inception, annualized
}

/** Portfolio + each benchmark ("what if every deposit had bought it") over the standard periods. */
export function returnTable(
  series: DayPoint[], today: string, inception: string | null, method: Method,
  benches: Array<{ symbol: string; name: string }>, kind: ReturnKind,
): ReturnRow[] {
  if (!series.length) return [];
  const rows = [{ id: 'portfolio', name: 'Portfolio', acc: portfolioAccessor }, ...benches.map((b) => ({ id: b.symbol, name: b.name, acc: benchAccessor(b.symbol) }))];
  return rows.map((r) => {
    const cells = TABLE_PERIODS.map(({ key }) => {
      if (!periodAvailable(key, today, inception)) return null;
      const res = periodReturnByKey(series, key, today, method, r.acc);
      if (!res) return null;
      return kind === 'Annualized' ? res.annualized : res.pct;
    });
    const all = periodReturnByKey(series, 'All', today, method, r.acc);
    return { id: r.id, name: r.name, cells, annualized: all ? all.annualized : null };
  });
}

/** index of the best (highest) value in every column; null when the column is empty */
export function bestPerColumn(rows: ReturnRow[]): Array<number | null> {
  const cols = TABLE_PERIODS.length + 1;
  const out: Array<number | null> = [];
  for (let c = 0; c < cols; c++) {
    let best: number | null = null;
    let bestIdx: number | null = null;
    rows.forEach((r, i) => {
      const v = c < TABLE_PERIODS.length ? r.cells[c] : r.annualized;
      if (v != null && isFinite(v) && (best == null || v > best)) { best = v; bestIdx = i; }
    });
    out.push(bestIdx);
  }
  return out;
}

export type Bucket = 'Monthly' | 'Quarterly' | 'Annually';

export interface BucketRow {
  key: string; // 2026-11 | 2026-Q4 | 2026
  start: string;
  end: string;
  port: PeriodResult | null;
  bench: PeriodResult | null;
  excess: number | null; // portfolio minus benchmark return
}

export function historical(series: DayPoint[], bucket: Bucket, method: Method, bench: string): BucketRow[] {
  const p = bucketReturns(series, bucket, method, portfolioAccessor);
  const b = bucketReturns(series, bucket, method, benchAccessor(bench));
  return p.map((x, i) => {
    const bb = b[i]?.result ?? null;
    const excess = x.result && bb ? x.result.pct - bb.pct : null;
    return { key: x.key, start: x.start, end: x.end, port: x.result, bench: bb, excess };
  });
}

/** colour saturates at this absolute return; longer buckets need bigger moves to look "hot" */
export const HEAT_FULL: Record<Bucket, number> = { Monthly: 0.04, Quarterly: 0.04 * Math.sqrt(3), Annually: 0.04 * Math.sqrt(12) };

const BG = [14, 16, 21];
const GREEN = [72, 155, 103];
const RED = [191, 87, 78];

/** heat-map cell colour: linear blend from the page background to green / red */
export function heatColor(v: number | null | undefined, full = 0.04): string {
  if (v == null || !isFinite(v)) return 'transparent';
  const t = Math.min(1, Math.abs(v) / full);
  const c = v >= 0 ? GREEN : RED;
  const mix = (i: number) => Math.round(BG[i] + (c[i] - BG[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
