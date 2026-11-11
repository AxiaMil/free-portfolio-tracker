// Derived headline statistics shared by several pages.
import { computed } from 'vue';
import { activePortfolio, result, store } from '../store.ts';
import { benchAccessor, periodAvailable, periodReturnByKey, portfolioAccessor, type PeriodKey } from '../engine/periods.ts';
import { riskMetrics } from '../engine/risk.ts';
import type { DayPoint, Method } from '../engine/types.ts';
import { addYears } from '../engine/util.ts';

export const HEADER_PERIODS: PeriodKey[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'All'];

export function dayChange(series: DayPoint[], offset: number, valueOf: (p: DayPoint) => number = (p) => p.value) {
  const n = series.length;
  const cur = series[n - 1 - offset];
  const prev = series[n - 2 - offset];
  if (!cur) return { gain: 0, pct: 0 };
  const pv = prev ? valueOf(prev) : 0;
  const gain = valueOf(cur) - pv - cur.flow;
  const denom = pv + Math.max(0, cur.flow);
  return { gain, pct: denom ? gain / denom : 0 };
}

export const primaryBench = computed(() => activePortfolio.value?.benchmark ?? '^GSPC');

export const headline = computed(() => {
  const r = result.value;
  if (!r || !r.series.length) return null;
  const s = r.series;
  const method: Method = store.method;
  const b = primaryBench.value;
  const benchVal = (p: DayPoint) => p.bench[b] ?? 0;
  const period = periodReturnByKey(s, store.headerPeriod, r.today, method);
  const all = periodReturnByKey(s, 'All', r.today, method);
  const benchAll = periodReturnByKey(s, 'All', r.today, method, benchAccessor(b));
  const last = s[s.length - 1];
  return {
    value: r.value,
    today: dayChange(s, 0),
    yesterday: dayChange(s, 1),
    period,
    all,
    bench: {
      symbol: b,
      value: benchVal(last),
      today: dayChange(s, 0, benchVal),
      yesterday: dayChange(s, 1, benchVal),
      all: benchAll,
    },
    noInvest: { value: last.netDeposits },
  };
});

export const gainsAndReturns = computed(() => {
  const r = result.value;
  if (!r) return [];
  return HEADER_PERIODS.map((k) => ({ key: k, label: k === 'All' ? 'All-Time' : k, available: periodAvailable(k, r.today, r.inception), res: periodReturnByKey(r.series, k, r.today, store.method, portfolioAccessor) }));
});

export const allRisk = computed(() => {
  const r = result.value;
  if (!r || r.series.length < 2) return null;
  return riskMetrics(r.series, null, r.today, primaryBench.value);
});

export const keyStats = computed(() => {
  const r = result.value;
  if (!r || !r.series.length) return null;
  const s = r.series;
  let ath = 0;
  let high52 = 0;
  const from52 = addYears(r.today, -1);
  for (const p of s) {
    ath = Math.max(ath, p.value);
    if (p.date >= from52) high52 = Math.max(high52, p.value);
  }
  const ttmFrom = addYears(r.today, -1);
  const ttmDiv = r.dividends.filter((d) => d.status === 'received' && d.payDate > ttmFrom && d.payDate <= r.today).reduce((a, d) => a + d.amountBase, 0);
  const risk = allRisk.value;
  return {
    ath, high52,
    dividendYield: r.value ? ttmDiv / r.value : 0,
    maxDD: risk?.maxDD ?? 0,
    maxDDDuration: risk?.longestDD ?? 0,
    sharpe: risk?.sharpe ?? null,
    beta: risk?.beta ?? null,
  };
});
