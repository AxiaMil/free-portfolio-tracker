<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// "Historical Return": per month / quarter / year bars vs the main benchmark, with a heat-coloured table below.
import { computed, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import { useDisplay } from 'vuetify';
import { benchName, result, store } from '../../store.ts';
import { primaryBench } from '../../composables/stats.ts';
import { HEAT_FULL, heatColor, historical, type Bucket, type BucketRow } from '../../engine/perf.ts';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../../charts.ts';
import { money, moneyAxis, pct, signClass } from '../../format.ts';
import PillToggle from '../PillToggle.vue';
import HelpTip from '../HelpTip.vue';
import ShareButton from '../ShareButton.vue';

const { mdAndUp } = useDisplay();
const bucket = ref<Bucket>('Monthly');
const mode = ref<'Return' | 'Balance'>('Return');
const excess = ref(false);
const vchart = ref();
const chartInst = computed(() => vchart.value?.chart);

const bench = computed(() => primaryBench.value);
const bn = computed(() => benchName(bench.value));
const rows = computed<BucketRow[]>(() => {
  const r = result.value;
  if (!r || !r.series.length) return [];
  return historical(r.series, bucket.value, store.method, bench.value);
});
const full = computed(() => HEAT_FULL[bucket.value]);

// ---------- chart ----------
const radius = (v: number) => (v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3]);

const option = computed(() => {
  const data = rows.value;
  const mobile = !mdAndUp.value;
  const keys = data.map((d) => d.key);
  const n = keys.length;
  const visible = mobile ? 6 : 12;
  const isBal = mode.value === 'Balance';
  const portVal = (d: BucketRow) => (isBal ? d.port?.endValue ?? null : d.port?.pct ?? null);
  const benchVal = (d: BucketRow) => (isBal ? d.bench?.endValue ?? null : d.bench?.pct ?? null);
  const exVal = (d: BucketRow) => (isBal ? (d.port && d.bench ? d.port.gain - d.bench.gain : null) : d.excess);
  const wide = mobile ? 16 : 24;
  const series: any[] = [];
  if (excess.value) {
    series.push({
      name: `vs ${bn.value}`, type: 'bar', barWidth: wide,
      data: data.map((d) => { const v = exVal(d); return { value: v, itemStyle: { color: (v ?? 0) >= 0 ? palette.pos : palette.neg, borderRadius: radius(v ?? 0) } }; }),
    });
  } else {
    series.push({
      name: 'My Portfolio', type: 'bar', barWidth: wide, z: 3,
      data: data.map((d) => {
        const v = portVal(d);
        const up = isBal ? (d.port?.gain ?? 0) >= 0 : (v ?? 0) >= 0;
        return { value: v, itemStyle: { color: up ? palette.pos : palette.neg, borderRadius: isBal ? [3, 3, 0, 0] : radius(v ?? 0) } };
      }),
    });
    series.push({
      name: bn.value, type: 'bar', barWidth: mobile ? 8 : 11, barGap: '-15%', z: 2,
      data: data.map((d) => {
        const v = benchVal(d);
        const up = isBal ? (d.bench?.gain ?? 0) >= 0 : (v ?? 0) >= 0;
        return { value: v, itemStyle: { color: up ? alpha(palette.pos, 0.3) : alpha(palette.neg, 0.3), borderRadius: isBal ? [2, 2, 0, 0] : radius(v ?? 0) } };
      }),
    });
    if (isBal) {
      const r = result.value;
      const dates = r?.series.map((p) => p.date) ?? [];
      const depAt = (end: string) => { const i = dates.lastIndexOf(end); return i >= 0 ? r!.series[i].netDeposits : null; };
      series.push({
        name: 'Net Deposits', type: 'line', step: 'middle', symbol: 'none', z: 4,
        lineStyle: { color: palette.bench, width: 1.5, type: 'dashed' }, itemStyle: { color: palette.bench },
        data: data.map((d) => depAt(d.end)),
      });
    }
  }
  const fmtV = (v: number) => (isBal ? money(v, { sign: excess.value }) : pct(v));
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: mobile ? { left: 44, right: 8, top: 18, bottom: 92 } : { left: 58, right: 12, top: 38, bottom: 59 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid } },
      formatter: (items: any[]) => {
        if (!items.length) return '';
        const d = data[items[0].dataIndex];
        const head = `<div style="margin-bottom:4px;color:${palette.axis}">${d.key} <span style="opacity:.7">(${d.start} → ${d.end})</span></div>`;
        const row = (l: string, v: string, c = '') => `<div style="display:flex;gap:18px;justify-content:space-between"><span>${l}</span><b style="${c}">${v}</b></div>`;
        if (isBal && !excess.value) {
          return head + row('Starting balance', money(d.port?.startValue)) + row('Net deposits', money(d.port?.netFlows, { sign: true })) + row('Gain', money(d.port?.gain, { sign: true })) + row('Ending balance', money(d.port?.endValue)) + row(`What if ${bn.value}`, money(d.bench?.endValue));
        }
        return head + items.filter((i) => i.value != null).map((i) => row(`${i.marker}${i.seriesName}`, fmtV(i.value))).join('') + (!excess.value && !isBal && d.excess != null ? row(`vs ${bn.value}`, pct(d.excess)) : '');
      },
    },
    xAxis: {
      type: 'category',
      data: keys,
      axisLine: { onZero: false, lineStyle: { color: palette.axisLine, width: 1 } },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, fontSize: mobile ? 12 : 12.8, margin: mobile ? 10 : 18, rotate: mobile ? 45 : 0, interval: 0 },
    },
    yAxis: {
      type: 'value',
      splitNumber: mobile ? 2 : 4,
      axisLabel: { color: AXIS_COLOR, fontSize: 12, formatter: (v: number) => (isBal ? moneyAxis(v) : `${+(v * 100).toFixed(0)}%`) },
      splitLine: { lineStyle: { color: GRID_COLOR } },
    },
    dataZoom: [{
      type: 'slider', xAxisIndex: 0, startValue: Math.max(0, n - visible), endValue: Math.max(0, n - 1),
      height: mobile ? 10 : 11, bottom: mobile ? 8 : 6, showDetail: false, showDataShadow: false, brushSelect: false, zoomLock: false,
      borderColor: 'transparent', backgroundColor: palette.navigatorBg, fillerColor: palette.navigatorData,
      handleIcon: 'path://M0,0 L1,0 L1,1 L0,1 Z', handleSize: '100%', handleStyle: { color: palette.navigatorData, borderColor: 'transparent' },
      moveHandleSize: 0, labelFormatter: '', minValueSpan: Math.min(n - 1, 2), borderRadius: 6,
    }],
    series,
  };
});

// ---------- table ----------
type SortKey = 'period' | 'port' | 'bench' | 'excess' | 'start' | 'flows' | 'gain' | 'end';
const sortKey = ref<SortKey>('period');
const sortDesc = ref(true);
watch(mode, () => { sortKey.value = 'period'; sortDesc.value = true; });
function sortBy(k: SortKey) {
  if (sortKey.value === k) sortDesc.value = !sortDesc.value;
  else { sortKey.value = k; sortDesc.value = true; }
}
const sortVal = (d: BucketRow, k: SortKey): number | string => {
  switch (k) {
    case 'period': return d.key;
    case 'port': return d.port?.pct ?? -Infinity;
    case 'bench': return d.bench?.pct ?? -Infinity;
    case 'excess': return d.excess ?? -Infinity;
    case 'start': return d.port?.startValue ?? -Infinity;
    case 'flows': return d.port?.netFlows ?? -Infinity;
    case 'gain': return d.port?.gain ?? -Infinity;
    case 'end': return d.port?.endValue ?? -Infinity;
  }
};
const tableRows = computed(() => {
  const k = sortKey.value;
  const dir = sortDesc.value ? -1 : 1;
  return [...rows.value].sort((a, b) => {
    const x = sortVal(a, k);
    const y = sortVal(b, k);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
});
const columns = computed(() => (mode.value === 'Return'
  ? [{ k: 'port', l: 'My Portfolio' }, { k: 'bench', l: bn.value }, { k: 'excess', l: `vs ${bn.value}` }]
  : [{ k: 'start', l: 'Starting Balance' }, { k: 'flows', l: 'Net Deposits' }, { k: 'gain', l: 'Gain' }, { k: 'end', l: 'Ending Balance' }, { k: 'port', l: 'Return' }]) as Array<{ k: SortKey; l: string }>);

const HELP = 'Return of each calendar month, quarter or year using the selected method, next to the main benchmark (as if every deposit had bought it). Excess Return shows the difference. Balance shows starting and ending value, deposits and gain of each period.';
const METHOD_HELP = 'MWR (money-weighted, XIRR) counts the size and timing of your deposits. TWR (time-weighted) measures the investments only. SR (simple return) = gain / invested capital.';
</script>

<template>
  <section class="hr">
    <div class="head">
      <h2 class="section-title d-flex align-center ga-2">Historical Return <HelpTip :text="HELP" :size="18" /></h2>
      <label class="ex">
        <span>Excess Return</span>
        <button class="sw" :class="{ on: excess }" role="switch" :aria-checked="excess" aria-label="Excess Return" @click="excess = !excess"><i /></button>
      </label>
    </div>

    <div class="chart" :style="{ height: (mdAndUp ? 272 : 262) + 'px' }">
      <v-chart v-if="rows.length" ref="vchart" :option="option" autoresize />
      <div v-else class="empty muted">No history yet.</div>
    </div>
    <div v-if="mode === 'Balance' && !excess && rows.length" class="blegend">
      <span><i class="sq up" />My Portfolio (ending balance)</span>
      <span><i class="sq dim" />What if {{ bn }}</span>
      <span><i class="dash" />Net deposits</span>
    </div>

    <div v-if="mdAndUp" class="ctl">
      <div class="col">
        <PillToggle v-model="bucket" :options="['Monthly', 'Quarterly', 'Annually'] as const" />
        <PillToggle v-model="mode" :options="['Return', 'Balance'] as const" />
      </div>
      <div class="col end">
        <div class="d-flex align-center ga-3"><HelpTip :text="METHOD_HELP" :size="18" /><PillToggle v-model="store.method" :options="['MWR', 'TWR', 'SR'] as const" /></div>
        <ShareButton :chart="chartInst" filename="historical-return" />
      </div>
    </div>
    <div v-else class="ctl m">
      <PillToggle v-model="bucket" :options="['Monthly', 'Quarterly', 'Annually'] as const" />
      <div class="d-flex align-center justify-space-between">
        <PillToggle v-model="mode" :options="['Return', 'Balance'] as const" />
        <ShareButton :chart="chartInst" filename="historical-return" />
      </div>
      <div class="d-flex align-center ga-2"><PillToggle v-model="store.method" :options="['MWR', 'TWR', 'SR'] as const" /><HelpTip :text="METHOD_HELP" :size="18" /></div>
    </div>

    <div class="card hcard" :class="mode === 'Balance' ? 'bal' : 'ret'">
      <table class="heat">
        <thead>
          <tr>
            <th class="pcol" @click="sortBy('period')">
              <span class="th-in">Period <v-icon size="16" :class="{ off: sortKey !== 'period' }">{{ sortKey === 'period' && !sortDesc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}</v-icon></span>
            </th>
            <th v-for="c in columns" :key="c.k" @click="sortBy(c.k)">
              <span class="th-in">{{ c.l }} <v-icon size="16" :class="{ off: sortKey !== c.k }">{{ sortKey === c.k && !sortDesc ? 'mdi-arrow-up' : 'mdi-arrow-down' }}</v-icon></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in tableRows" :key="d.key">
            <td class="pcol">{{ d.key }}</td>
            <template v-if="mode === 'Return'">
              <td :style="{ background: heatColor(d.port?.pct, full) }">{{ d.port ? pct(d.port.pct, { sign: false }) : '-' }}</td>
              <td :style="{ background: heatColor(d.bench?.pct, full) }">{{ d.bench ? pct(d.bench.pct, { sign: false }) : '-' }}</td>
              <td :style="{ background: heatColor(d.excess, full) }">{{ d.excess != null ? pct(d.excess, { sign: false }) : '-' }}</td>
            </template>
            <template v-else>
              <td class="plain">{{ money(d.port?.startValue, { decimals: 'auto' }) }}</td>
              <td class="plain">{{ money(d.port?.netFlows, { decimals: 'auto', sign: true }) }}</td>
              <td class="plain" :class="signClass(d.port?.gain)">{{ money(d.port?.gain, { decimals: 'auto', sign: true }) }}</td>
              <td class="plain">{{ money(d.port?.endValue, { decimals: 'auto' }) }}</td>
              <td :style="{ background: heatColor(d.port?.pct, full) }">{{ d.port ? pct(d.port.pct, { sign: false }) : '-' }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped lang="scss">
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ex { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-2); cursor: pointer; user-select: none; }
.sw { position: relative; width: 38px; height: 22px; border: 0; background: none; padding: 0; cursor: pointer; flex: 0 0 auto;
  &::before { content: ''; position: absolute; left: 4px; right: 0; top: 4px; height: 14px; border-radius: 7px; background: var(--faint); transition: background-color 0.15s ease; }
  i { position: absolute; left: 0; top: 1px; width: 20px; height: 20px; border-radius: 50%; background: var(--primary-text); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); transition: transform 0.15s ease; }
  &.on::before { background: var(--primary); }
  &.on i { transform: translateX(18px); background: var(--text); }
}
.chart { position: relative; margin-top: 8px; }
.blegend { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; margin-top: 6px; font-size: 12.8px; color: var(--text-2);
  span { display: inline-flex; align-items: center; gap: 6px; }
  .sq { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .sq.up { background: var(--pos); }
  .sq.dim { background: var(--pos-soft); }
  .dash { width: 16px; border-top: 1.5px dashed var(--text-2); display: inline-block; }
}
.empty { display: flex; height: 100%; align-items: center; justify-content: center; }
.ctl { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 22px; gap: 12px; }
.ctl .col { display: flex; flex-direction: column; gap: 5px; align-items: flex-start; }
.ctl .col.end { align-items: flex-end; }
.ctl.m { flex-direction: column; align-items: stretch; gap: 8px; margin-top: 30px; > * { max-width: 100%; } }
.ctl.m > .pill-group { align-self: flex-start; }

.hcard { margin-top: 18px; padding: 0 2px 2px 0; overflow: hidden; }
.heat { width: 100%; border-collapse: separate; border-spacing: 3px; table-layout: fixed; color: var(--text); }
.heat th { height: 48px; font: 500 13px/17px var(--font); color: var(--text); text-align: center; vertical-align: middle; cursor: pointer; user-select: none; padding: 0 4px; position: relative; }
.heat th::after { content: ''; position: absolute; left: -3px; right: -3px; bottom: 0; height: 1px; background: var(--border); }
.heat th.pcol { text-align: left; padding-left: 30px; width: 110px; }
.th-in { display: inline-flex; align-items: center; gap: 2px; }
.th-in .v-icon { color: var(--text); }
.th-in .v-icon.off { opacity: 0; }
.heat th:hover .v-icon.off { opacity: 0.45; }
.heat td { height: 52px; text-align: center; font: 400 16px/20px var(--font); white-space: nowrap; }
.heat td.pcol { font-weight: 700; font-size: 17px; text-align: left; padding-left: 32px; }
.heat td.plain { font-size: 14.5px; color: var(--text); }
.heat td.plain.pos { color: var(--pos); }
.heat td.plain.neg { color: var(--neg); }

@media (max-width: 959px) {
  .head { margin-top: 0; }
  .hcard { margin-top: 18px; max-height: 636px; overflow: auto; }
  .heat thead th { position: sticky; top: 0; background: var(--bg); z-index: 1; }
  .heat th { height: 66px; font-size: 12px; white-space: normal; padding: 0 2px; }
  .heat th.pcol { width: 96px; padding-left: 20px; }
  .heat td { height: 52px; font-size: 15.5px; }
  .heat td.pcol { font-size: 16.5px; padding-left: 20px; }
  .hcard.bal { overflow-x: auto; .heat { min-width: 640px; } }
  .th-in { flex-wrap: wrap; justify-content: center; }
}
</style>
