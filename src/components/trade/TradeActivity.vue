<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// "Activity & Costs": buys vs sells per period (count, value or fees) and the per-period cost/turnover table.
import { computed, ref } from 'vue';
import VChart from 'vue-echarts';
import { useDisplay } from 'vuetify';
import { result } from '../../store.ts';
import { tradeActivity, type ActivityRow, type Bucket } from '../../engine/trades.ts';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../../charts.ts';
import { money, moneyAxis, pct } from '../../format.ts';
import PillToggle from '../PillToggle.vue';
import HelpTip from '../HelpTip.vue';
import ShareButton from '../ShareButton.vue';

const { mdAndUp } = useDisplay();
type Metric = 'Trade count' | 'Trade value' | 'Fees';
const metric = ref<Metric>('Trade count');
const bucket = ref<Bucket>('Annually');
const chart = ref();

const BUY = '#4C8DFF';

const data = computed(() => {
  const r = result.value;
  if (!r) return null;
  return tradeActivity(r.ledger, r.series, bucket.value);
});

const pick = (row: ActivityRow, side: 'buy' | 'sell') => {
  if (metric.value === 'Trade count') return side === 'buy' ? row.buys : row.sells;
  if (metric.value === 'Trade value') return side === 'buy' ? row.buyValue : row.sellValue;
  return side === 'buy' ? row.buyFees : row.sellFees;
};
const fmt = (v: number) => (metric.value === 'Trade count' ? String(v) : money(v));

const option = computed(() => {
  const rows = data.value?.rows ?? [];
  const mobile = !mdAndUp.value;
  const isCount = metric.value === 'Trade count';
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: mobile ? 48 : 64, right: 8, top: 16, bottom: 30 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid } },
      formatter: (items: any[]) => `<div style="margin-bottom:4px;color:${palette.axis}">${items[0]?.axisValue ?? ''}</div>` + items.map((i) => `<div style="display:flex;gap:16px;justify-content:space-between"><span>${i.marker}${i.seriesName}</span><b>${fmt(i.value)}</b></div>`).join(''),
    },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.label),
      axisLine: { lineStyle: { color: palette.axisLine, width: 1 } },
      axisTick: { show: false },
      axisLabel: { color: AXIS_COLOR, fontSize: 12, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      minInterval: isCount ? 1 : undefined,
      axisLabel: { color: AXIS_COLOR, fontSize: 12, formatter: (v: number) => (isCount ? String(v) : moneyAxis(v)) },
      splitLine: { lineStyle: { color: GRID_COLOR } },
    },
    series: [
      { name: 'Buy', type: 'bar', data: rows.map((r) => pick(r, 'buy')), itemStyle: { color: BUY, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 46, barGap: '12%' },
      { name: 'Sell', type: 'bar', data: rows.map((r) => pick(r, 'sell')), itemStyle: { color: palette.neg, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 46 },
    ],
  };
});

const tableRows = computed(() => [...(data.value?.rows ?? [])].reverse());
const pctOrDash = (v: number | null) => (v == null ? '-' : pct(v, { sign: false }));

function csv() {
  const rows = [...tableRows.value, ...(data.value ? [data.value.total] : [])];
  return [
    ['Period', 'Fees', '% Fees / Avg Value', '# Buy', '# Sell', '# Trade', 'Buy Value', 'Sell Value', 'Trade Value', 'Portfolio Turnover'],
    ...rows.map((r) => [r.label, +r.fees.toFixed(2), r.feePct == null ? '' : +(r.feePct * 100).toFixed(4), r.buys, r.sells, r.trades, +r.buyValue.toFixed(2), +r.sellValue.toFixed(2), +r.tradeValue.toFixed(2), r.turnover == null ? '' : +(r.turnover * 100).toFixed(4)]),
  ];
}
const FEE_HELP = 'Commissions in the period divided by the average daily portfolio value over the same period.';
const TURN_HELP = 'The lesser of purchases and sales in the period divided by the average portfolio value (buying with new money alone is not turnover).';
</script>

<template>
  <section class="act">
    <div class="act-title"><span>ACTIVITY &amp; COSTS</span><i /></div>
    <div class="act-controls">
      <PillToggle v-model="metric" :options="['Trade count', 'Trade value', 'Fees'] as const" />
      <div class="d-flex align-center ga-3">
        <PillToggle v-model="bucket" :options="['Monthly', 'Quarterly', 'Annually'] as const" />
        <ShareButton v-if="mdAndUp" icon :chart="chart"filename="trade-activity" />
      </div>
    </div>
    <div class="act-chart" :style="{ height: (mdAndUp ? 300 : 230) + 'px' }">
      <v-chart ref="chart" :option="option" autoresize />
    </div>
    <div class="legend">
      <span class="li"><i :style="{ background: BUY }" />Buy</span>
      <span class="li"><i :style="{ background: palette.neg }" />Sell</span>
    </div>

    <div v-if="data" class="card act-table">
      <div class="table-wrap">
        <table class="p-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Fees</th>
              <th>% Fees / Avg Value <HelpTip :size="13" icon="mdi-information" :text="FEE_HELP" /></th>
              <th># Buy</th>
              <th># Sell</th>
              <th># Trade</th>
              <th>Buy Value</th>
              <th>Sell Value</th>
              <th>Trade Value</th>
              <th>Portfolio Turnover <HelpTip :size="13" icon="mdi-information" :text="TURN_HELP" /></th>
              <th class="exp-col"><ShareButton icon :csv="csv" filename="trade-activity" label="Export table" class="exp" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in tableRows" :key="r.key">
              <td>{{ r.label }}</td>
              <td>{{ money(r.fees) }}</td>
              <td>{{ pctOrDash(r.feePct) }}</td>
              <td>{{ r.buys }}</td>
              <td>{{ r.sells }}</td>
              <td>{{ r.trades }}</td>
              <td>{{ money(r.buyValue) }}</td>
              <td>{{ money(r.sellValue) }}</td>
              <td>{{ money(r.tradeValue) }}</td>
              <td>{{ pctOrDash(r.turnover) }}</td>
              <td />
            </tr>
            <tr class="total">
              <td>{{ data.total.label }}</td>
              <td>{{ money(data.total.fees) }}</td>
              <td>{{ pctOrDash(data.total.feePct) }}</td>
              <td>{{ data.total.buys }}</td>
              <td>{{ data.total.sells }}</td>
              <td>{{ data.total.trades }}</td>
              <td>{{ money(data.total.buyValue) }}</td>
              <td>{{ money(data.total.sellValue) }}</td>
              <td>{{ money(data.total.tradeValue) }}</td>
              <td>{{ pctOrDash(data.total.turnover) }}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.act { margin-top: 56px; }
.act-title { display: flex; align-items: center; gap: 20px; font-size: 14px; letter-spacing: 0.5px; color: var(--text-2); i { flex: 1; height: 1px; background: var(--border); } }
.act-controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
.act-chart { position: relative; width: 100%; margin-top: 18px; }
.legend { display: flex; gap: 16px; justify-content: center; margin-top: 6px; font-size: 12.8px; color: var(--text); }
.li { display: inline-flex; align-items: center; gap: 6px; i { width: 12px; height: 12px; border-radius: 3px; } }
.act-table { margin-top: 22px; }
.table-wrap { overflow-x: auto; }
.p-table th:first-child, .p-table td:first-child { padding-left: 16px; }
.p-table tr.total td { font-weight: 600; border-top: 1px solid var(--border); background: var(--hover); }
.exp-col { width: 44px; text-align: right; padding-right: 10px !important; }
.exp { width: 32px; height: 32px; border: 0; color: var(--text-2); }
@media (max-width: 959px) {
  .act { margin-top: 64px; }
  .act-title { font-size: 14px; gap: 14px; }
  .act-controls { margin-top: 26px; }
}
</style>
