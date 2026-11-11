<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// "My Holdings" gain chart: grouping x metric x period, bar or treemap.
import { computed, ref } from 'vue';
import VChart from 'vue-echarts';
import { useDisplay } from 'vuetify';
import { result, marketView } from '../store.ts';
import { periodBaseDate, type PeriodKey } from '../engine/periods.ts';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../charts.ts';
import { money, moneyAxis, pct } from '../format.ts';
import PillToggle from './PillToggle.vue';

const { mdAndUp } = useDisplay();
type Group = 'Ticker' | 'Sector' | 'Industry' | 'Country' | 'Assets Type';
type Metric = 'Gain (Value)' | 'Gain (%)' | 'Price (%)';
const group = ref<Group>('Ticker');
const metric = ref<Metric>('Gain (Value)');
const period = ref<string>('1d');
const desc = ref(true);
const mode = ref<'bar' | 'treemap'>('bar');
const PERIODS = ['1d', '1w', '1m', '3m', '6m', 'Ytd', '1y', 'All'];
const KEY: Record<string, PeriodKey> = { '1d': '1D', '1w': '1W', '1m': '1M', '3m': '3M', '6m': '6M', Ytd: 'YTD', '1y': '1Y', All: 'All' };

function pickPeriod(p: string) {
  if (period.value === p) desc.value = !desc.value;
  else { period.value = p; desc.value = true; }
}

const items = computed(() => {
  const r = result.value;
  if (!r) return [];
  const mv = marketView.value;
  const key = KEY[period.value];
  const base = key === 'All' ? null : periodBaseDate(key, r.today);
  const rows = r.holdings.map((h) => {
    let gain = 0;
    let denom = 0;
    let priceChg = 0;
    if (key === '1D') {
      gain = h.dayGain;
      denom = h.dayGainPct ? h.dayGain / h.dayGainPct : 0;
      priceChg = h.prevClose ? (h.last ?? 0) / h.prevClose - 1 : 0;
    } else if (!base || base < h.firstDate) {
      gain = h.totalGain;
      denom = h.totalReturn ? h.totalGain / h.totalReturn : h.costValue;
      const p0 = mv.priceAt(h.symbol, h.firstDate);
      priceChg = p0 ? (h.last ?? 0) / p0 - 1 : 0;
    } else {
      const ccy = h.currency;
      let sharesAt = 0;
      let flows = 0;
      let buys = 0;
      for (const e of r.ledger) {
        if (e.symbol !== h.symbol || e.status !== 'confirmed') continue;
        const f = mv.splitFactorAfter(h.symbol, e.date);
        const signed = e.action === 'Buy' || e.action === 'Transfer in' || e.action === 'Stock dividend' ? 1 : e.action === 'Sell' || e.action === 'Transfer out' ? -1 : 0;
        if (e.date <= base) sharesAt += signed * e.shares * f;
        else if (signed) { flows += signed * (e.amountBase + signed * e.commissionBase); if (signed > 0) buys += e.amountBase; }
        else if (e.action === 'Dividend' && e.date > base) flows -= e.amountBase;
      }
      const p0 = mv.priceAt(h.symbol, base) ?? 0;
      const mv0 = sharesAt * p0 * mv.fxAt(ccy, base);
      gain = h.marketValue - mv0 - flows;
      denom = mv0 + buys;
      priceChg = p0 ? (h.last ?? 0) / p0 - 1 : 0;
    }
    return { h, gain, denom, priceChg };
  });
  const groups = new Map<string, { name: string; gain: number; denom: number; priceW: number; mv: number }>();
  for (const x of rows) {
    const name = group.value === 'Ticker' ? x.h.symbol : group.value === 'Sector' ? x.h.sector : group.value === 'Industry' ? x.h.industry : group.value === 'Country' ? x.h.country : x.h.assetType;
    const g = groups.get(name) ?? { name, gain: 0, denom: 0, priceW: 0, mv: 0 };
    g.gain += x.gain;
    g.denom += x.denom;
    g.priceW += x.priceChg * x.h.marketValue;
    g.mv += x.h.marketValue;
    groups.set(name, g);
  }
  const out = [...groups.values()].map((g) => ({
    name: g.name,
    mv: g.mv,
    value: metric.value === 'Gain (Value)' ? g.gain : metric.value === 'Gain (%)' ? (g.denom ? g.gain / g.denom : 0) : g.mv ? g.priceW / g.mv : 0,
  }));
  out.sort((a, b) => (desc.value ? b.value - a.value : a.value - b.value));
  return out;
});

const fmt = (v: number) => (metric.value === 'Gain (Value)' ? money(v, { sign: true }) : pct(v));

const option = computed(() => {
  const data = items.value;
  if (mode.value === 'treemap') {
    const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1e-9);
    return {
      tooltip: { ...tooltipBase, formatter: (p: any) => `${p.name}<br/><b>${fmt(p.data.metric)}</b>` },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%',
        label: { show: true, formatter: (p: any) => `{a|${p.name}}\n{b|${fmt(p.data.metric)}}`, rich: { a: { fontSize: 14, fontWeight: 700, color: palette.text, fontFamily: FONT }, b: { fontSize: 12, color: palette.text, fontFamily: FONT } } },
        itemStyle: { borderColor: palette.surface, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
        data: data.map((d) => {
          const t = Math.min(1, Math.abs(d.value) / maxAbs);
          const color = alpha(d.value >= 0 ? palette.pos : palette.neg, 0.18 + 0.62 * t);
          return { name: d.name, value: Math.max(d.mv, 1), metric: d.value, itemStyle: { color } };
        }),
      }],
    };
  }
  const many = data.length > (mdAndUp.value ? 22 : 9);
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 62, right: 12, top: 12, bottom: many ? 74 : 60 },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any[]) => `${ps[0].name}<br/><b>${fmt(ps[0].value)}</b>` },
    xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { color: AXIS_COLOR, rotate: 45, fontSize: 12, interval: 0 }, axisLine: { lineStyle: { color: palette.axisLine } }, axisTick: { show: false } },
    yAxis: { type: 'value', splitNumber: 3, axisLabel: { color: AXIS_COLOR, fontSize: 12, formatter: (v: number) => (metric.value === 'Gain (Value)' ? moneyAxis(v) : `${(v * 100).toFixed(0)}%`) }, splitLine: { lineStyle: { color: GRID_COLOR } } },
    dataZoom: [{ type: 'slider', show: true, height: 8, bottom: 4, startValue: 0, endValue: many ? (mdAndUp.value ? 21 : 8) : data.length - 1, showDetail: false, showDataShadow: false, brushSelect: false, borderColor: 'transparent', backgroundColor: palette.navigatorBg, fillerColor: palette.navigatorData, handleSize: 0, moveHandleSize: 0 }],
    series: [{ type: 'bar', barMaxWidth: 26, data: data.map((d) => ({ value: d.value, itemStyle: { color: d.value >= 0 ? palette.pos : palette.neg, borderRadius: d.value >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } })) }],
  };
});
</script>

<template>
  <div class="hc">
    <div class="ctl"><PillToggle v-model="group" :options="['Ticker', 'Sector', 'Industry', 'Country', 'Assets Type'] as const" /></div>
    <div class="ctl"><PillToggle v-model="metric" :options="['Gain (Value)', 'Gain (%)', 'Price (%)'] as const" /></div>
    <div class="ctl row2">
      <div class="periods">
        <button v-for="p in PERIODS" :key="p" class="per" :class="{ active: period === p }" @click="pickPeriod(p)">
          <v-icon v-if="period === p" size="14">{{ desc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon>{{ p }}
        </button>
      </div>
      <div class="pill-group">
        <button class="pill" :class="{ active: mode === 'bar' }" aria-label="Bar chart" @click="mode = 'bar'"><v-icon size="18">mdi-chart-bar</v-icon></button>
        <button class="pill" :class="{ active: mode === 'treemap' }" aria-label="Treemap" @click="mode = 'treemap'"><v-icon size="18">mdi-view-quilt</v-icon></button>
      </div>
    </div>
    <div class="chart" :style="{ height: 250 + 'px' }"><v-chart :option="option" autoresize /></div>
  </div>
</template>

<style scoped lang="scss">
.hc { padding: 0 6px; }
.ctl { margin-bottom: 8px; padding-left: 6px; overflow-x: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
.row2 { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; margin-bottom: 12px; }
.periods { display: flex; gap: 2px; align-items: center; }
.per { background: none; border: 1px solid transparent; color: var(--muted); font: 500 12px/16px var(--font); height: 26px; padding: 4px 9px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; &:hover { color: var(--text-2); } }
.per.active { color: var(--text); border-color: var(--border-strong); font-weight: 700; }
.pill-group .pill { padding: 4px 14px; display: inline-flex; }
.chart { position: relative; }
@media (max-width: 959px) {
  .hc { padding: 0; }
  .ctl { padding-left: 0; padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
  .row2 { flex-wrap: wrap; justify-content: flex-end; margin-top: 4px; .periods { width: 100%; } }
}
</style>
