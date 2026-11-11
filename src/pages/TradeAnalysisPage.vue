<script setup lang="ts">
import { palette } from '../theme.ts';
// Trade Analysis: price chart with buy/sell flags, lot win rates vs the benchmark, the lot list and trading activity & costs.
import { computed, nextTick, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { activePortfolio, benchName, marketView, result, store } from '../store.ts';
import { buildTradeLots, tradeStats, type TradeLot } from '../engine/trades.ts';
import type { LedgerEntry } from '../engine/types.ts';
import { lastIndexLE } from '../engine/util.ts';
import { ccySymbol, pct, price, shares } from '../format.ts';
import PillToggle from '../components/PillToggle.vue';
import FlagChart, { type Flag } from '../components/trade/FlagChart.vue';
import TradeKpis from '../components/trade/TradeKpis.vue';
import LotTable from '../components/trade/LotTable.vue';
import TradeActivity from '../components/trade/TradeActivity.vue';

const { mdAndUp } = useDisplay();
type Mode = 'Price' | '%Off High';
type Side = 'All' | 'Long' | 'Short';
type Outcome = 'All' | 'Winners' | 'Losers';
const ZOOMS = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'];

const mode = ref<Mode>('Price');
const eventFlag = ref(true);
const chartTicker = ref<string | null>(null);
const side = ref<Side>('All');
const outcome = ref<Outcome>('All');
const ticker = ref<string | null>(null);
const lotState = ref<string[]>([]);
const ccyFilter = ref<string[]>([]);
const chartBox = ref<HTMLElement>();

const bench = computed(() => activePortfolio.value?.benchmark ?? '^GSPC');
const benchLabel = computed(() => benchName(bench.value));
const method = computed(() => store.state?.preferences.costMethod ?? 'FIFO');
function setMethod(m: 'FIFO' | 'Average') {
  if (store.state && store.state.preferences.costMethod !== m) store.state.preferences.costMethod = m;
}

// ---------------- lots + filters ----------------
const lots = computed<TradeLot[]>(() => {
  const r = result.value;
  const p = activePortfolio.value;
  if (!r || !p) return [];
  return buildTradeLots(r.ledger, marketView.value, { costMethod: method.value, today: r.today, benchmark: bench.value, margin: p.margin });
});

const tickers = computed(() => {
  const seen = new Map<string, string>();
  for (const l of lots.value) if (!seen.has(l.symbol)) seen.set(l.symbol, l.name);
  return [...seen].sort((a, b) => a[0].localeCompare(b[0])).map(([value, name]) => ({ value, title: value, name }));
});
const currencies = computed(() => [...new Set(lots.value.map((l) => l.currency))].sort());

/** lots in scope for the KPIs (everything except the winners/losers split) */
const scoped = computed(() => lots.value.filter((l) =>
  (side.value === 'All' || l.side === side.value.toLowerCase())
  && (!ticker.value || l.symbol === ticker.value)
  && (!lotState.value.length || lotState.value.includes(l.closeDate ? 'Closed' : 'Open'))
  && (!ccyFilter.value.length || ccyFilter.value.includes(l.currency))));
const shown = computed(() => (outcome.value === 'All' ? scoped.value : scoped.value.filter((l) => (outcome.value === 'Winners' ? l.totalGain > 0 : l.totalGain <= 0))));
const stats = computed(() => tradeStats(scoped.value));
const extraFilters = computed(() => lotState.value.length + ccyFilter.value.length);

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
function toggleSide(s: 'Long' | 'Short') { side.value = side.value === s ? 'All' : s; }

watch(ticker, (t) => { chartTicker.value = t; });
watch(tickers, (ts) => {
  if (ticker.value && !ts.some((t) => t.value === ticker.value)) ticker.value = null;
  if (chartTicker.value && !ts.some((t) => t.value === chartTicker.value)) chartTicker.value = null;
});

async function showOnChart(sym: string) {
  chartTicker.value = sym;
  await nextTick();
  chartBox.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- chart ----------------
const chartSym = computed(() => chartTicker.value ?? bench.value);
const chartTitle = computed(() => chartTicker.value ?? benchLabel.value);
const chartName = computed(() => (chartTicker.value ? marketView.value.name(chartTicker.value) : ''));
const chartCcy = computed(() => marketView.value.currencyOf(chartSym.value));

const line = computed<Array<[string, number]>>(() => {
  const b = marketView.value.bars(chartSym.value);
  const out: Array<[string, number]> = [];
  let hi = -Infinity;
  for (let i = 0; i < b.dates.length; i++) {
    const c = b.close[i];
    if (c == null || !isFinite(c)) continue;
    if (mode.value === 'Price') out.push([b.dates[i], c]);
    else { hi = Math.max(hi, c); out.push([b.dates[i], hi > 0 ? c / hi - 1 : 0]); }
  }
  return out;
});
const valueFmt = (v: number) => (mode.value === 'Price' ? (chartTicker.value ? `${ccySymbol(chartCcy.value)}${price(v)}` : price(v)) : pct(v));

const trades = computed<LedgerEntry[]>(() => (result.value?.ledger ?? []).filter((e) =>
  (e.action === 'Buy' || e.action === 'Sell') && e.auto == null && e.status === 'confirmed' && (!chartTicker.value || e.symbol === chartTicker.value)));

/** B/S flags on the line at each trade date (the chart stacks several trades of one day) */
const flags = computed<Flag[]>(() => {
  if (!eventFlag.value || !line.value.length) return [];
  const data = line.value;
  const dates = data.map((d) => d[0]);
  return trades.value.map((t) => {
    const i = lastIndexLE(dates, t.date);
    return {
      date: t.date, value: i >= 0 ? data[i][1] : data[0][1], label: t.action === 'Buy' ? 'B' : 'S', color: t.action === 'Buy' ? palette.flag : palette.neg,
      text: `${t.action} ${t.symbol} ${shares(t.shares)} @ ${price(t.price)} ${t.currency}`,
    };
  });
});
</script>

<template>
  <div class="page ta">
    <div ref="chartBox" class="ta-top">
      <PillToggle v-model="mode" :options="['Price', '%Off High'] as const" />
      <label class="ef">
        <span>Event Flag</span>
        <v-switch v-model="eventFlag" color="primary" density="compact" hide-details aria-label="Show buy and sell flags" />
      </label>
    </div>
    <div class="ta-title">
      <span>{{ chartTitle }}</span>
      <span v-if="chartName && mdAndUp" class="ta-name">{{ chartName }}</span>
      <v-tooltip v-if="chartTicker" :text="`Back to ${benchLabel}`">
        <template #activator="{ props }"><button v-bind="props" class="clear-btn" :aria-label="`Back to ${benchLabel}`" @click="chartTicker = null; ticker = null"><v-icon size="16">mdi-close</v-icon></button></template>
      </v-tooltip>
    </div>
    <FlagChart class="ta-chart" :name="chartTitle" :data="line" :flags="flags" :zooms="ZOOMS" initial-zoom="1Y" :height="mdAndUp ? 425 : 262" :value-formatter="valueFmt" />

    <TradeKpis class="ta-kpis" :stats="stats" :bench-label="benchLabel" />

    <!-- filters -->
    <div v-if="mdAndUp" class="filters">
      <v-menu>
        <template #activator="{ props }"><button v-bind="props" class="outline-btn status-btn">Status: {{ side }}</button></template>
        <v-list density="compact" min-width="140">
          <v-list-item v-for="s in ['All', 'Long', 'Short'] as const" :key="s" :active="side === s" @click="side = s">{{ s }}</v-list-item>
        </v-list>
      </v-menu>
      <i class="vsep" />
      <button class="chip long" :class="{ on: side === 'Long' }" :aria-pressed="side === 'Long'" @click="toggleSide('Long')">Long</button>
      <button class="chip short" :class="{ on: side === 'Short' }" :aria-pressed="side === 'Short'" @click="toggleSide('Short')">Short</button>
      <i class="vsep" />
      <PillToggle v-model="outcome" :options="['All', 'Winners', 'Losers'] as const" />
      <v-spacer />
      <v-menu>
        <template #activator="{ props }"><button v-bind="props" class="method">Method:<span>{{ method }}</span><v-icon size="15">mdi-chevron-right</v-icon></button></template>
        <v-list density="compact" min-width="160">
          <v-list-subheader>Cost method</v-list-subheader>
          <v-list-item v-for="m in ['FIFO', 'Average'] as const" :key="m" :active="method === m" @click="setMethod(m)">{{ m }}</v-list-item>
        </v-list>
      </v-menu>
      <v-autocomplete v-model="ticker" :items="tickers" label="Ticker" variant="outlined" density="compact" hide-details clearable persistent-placeholder class="ticker-sel" :menu-props="{ maxHeight: 360 }">
        <template #item="{ props, item }"><v-list-item v-bind="props" :subtitle="item.raw.name" /></template>
      </v-autocomplete>
      <v-menu :close-on-content-click="false">
        <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="More filters"><v-icon :color="extraFilters ? 'primary' : undefined">mdi-filter</v-icon></button></template>
        <v-list density="compact" min-width="200">
          <v-list-subheader>Lot status</v-list-subheader>
          <v-list-item v-for="s in ['Open', 'Closed']" :key="s" @click="lotState = toggleIn(lotState, s)"><template #prepend><v-checkbox-btn :model-value="lotState.includes(s)" density="compact" /></template>{{ s }}</v-list-item>
          <v-list-subheader>Currency</v-list-subheader>
          <v-list-item v-for="c in currencies" :key="c" @click="ccyFilter = toggleIn(ccyFilter, c)"><template #prepend><v-checkbox-btn :model-value="ccyFilter.includes(c)" density="compact" /></template>{{ c }}</v-list-item>
        </v-list>
      </v-menu>
    </div>
    <div v-else class="m-filters">
      <div class="mf-row">
        <PillToggle v-model="outcome" :options="['All', 'Winners', 'Losers'] as const" />
        <v-menu>
          <template #activator="{ props }"><button v-bind="props" class="outline-btn status-btn">Status: {{ side }}</button></template>
          <v-list density="compact" min-width="140">
            <v-list-item v-for="s in ['All', 'Long', 'Short'] as const" :key="s" :active="side === s" @click="side = s">{{ s }}</v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="mf-row">
        <div class="d-flex ga-2">
          <button class="chip long" :class="{ on: side === 'Long' }" :aria-pressed="side === 'Long'" @click="toggleSide('Long')">Long</button>
          <button class="chip short" :class="{ on: side === 'Short' }" :aria-pressed="side === 'Short'" @click="toggleSide('Short')">Short</button>
        </div>
        <v-menu>
          <template #activator="{ props }"><button v-bind="props" class="method">Method:<span>{{ method }}</span><v-icon size="15">mdi-chevron-right</v-icon></button></template>
          <v-list density="compact" min-width="160">
            <v-list-subheader>Cost method</v-list-subheader>
            <v-list-item v-for="m in ['FIFO', 'Average'] as const" :key="m" :active="method === m" @click="setMethod(m)">{{ m }}</v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="mf-row">
        <v-autocomplete v-model="ticker" :items="tickers" label="Ticker" variant="outlined" density="compact" hide-details clearable persistent-placeholder class="ticker-sel m">
          <template #item="{ props, item }"><v-list-item v-bind="props" :subtitle="item.raw.name" /></template>
        </v-autocomplete>
        <v-menu :close-on-content-click="false">
          <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="More filters"><v-icon :color="extraFilters ? 'primary' : undefined">mdi-filter</v-icon></button></template>
          <v-list density="compact" min-width="200">
            <v-list-subheader>Lot status</v-list-subheader>
            <v-list-item v-for="s in ['Open', 'Closed']" :key="s" @click="lotState = toggleIn(lotState, s)"><template #prepend><v-checkbox-btn :model-value="lotState.includes(s)" density="compact" /></template>{{ s }}</v-list-item>
            <v-list-subheader>Currency</v-list-subheader>
            <v-list-item v-for="c in currencies" :key="c" @click="ccyFilter = toggleIn(ccyFilter, c)"><template #prepend><v-checkbox-btn :model-value="ccyFilter.includes(c)" density="compact" /></template>{{ c }}</v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <LotTable class="ta-lots" :lots="shown" :portfolio-name="activePortfolio?.name ?? 'My Portfolio'" :bench-label="benchLabel" :selected="chartTicker" @chart="showOnChart" />

    <TradeActivity />
  </div>
</template>

<style scoped lang="scss">
.ta-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 9px; scroll-margin-top: 80px; }
.ef { display: inline-flex; align-items: center; gap: 12px; font-size: 15px; color: var(--text); cursor: pointer; padding-right: 2px;
  :deep(.v-switch) { flex: none; }
  :deep(.v-selection-control) { min-height: 32px; }
}
.ta-title { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 5px; font-size: 16px; font-weight: 700; line-height: 28px; color: var(--text); letter-spacing: 0.2px; }
.ta-name { font-size: 13px; font-weight: 400; color: var(--muted); }
.clear-btn { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; padding: 2px; border-radius: 50%; &:hover { color: var(--text); background: var(--line-soft); } }
.ta-chart { margin-top: 10px; }
.ta-kpis { margin-top: 18px; }
.filters { display: flex; align-items: center; gap: 9px; margin-top: 32px; }
.vsep { width: 1px; height: 20px; background: var(--border-strong); margin: 0 2px; }
.status-btn { height: 28px; border-radius: 8px; padding: 0 13px; font-size: 13.5px; border-color: var(--faint); }
.chip { height: 18px; padding: 0 9px; border-radius: 9px; font: 600 11px/16px var(--font); letter-spacing: 0.8px; background: transparent; cursor: pointer; border: 1px solid;
  &.long { color: #5b9bef; border-color: #2c5286; &.on { background: rgba(61, 139, 253, 0.2); border-color: #5b9bef; } }
  &.short { color: var(--neg); border-color: var(--neg-soft); &.on { background: var(--neg-soft); border-color: var(--neg); } }
}
.method { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; cursor: pointer; font: 600 13.5px/1 var(--font); letter-spacing: 0.9px; color: var(--text-2); padding: 4px 2px;
  span { color: var(--text); font-weight: 500; }
  .v-icon { color: var(--text-2); margin-left: -2px; }
  &:hover span { color: var(--text); }
}
.ticker-sel { flex: none; width: 270px; margin-left: 6px; :deep(.v-field) { border-radius: 8px; } :deep(.v-field__input) { min-height: 40px; } }
.icon-btn { background: none; border: 0; color: var(--text-2); cursor: pointer; padding: 4px; display: inline-flex; .v-icon { font-size: 22px; } }
.ta-lots { margin-top: 17px; }
.m-filters { margin-top: 30px; display: flex; flex-direction: column; gap: 14px; }
.mf-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ticker-sel.m { flex: 1; width: auto; margin-left: 0; }
@media (max-width: 959px) {
  .ta-top { margin-top: 14px; }
  .ef { font-size: 15px; gap: 10px; }
  .ta-title { margin-top: 10px; }
  .ta-chart { margin-top: 14px; }
  .ta-kpis { margin-top: 30px; }
  .ta-lots { margin-top: 16px; }
}
</style>
