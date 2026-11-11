<script setup lang="ts">
// Allocation: donut by ticker (value / cost / gain / loss) and by attribute (sector, country, ...), key figures, holdings table.
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { refreshMarket, result, store } from '../store.ts';
import { alloc, money } from '../format.ts';
import PillToggle from '../components/PillToggle.vue';
import HelpTip from '../components/HelpTip.vue';
import HoldingsTable from '../components/HoldingsTable.vue';
import AllocDonut from '../components/alloc/AllocDonut.vue';
import ShareCharts from '../components/alloc/ShareCharts.vue';
import { groupSlices, tickerSlices, type GroupKey, type TickerMetric } from '../components/alloc/allocData.ts';

const { mdAndUp } = useDisplay();

const TICKER_MODES = ['Market Value', 'Cost', 'Gain', 'Loss'] as const;
const GROUP_MODES = ['Sector', 'Industry', 'Country', 'Region', 'Market', 'Assets Type'] as const;
const metric = ref<TickerMetric>('Market Value');
const group = ref<GroupKey>('Sector');

const left = ref();
const right = ref();
const charts = computed(() => [left.value?.chart, right.value?.chart]);

const tickerItems = computed(() => {
  const r = result.value;
  if (!r) return [];
  return tickerSlices(r.holdings, metric.value === 'Cost' ? r.cashRow.costValue : r.cash, r.base, metric.value);
});
const groupItems = computed(() => {
  const r = result.value;
  if (!r) return [];
  return groupSlices(r.holdings, r.cash, r.base, group.value);
});

const EMPTY: Record<TickerMetric, string> = {
  'Market Value': 'No holdings yet', Cost: 'No holdings yet', Gain: 'No position is in profit', Loss: 'No position is at a loss',
};
const valueFmt = computed(() => (metric.value === 'Loss' ? (v: number) => money(-v) : metric.value === 'Gain' ? (v: number) => money(v, { sign: true }) : (v: number) => money(v)));

const CASH_HELP = 'Uninvested cash in this portfolio: deposits, dividends and sale proceeds minus purchases, fees, taxes and withdrawals.';

function csv(): Array<Array<string | number>> {
  const share = (items: Array<{ value: number }>, v: number) => {
    const t = items.reduce((s, x) => s + x.value, 0);
    return t ? ((v / t) * 100).toFixed(2) + '%' : '';
  };
  return [
    ['By ticker', metric.value, 'Share'],
    ...tickerItems.value.map((x) => [x.name, x.value.toFixed(2), share(tickerItems.value, x.value)]),
    [],
    [`By ${group.value.toLowerCase()}`, 'Market Value', 'Share'],
    ...groupItems.value.map((x) => [x.name, x.value.toFixed(2), share(groupItems.value, x.value)]),
  ];
}
</script>

<template>
  <div v-if="result" class="page alloc">
    <div class="share-row">
      <ShareCharts :charts="charts" :csv="csv" filename="allocation" />
    </div>

    <div class="charts">
      <section class="chart-col">
        <div class="ctl">
          <PillToggle v-model="metric" :options="TICKER_MODES" />
          <v-tooltip text="Refresh prices">
            <template #activator="{ props }">
              <button v-bind="props" class="sync" :class="{ spinning: store.refreshing }" aria-label="Refresh prices" @click="refreshMarket(true)"><v-icon size="17">mdi-sync</v-icon></button>
            </template>
          </v-tooltip>
        </div>
        <AllocDonut
          ref="left"
          :items="tickerItems"
          :height="mdAndUp ? 404 : 250"
          :font-size="mdAndUp ? 13 : 10"
          :max-radius="mdAndUp ? 158 : 88"
          :label-max-width="mdAndUp ? 176 : 100"
          :value-formatter="valueFmt"
          :empty-text="EMPTY[metric]"
        />
      </section>

      <div v-if="!mdAndUp" class="divider" />

      <section class="chart-col">
        <div class="ctl">
          <PillToggle v-model="group" class="grp" :options="GROUP_MODES" />
        </div>
        <AllocDonut
          ref="right"
          :items="groupItems"
          :height="mdAndUp ? 404 : 262"
          :font-size="mdAndUp ? 13 : 10"
          :max-radius="mdAndUp ? 158 : 88"
          :label-max-width="mdAndUp ? 176 : 100"
          empty-text="No holdings yet"
        />
      </section>
    </div>

    <div v-if="!mdAndUp" class="divider kpi-div" />

    <div class="kpis">
      <div class="kpi">
        <div class="k-lbl">Portfolio Value</div>
        <div class="k-val">{{ money(result.value, { decimals: 'auto' }) }}</div>
      </div>
      <div class="kpi">
        <div class="k-lbl">Number of holdings</div>
        <div class="k-val">{{ result.holdings.length }}</div>
      </div>
      <div class="kpi">
        <div class="k-lbl">Cash on hand <HelpTip :text="CASH_HELP" :size="15" icon="mdi-information" /></div>
        <div class="k-val">{{ money(result.cash) }}</div>
      </div>
      <div class="kpi">
        <div class="k-lbl">Cash (% of portfolio)</div>
        <div class="k-val">{{ alloc(result.cashRow.allocation) }}</div>
      </div>
    </div>

    <div class="table-gap"><HoldingsTable /></div>
  </div>
</template>

<style scoped lang="scss">
.share-row { display: flex; justify-content: flex-end; margin: 6px 8px 0 0; min-height: 28px; }
.charts { display: grid; grid-template-columns: 1fr 1fr; margin-top: 8px; }
.chart-col { min-width: 0; }
.ctl { display: flex; align-items: center; justify-content: center; gap: 14px; min-height: 33px; }
.sync {
  background: none; border: 0; padding: 2px; color: var(--text); cursor: pointer; display: inline-flex; border-radius: 50%;
  &:hover { background: var(--line-soft); }
  &.spinning .v-icon { animation: alloc-spin 0.9s linear infinite; }
}
@keyframes alloc-spin { to { transform: rotate(360deg); } }
.ctl :deep(.pill) { padding-left: 13px; padding-right: 13px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 22px; }
.kpi { text-align: center; min-width: 0; }
.k-lbl { font-size: 14px; line-height: 20px; color: var(--text); display: inline-flex; align-items: center; gap: 12px; }
.k-lbl :deep(.help-tip) { color: var(--text); }
.k-val { font-size: 22px; line-height: 30px; font-weight: 500; color: var(--text); margin-top: 2px; white-space: nowrap; }
.table-gap { margin-top: 36px; }
.divider { height: 1px; background: var(--border); }

@media (max-width: 959px) {
  .share-row { margin: 10px 2px 0 0; }
  .charts { grid-template-columns: 1fr; margin-top: 24px; }
  .ctl :deep(.pill) { padding-left: 11px; padding-right: 11px; }
  .chart-col + .divider { margin: 4px 4px 0; }
  .divider + .chart-col .ctl { margin-top: 16px; }
  .grp { flex-wrap: wrap; border-radius: 24px; width: 100%; justify-content: flex-start; padding: 4px 6px; }
  .ctl .grp :deep(.pill) { font-size: 13.5px; padding: 5px 10px; }
  .kpi-div { margin: 26px 4px 0; }
  .kpis { grid-template-columns: 1fr 1fr; row-gap: 44px; margin-top: 40px; }
  .table-gap { margin-top: 38px; }
}
</style>
