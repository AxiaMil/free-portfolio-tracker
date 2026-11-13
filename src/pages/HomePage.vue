<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { result, store, benchName } from '../store.ts';
import { primaryBench } from '../composables/stats.ts';
import { addDays, xirr } from '../engine/util.ts';
import { money, moneyAxis, pct, pctAxis } from '../format.ts';
import PortfolioHeader from '../components/PortfolioHeader.vue';
import PillToggle from '../components/PillToggle.vue';
import HelpTip from '../components/HelpTip.vue';
import TimeChart, { type TSeries } from '../components/TimeChart.vue';
import ShareButton from '../components/ShareButton.vue';
import BenchmarkCards from '../components/BenchmarkCards.vue';
import HoldingsChart from '../components/HoldingsChart.vue';
import HoldingsTable from '../components/HoldingsTable.vue';


const { mdAndUp } = useDisplay();
type Mode = 'Value' | 'Return' | 'Gain' | 'Cash' | '%Off High';
const mode = ref<Mode>('Value');
const tc = ref();
const chartRef = computed(() => tc.value?.chart);

/** cumulative money-weighted return at every day since inception */
function mwrSeries(values: number[], flows: number[], dates: string[]): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const cfs: Array<[string, number]> = [];
  for (let i = 0; i < dates.length; i++) {
    if (flows[i]) cfs.push([dates[i], -flows[i]]);
    if (i % 2 === 1 && i !== dates.length - 1) continue; // every 2nd day is plenty for the chart
    const days = Math.max(1, (Date.parse(dates[i]) - Date.parse(dates[0])) / 86400000);
    const r = xirr([...cfs, [dates[i], values[i]]]);
    const v = r == null || !isFinite(r) ? 0 : Math.pow(1 + r, days / 365) - 1;
    out.push([dates[i], isFinite(v) ? v : 0]);
  }
  return out;
}

const series = computed<TSeries[]>(() => {
  const r = result.value;
  if (!r) return [];
  const s = r.series;
  const b = primaryBench.value;
  const bn = benchName(b);
  const dates = s.map((p) => p.date);
  if (mode.value === 'Value') {
    return [
      { name: 'Cash Deposits', data: s.map((p) => [p.date, p.netDeposits]), color: palette.deposits, kind: 'step-area', fill: palette.depositsFill, width: 1, z: 1 },
      { name: bn, data: s.map((p) => [p.date, p.bench[b] ?? null]), color: palette.bench, width: 1.6, z: 2 },
      { name: 'Portfolio', data: s.map((p) => [p.date, p.value]), color: palette.portfolio, width: 2.4, z: 3, gradient: palette.portfolioFill },
    ];
  }
  if (mode.value === 'Gain') {
    return [
      { name: bn, data: s.map((p) => [p.date, (p.bench[b] ?? 0) - p.netDeposits]), color: palette.bench, width: 1.6 },
      { name: 'Portfolio', data: s.map((p) => [p.date, p.gain]), color: palette.portfolio, width: 2.4, gradient: palette.portfolioFill },
    ];
  }
  if (mode.value === 'Cash') {
    return [{ name: 'Cash', data: s.map((p) => [p.date, p.cash]), color: palette.portfolio, kind: 'area', fill: palette.portfolioFill, width: 1.6 }];
  }
  if (mode.value === '%Off High') {
    let pk = 0;
    let bk = 0;
    return [
      { name: bn, data: s.map((p) => { bk = Math.max(bk, p.benchIndex[b] ?? 1); return [p.date, (p.benchIndex[b] ?? 1) / bk - 1]; }), color: palette.bench, width: 1.6 },
      { name: 'Portfolio', data: s.map((p) => { pk = Math.max(pk, p.twrIndex); return [p.date, p.twrIndex / pk - 1]; }), color: palette.portfolio, width: 2.2 },
    ];
  }
  // Return
  const m = store.method;
  let port: Array<[string, number]>;
  let bench: Array<[string, number]>;
  if (m === 'TWR') {
    port = s.map((p) => [p.date, p.twrIndex - 1]);
    bench = s.map((p) => [p.date, (p.benchIndex[b] ?? 1) - 1]);
  } else if (m === 'SR') {
    port = s.map((p) => [p.date, p.grossDeposits ? p.gain / p.grossDeposits : 0]);
    bench = s.map((p) => [p.date, p.grossDeposits ? ((p.bench[b] ?? 0) - p.netDeposits) / p.grossDeposits : 0]);
  } else {
    const flows = s.map((p) => p.flow);
    port = mwrSeries(s.map((p) => p.value), flows, dates);
    bench = mwrSeries(s.map((p) => p.bench[b] ?? 0), flows, dates);
  }
  return [
    { name: bn, data: bench, color: palette.bench, width: 1.6 },
    { name: 'Portfolio', data: port, color: palette.portfolio, width: 2.4, gradient: palette.portfolioFill },
  ];
});

const isPct = computed(() => mode.value === 'Return' || mode.value === '%Off High');
// before the first transaction the chart is empty but still shows yesterday → today
const emptyRange = computed<[string, string]>(() => [addDays(store.today, -1), store.today]);
const hasHoldings = computed(() => !!result.value?.holdings.length);
const valueFmt = (v: number) => (isPct.value ? pct(v) : money(v));
const legend = computed(() => {
  const bn = benchName(primaryBench.value);
  if (mode.value === 'Value') return [{ n: 'Portfolio', c: palette.portfolio, t: 'line' }, { n: bn, c: palette.bench, t: 'thin' }, { n: 'Cash Deposits', c: palette.deposits, t: 'box' }];
  if (mode.value === 'Cash') return [{ n: 'Cash', c: palette.portfolio, t: 'box' }];
  return [{ n: 'Portfolio', c: palette.portfolio, t: 'line' }, { n: bn, c: palette.bench, t: 'thin' }];
});
const MODE_HELP = 'Value: portfolio market value. Return: cumulative return using the selected method. Gain: value minus net deposits. Cash: cash balance. %Off High: distance from the previous high (time-weighted).';
const METHOD_HELP = 'MWR (money-weighted, XIRR) counts the size and timing of your deposits. TWR (time-weighted) measures the investments only. SR (simple return) = gain / invested capital.';
</script>

<template>
  <div class="page home">
    <PortfolioHeader />

    <div class="chart-controls">
      <div class="d-flex align-center ga-3 flex-wrap">
        <PillToggle v-model="mode" :options="['Value', 'Return', 'Gain', 'Cash', '%Off High'] as const" />
        <HelpTip :text="MODE_HELP" :size="18" />
      </div>
      <div class="d-flex align-center ga-3">
        <PillToggle v-model="store.method" :options="['MWR', 'TWR', 'SR'] as const" />
        <v-spacer v-if="!mdAndUp" />
        <ShareButton icon :chart="chartRef" filename="portfolio-chart" />
      </div>
    </div>

    <TimeChart ref="tc" class="main-chart" :series="series" :height="mdAndUp ? 439 : 262" :legend-below="!mdAndUp" :show-y-axis="mode !== 'Value'" :y-formatter="isPct ? (v: number) => pctAxis(v) : (v: number) => moneyAxis(v)" :value-formatter="valueFmt" :empty-range="emptyRange">
      <template #legend>
        <div class="legend">
          <span v-for="l in legend" :key="l.n" class="li"><i :class="l.t" :style="{ background: l.c }" />{{ l.n }}</span>
        </div>
      </template>
    </TimeChart>

    <div class="bench-wrap"><BenchmarkCards /></div>

    <h2 class="section-title holdings-title">My Holdings</h2>
    <HoldingsChart v-if="hasHoldings" />
    <div class="table-gap"><HoldingsTable /></div>
  </div>
</template>

<style scoped lang="scss">
.chart-controls { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 52px 0 0; flex-wrap: wrap; }
.main-chart { margin-top: 7px; }
.legend { display: flex; gap: 14px; margin: 10px 0 0; font-size: 12.8px; line-height: 17px; color: var(--text); flex-wrap: wrap; }
.li { display: inline-flex; align-items: center; gap: 6px; }
.li i { display: inline-block; width: 14px; height: 2.5px; border-radius: 2px; }
.li i.thin { height: 1.5px; }
.li i.box { height: 5px; width: 14px; border-radius: 1px; }
.bench-wrap { margin-top: 28px; }
.holdings-title { margin: 39px 0 28px; }
.table-gap { margin-top: 24px; }
@media (max-width: 959px) {
  .chart-controls { margin: 24px 0 0; flex-direction: column; align-items: stretch; gap: 10px; > div { width: 100%; flex-wrap: nowrap !important; } }
  .main-chart { margin-top: 14px; }
  .legend { margin: 14px 0 0; font-size: 13px; }
  .bench-wrap { margin-top: 32px; }
  .holdings-title { margin: 44px 0 20px; }
}
</style>
