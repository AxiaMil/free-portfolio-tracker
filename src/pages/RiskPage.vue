<script setup lang="ts">
// Risk: pain / efficiency / exposure summary for a period, a drawdown or rolling-metric chart and the metric x period table.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { benchName, result } from '../store.ts';
import { primaryBench, riskPeriods } from '../composables/stats.ts';
import { riskMetrics } from '../engine/risk.ts';
import { periodBaseDate, type PeriodKey } from '../engine/periods.ts';
import { num, pct, shortDate, signClass } from '../format.ts';
import HelpTip from '../components/HelpTip.vue';
import ShareButton from '../components/ShareButton.vue';
import RiskChart from '../components/risk/RiskChart.vue';
import RiskTable from '../components/risk/RiskTable.vue';

const { mdAndUp } = useDisplay();
const period = ref<PeriodKey>('All');
watch(riskPeriods, (ps) => { if (!ps.includes(period.value)) period.value = 'All'; });
type Group = 'Pain' | 'Efficiency' | 'Exposure';
const tab = ref<Group>('Pain');

const bn = computed(() => benchName(primaryBench.value));
const m = computed(() => {
  const r = result.value;
  if (!r || r.series.length < 2) return null;
  return riskMetrics(r.series, period.value === 'All' ? null : periodBaseDate(period.value, r.today), r.today, primaryBench.value);
});

interface Kpi { label: string; help?: string; sub: string; subValue?: string; value: string; cls: string }
const DASH = '–';
const ratio = (v: number | null | undefined) => (v == null || !isFinite(v) ? DASH : num(v, 2));

/** before there is any history: the same grid, every measure dashed (beta's reference stays 1.00) */
function emptyGroups(b: string): Array<{ title: Group; rows: Kpi[] }> {
  const vs = `vs ${b}`;
  return [
    { title: 'Pain', rows: [
      { label: 'Max drawdown', help: 'Largest fall from a previous high to a low (time-weighted, so deposits and withdrawals do not count).', sub: `Trough ${DASH}`, value: DASH, cls: '' },
      { label: 'Current drawdown', sub: 'From all-time high, today', value: DASH, cls: '' },
      { label: 'Longest drawdown', sub: 'Longest stretch below a peak', value: '0d', cls: '' },
    ] },
    { title: 'Efficiency', rows: [
      { label: 'Sharpe ratio', help: 'Annualized return divided by annualized volatility. Higher means more return for each unit of risk.', sub: vs, subValue: DASH, value: DASH, cls: '' },
      { label: 'Sortino ratio', help: 'Like Sharpe, but only counts downside volatility (falling days).', sub: vs, subValue: DASH, value: DASH, cls: '' },
      { label: 'Calmar ratio', help: 'Annualized return (CAGR) divided by the size of the maximum drawdown.', sub: vs, subValue: DASH, value: DASH, cls: '' },
    ] },
    { title: 'Exposure', rows: [
      { label: 'Volatility (ann.)', sub: vs, subValue: DASH, value: DASH, cls: '' },
      { label: 'Beta', help: `How much the portfolio tends to move when ${b} moves 1%. 1.00 = same as the market.`, sub: vs, subValue: '1.00', value: DASH, cls: '' },
      { label: 'Alpha (ann.)', sub: `Excess over ${b}`, value: DASH, cls: '' },
    ] },
  ];
}

const groups = computed<Array<{ title: Group; rows: Kpi[] }>>(() => {
  const x = m.value;
  const b = bn.value;
  if (!x) return emptyGroups(b);
  const ok = x.enough;
  return [
    {
      title: 'Pain',
      rows: [
        { label: 'Max drawdown', help: 'Largest fall from a previous high to a low (time-weighted, so deposits and withdrawals do not count).', sub: x.maxDDDate ? `Trough ${shortDate(x.maxDDDate)}` : 'No drawdown', value: pct(x.maxDD, { sign: false }), cls: x.maxDD < 0 ? 'neg' : '' },
        { label: 'Current drawdown', sub: period.value === 'All' ? 'From all-time high, today' : 'From the period high, today', value: pct(x.currentDD, { sign: false }), cls: x.currentDD < 0 ? 'neg' : '' },
        { label: 'Longest drawdown', sub: 'Longest stretch below a peak', value: `${x.longestDD}d`, cls: '' },
      ],
    },
    {
      title: 'Efficiency',
      rows: [
        { label: 'Sharpe ratio', help: 'Annualized return divided by annualized volatility. Higher means more return for each unit of risk.', sub: `vs ${b}`, subValue: ratio(ok ? x.bench.sharpe : null), value: ratio(x.sharpe), cls: '' },
        { label: 'Sortino ratio', help: 'Like Sharpe, but only counts downside volatility (falling days).', sub: `vs ${b}`, subValue: ratio(ok ? x.bench.sortino : null), value: ratio(x.sortino), cls: '' },
        { label: 'Calmar ratio', help: 'Annualized return (CAGR) divided by the size of the maximum drawdown.', sub: `vs ${b}`, subValue: ratio(ok ? x.bench.calmar : null), value: ratio(x.calmar), cls: '' },
      ],
    },
    {
      title: 'Exposure',
      rows: [
        { label: 'Volatility (ann.)', sub: `vs ${b}`, subValue: pct(x.bench.vol, { sign: false }), value: pct(x.vol, { sign: false }), cls: '' },
        { label: 'Beta', help: `How much the portfolio tends to move when ${b} moves 1%. 1.00 = same as the market.`, sub: `vs ${b}`, subValue: '1.00', value: ratio(x.beta), cls: '' },
        { label: 'Alpha (ann.)', sub: `Excess over ${b}`, value: x.alpha == null ? DASH : pct(x.alpha), cls: signClass(x.alpha) },
      ],
    },
  ];
});
const visibleGroups = computed(() => (mdAndUp.value ? groups.value : groups.value.filter((g) => g.title === tab.value)));

function csv() {
  const rows: Array<Array<string>> = [['Group', 'Metric', `Value (${period.value})`, 'Benchmark / note']];
  for (const g of groups.value) for (const r of g.rows) rows.push([g.title, r.label, r.value, r.subValue ? `${r.sub} ${r.subValue}` : r.sub]);
  return rows;
}
</script>

<template>
  <div class="page risk">
    <div class="top">
      <h1 class="rtitle">Risk</h1>
      <div class="d-flex align-center ga-3">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <button v-bind="props" class="outline-btn pbtn">Period: {{ period }} <v-icon size="16">mdi-chevron-down</v-icon></button>
          </template>
          <v-list density="compact"><v-list-item v-for="p in riskPeriods" :key="p" :active="period === p" @click="period = p">{{ p }}</v-list-item></v-list>
        </v-menu>
        <ShareButton icon :csv="csv" filename="risk-summary" label="Export summary" />
      </div>
    </div>

    <div v-if="!mdAndUp" class="gtabs">
      <button v-for="g in (['Pain', 'Efficiency', 'Exposure'] as const)" :key="g" class="gtab" :class="{ active: tab === g }" @click="tab = g">{{ g }}</button>
    </div>

    <div class="kpis">
      <div v-for="g in visibleGroups" :key="g.title" class="kcol">
        <div v-if="mdAndUp" class="ktitle">{{ g.title }}</div>
        <div v-for="r in g.rows" :key="r.label" class="krow">
          <div class="kl">
            <div class="klabel">{{ r.label }} <HelpTip v-if="r.help" :text="r.help" :size="15" /></div>
            <div class="ksub">{{ r.sub }}<span v-if="r.subValue" class="ksv">{{ r.subValue }}</span></div>
          </div>
          <div class="kv" :class="r.cls">{{ r.value }}</div>
        </div>
      </div>
    </div>

    <RiskChart class="sec-chart" />
    <RiskTable class="sec-table" />
  </div>
</template>

<style scoped lang="scss">
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 8px; }
.rtitle { font-size: 16px; font-weight: 600; line-height: 28px; color: var(--text); margin: 0; letter-spacing: 0.15px; }
.pbtn { height: 28px; padding: 0 12px 0 14px; border-radius: 8px; border-color: var(--border-strong); font-size: 13.5px; letter-spacing: 1.2px; gap: 8px; }
.top :deep(.outline-btn.icon) { height: 28px; width: 40px; border-radius: 8px; border-color: var(--border-strong); }

.kpis { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 8px; }
.kcol { padding: 11px 17px 14px; border-left: 1px solid var(--border); min-width: 0; }
.kcol:first-child { border-left: 0; padding-left: 0; }
.kcol:last-child { padding-right: 0; }
.ktitle { font-size: 15px; font-weight: 500; line-height: 22px; color: var(--text); margin-bottom: 4px; }
.krow { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 49px; }
.kl { min-width: 0; }
.klabel { display: flex; align-items: center; gap: 5px; font-size: 14px; line-height: 19px; color: var(--muted); white-space: nowrap; }
.ksub { font-size: 12px; line-height: 16px; color: var(--muted); margin-top: 1px; white-space: nowrap; }
.ksv { font-family: var(--mono); font-weight: 600; color: var(--text); margin-left: 7px; }
.kv { font-family: var(--mono); font-size: 19px; font-weight: 500; color: var(--text); white-space: nowrap; letter-spacing: 0.2px; }
.kv.pos { color: var(--pos); }
.kv.neg { color: var(--neg); }
.sec-chart { margin-top: 36px; }
.sec-table { margin-top: 26px; }

.gtabs { display: flex; justify-content: space-between; margin-top: 14px; }
.gtab { background: none; border: 0; color: var(--muted); font: 500 16px/22px var(--font); padding: 6px 0; border-bottom: 2px solid transparent; cursor: pointer; }
.gtab.active { color: var(--primary-fg); font-weight: 600; border-bottom-color: var(--primary); }

@media (max-width: 959px) {
  .top { padding-top: 5px; }
  .gtabs { margin-top: 2px; }
  .rtitle { font-size: 18px; }
  .pbtn { height: 36px; font-size: 14px; padding: 0 12px 0 18px; }
  .top :deep(.outline-btn.icon) { height: 36px; }
  .kpis { grid-template-columns: 1fr; margin-top: 0; }
  .kcol { padding: 8px 0 0; border-left: 0; }
  .kv { font-size: 19px; }
  .sec-chart { margin-top: 48px; }
  .sec-table { margin-top: 49px; }
}
</style>
