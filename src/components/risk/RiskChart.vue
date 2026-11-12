<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Risk chart: drawdown from peak, or a rolling (3-month) volatility / Sharpe / Sortino / beta / alpha line.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { benchName, result } from '../../store.ts';
import { primaryBench, riskPeriods } from '../../composables/stats.ts';
import { drawdownSeries, rollingSeries } from '../../engine/risk.ts';
import { periodBaseDate, type PeriodKey } from '../../engine/periods.ts';
import { lastIndexLE } from '../../engine/util.ts';
import { num, pct } from '../../format.ts';
import type { DayPoint } from '../../engine/types.ts';
import TimeChart, { type TSeries } from '../TimeChart.vue';
import PillToggle from '../PillToggle.vue';
import ShareButton from '../ShareButton.vue';

type Metric = 'Drawdown' | 'Volatility' | 'Sharpe' | 'Sortino' | 'Beta' | 'Alpha';
const METRICS: Metric[] = ['Drawdown', 'Volatility', 'Sharpe', 'Sortino', 'Beta', 'Alpha'];
const WINDOW = 63; // trading days = 3 months

const { mdAndUp } = useDisplay();
const metric = ref<Metric>('Drawdown');
const period = ref<PeriodKey>('All');
watch(riskPeriods, (ps) => { if (!ps.includes(period.value)) period.value = 'All'; });
const tc = ref();
const chartRef = computed(() => tc.value?.chart);

const bench = computed(() => primaryBench.value);
const bn = computed(() => benchName(bench.value));

const fromIdx = computed(() => {
  const r = result.value;
  if (!r || period.value === 'All') return 0;
  const base = periodBaseDate(period.value, r.today);
  const i = base ? lastIndexLE(r.series.map((p) => p.date), base) : 0;
  return Math.max(0, i);
});

const series = computed<TSeries[]>(() => {
  const r = result.value;
  if (!r || r.series.length < 2) return [];
  const s = r.series;
  const b = bench.value;
  const from = fromIdx.value;
  const m = metric.value;
  if (m === 'Drawdown') {
    return [{ name: 'Drawdown from peak', data: drawdownSeries(s, from), color: palette.neg, kind: 'area', fill: alpha(palette.neg, 0.12), width: 1.6 }];
  }
  const port = rollingSeries(s, b, m, WINDOW, from);
  if (m === 'Beta' || m === 'Alpha') {
    const ref = m === 'Beta' ? 1 : 0;
    // main line first: the navigator draws its shadow from the first series
    return [
      { name: m === 'Beta' ? 'Rolling beta' : 'Rolling alpha (ann.)', data: port, color: palette.portfolio, width: 2, z: 3 },
      { name: m === 'Beta' ? `${bn.value} (1.00)` : 'Zero', data: port.map(([d]) => [d, ref]), color: palette.axis, width: 1, dashed: true, z: 1 },
    ];
  }
  // benchmark's own rolling measure: treat its price index as the "portfolio"
  const bs: DayPoint[] = s.map((p) => ({ ...p, twrIndex: p.benchLocal?.[b] ?? p.benchIndex[b] ?? 1 }));
  const bser = rollingSeries(bs, b, m, WINDOW, from);
  return [
    { name: 'Portfolio', data: port, color: palette.portfolio, width: 2, z: 3 },
    { name: bn.value, data: bser, color: palette.bench, width: 1.5, z: 2 },
  ];
});

/** drawdown axis: round the floor to 5% steps (0, -5, -10 ...) */
const ddMin = computed(() => {
  if (metric.value !== 'Drawdown') return undefined;
  const lo = Math.min(0, ...(series.value[0]?.data ?? []).map(([, v]) => v ?? 0));
  const step = lo < -0.1 ? 0.05 : lo < -0.04 ? 0.02 : 0.01;
  return Math.min(-step, Math.floor((lo - 1e-9) / step) * step);
});

const isPct = computed(() => metric.value === 'Drawdown' || metric.value === 'Volatility' || metric.value === 'Alpha');
const yFmt = (v: number) => (isPct.value ? `${+(v * 100).toFixed(1)}%` : `${+v.toFixed(1)}`);
const valueFmt = (v: number) => (isPct.value ? pct(v, { sign: metric.value === 'Alpha' }) : num(v, 2));

const legend = computed(() => {
  const m = metric.value;
  if (m === 'Drawdown') return { items: [{ n: 'Drawdown from peak', c: palette.neg }], note: '' };
  if (m === 'Beta') return { items: [{ n: 'Rolling beta', c: palette.portfolio }, { n: `${bn.value} = 1.00`, c: palette.axis, dashed: true }], note: `3-month rolling window vs ${bn.value}` };
  if (m === 'Alpha') return { items: [{ n: 'Rolling alpha (ann.)', c: palette.portfolio }], note: `3-month rolling window, excess over ${bn.value}` };
  return { items: [{ n: 'Portfolio', c: palette.portfolio }, { n: bn.value, c: palette.bench }], note: `3-month rolling window${m === 'Volatility' ? ', annualized' : ''}` };
});
</script>

<template>
  <section class="rc">
    <template v-if="mdAndUp">
      <div class="row1">
        <PillToggle v-model="metric" :options="METRICS" />
        <ShareButton icon :chart="chartRef" :filename="`risk-${metric.toLowerCase()}`" />
      </div>
      <div class="periods">
        <span class="plabel">Period</span>
        <button v-for="p in riskPeriods" :key="p" class="per" :class="{ active: period === p }" @click="period = p">{{ p }}</button>
      </div>
    </template>
    <template v-else>
      <div class="msel">
        <span class="slabel">Metric:</span>
        <v-menu location="bottom start">
          <template #activator="{ props }"><button v-bind="props" class="outline-btn sel">{{ metric }} <v-icon size="16">mdi-chevron-down</v-icon></button></template>
          <v-list density="compact"><v-list-item v-for="m in METRICS" :key="m" :active="metric === m" @click="metric = m">{{ m }}</v-list-item></v-list>
        </v-menu>
        <v-spacer />
        <ShareButton icon :chart="chartRef" :filename="`risk-${metric.toLowerCase()}`" />
      </div>
      <div class="msel">
        <span class="slabel">Period:</span>
        <v-menu location="bottom start">
          <template #activator="{ props }"><button v-bind="props" class="outline-btn sel">{{ period }} <v-icon size="16">mdi-chevron-down</v-icon></button></template>
          <v-list density="compact"><v-list-item v-for="p in riskPeriods" :key="p" :active="period === p" @click="period = p">{{ p }}</v-list-item></v-list>
        </v-menu>
      </div>
    </template>

    <TimeChart
      ref="tc"
      class="chart"
      :series="series"
      hide-zoom
      :navigator="mdAndUp"
      show-y-axis
      :height="mdAndUp ? 426 : 267"
      :y-max="metric === 'Drawdown' ? 0 : undefined"
      :y-min="ddMin"
      :y-formatter="yFmt"
      :value-formatter="valueFmt"
      legend-below
    >
      <template #legend>
        <div class="legend">
          <span v-for="l in legend.items" :key="l.n" class="li"><i :class="{ dashed: l.dashed }" :style="{ background: l.dashed ? 'transparent' : l.c, borderColor: l.c }" />{{ l.n }}</span>
          <span v-if="legend.note" class="note">{{ legend.note }}</span>
        </div>
      </template>
    </TimeChart>
  </section>
</template>

<style scoped lang="scss">
.row1 { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.periods { display: flex; align-items: center; gap: 2px; margin-top: 8px; }
.plabel { font-size: 14px; color: var(--muted); margin-right: 10px; }
.per { background: none; border: 1px solid transparent; color: var(--muted); font: 500 13px/16px var(--font); height: 28px; padding: 4px 9px; border-radius: 8px; cursor: pointer; white-space: nowrap; &:hover { color: var(--text); } }
.per.active { color: var(--text); border-color: var(--faint); font-weight: 700; }
.chart { margin-top: 8px; }
.outline-btn.icon { height: 28px; width: 40px; border-radius: 8px; border-color: var(--border-strong); }
.legend { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin: 6px 0 0 4px; font-size: 14px; color: var(--text); }
.li { display: inline-flex; align-items: center; gap: 8px; }
.li i { display: inline-block; width: 20px; height: 2px; border-radius: 2px; border-top: 0 solid; }
.li i.dashed { height: 0; border-top: 2px dashed; border-radius: 0; }
.note { color: var(--muted); font-size: 13px; }
.msel { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
.slabel { font-size: 14px; color: var(--muted); min-width: 54px; }
.sel { height: 36px; padding: 0 12px 0 18px; border-radius: 8px; border-color: var(--border-strong); font-size: 14px; letter-spacing: 1.2px; gap: 8px; }
@media (max-width: 959px) {
  .chart { margin-top: 41px; }
  .outline-btn.icon { height: 36px; }
  .legend { margin: 9px 0 0 10px; }
}
</style>
