<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Holding details: price chart with trade flags, position stats and the holding's transactions.
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { result, marketView, openAddTransaction } from '../store.ts';
import { alloc, money, pct, price, shares, signClass, ccySymbol } from '../format.ts';
import TimeChart from './TimeChart.vue';

// axis labels stay short so large prices (property, indices) fit: 325k, 1.2M; small prices keep cents
const axisPrice = (v: number) => { const a = Math.abs(v); return a >= 1e4 ? (v < 0 ? '-' : '') + (a >= 1e6 ? +(a / 1e6).toFixed(2) + 'M' : +(a / 1e3).toFixed(1) + 'k') : price(v); };
const model = defineModel<string | null>({ default: null });
const { mdAndUp } = useDisplay();
const h = computed(() => result.value?.holdings.find((x) => x.symbol === model.value) ?? null);
const txns = computed(() => (result.value?.userLedger ?? []).filter((e) => e.symbol === model.value).slice().reverse());
const priceSeries = computed(() => {
  if (!model.value) return [];
  const b = marketView.value.bars(model.value);
  return b.dates.map((d, i) => [d, b.close[i]] as [string, number]);
});
const markers = computed(() => {
  const mv = marketView.value;
  return txns.value
    .filter((e) => e.action === 'Buy' || e.action === 'Sell')
    .map((e) => ({ date: e.date, value: (mv.priceAt(e.symbol, e.date) ?? e.price), label: e.action === 'Buy' ? 'B' : 'S', tooltip: `${e.action} ${shares(e.shares)} @ ${price(e.price)} on ${e.date}` }));
});
</script>

<template>
  <v-dialog :model-value="!!model" :fullscreen="!mdAndUp" max-width="1100" scrollable @update:model-value="model = null">
    <v-card v-if="h" class="hd">
      <div class="hd-head">
        <div>
          <div class="sym">{{ h.symbol }} <span class="muted name">{{ h.name }}</span></div>
          <div class="px">{{ ccySymbol(h.currency) }}{{ price(h.last) }} <span :class="signClass(h.dayGainPct)">{{ pct(h.dayGainPct) }}</span></div>
          <div class="muted meta">{{ h.assetType }} · {{ h.sector }} · {{ h.country }} · {{ h.market }}</div>
        </div>
        <v-spacer />
        <button class="outline-btn mr-2" @click="openAddTransaction({ symbol: h.symbol, action: 'Buy' })"><v-icon size="18">mdi-plus</v-icon>Transaction</button>
        <button class="close" aria-label="Close" @click="model = null"><v-icon>mdi-close</v-icon></button>
      </div>
      <v-card-text>
        <TimeChart :series="[{ name: h.symbol, data: priceSeries, color: palette.portfolio, width: 2, gradient: palette.portfolioFill }]" :markers="markers" :height="mdAndUp ? 340 : 260" :zooms="['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL']" initial-zoom="1Y" show-y-axis :y-formatter="axisPrice" :value-formatter="(v: number) => price(v)" />
        <div class="stats">
          <div><span>Shares</span><b>{{ shares(h.shares) }}</b></div>
          <div><span>Avg Cost</span><b>{{ price(h.avgCost) }}</b></div>
          <div><span>Market Value</span><b>{{ money(h.marketValue) }}</b></div>
          <div><span>Cost Value</span><b>{{ money(h.costValue) }}</b></div>
          <div><span>Allocation</span><b>{{ alloc(h.allocation) }}</b></div>
          <div><span>Unrealized Gain</span><b :class="signClass(h.unrealized)">{{ money(h.unrealized, { sign: true }) }} ({{ pct(h.unrealizedPct) }})</b></div>
          <div><span>Realized Gain</span><b :class="signClass(h.realized)">{{ money(h.realized, { sign: true }) }}</b></div>
          <div><span>Dividends</span><b :class="signClass(h.dividends)">{{ money(h.dividends, { sign: true }) }}</b></div>
          <div><span>Fees</span><b :class="signClass(-h.fees)">{{ money(-h.fees, { sign: true }) }}</b></div>
          <div><span>Total Gain</span><b :class="signClass(h.totalGain)">{{ money(h.totalGain, { sign: true }) }}</b></div>
          <div><span>Total Return</span><b :class="signClass(h.totalReturn)">{{ pct(h.totalReturn) }}</b></div>
          <div><span>Annualized</span><b :class="signClass(h.annualizedReturn)">{{ pct(h.annualizedReturn) }}</b></div>
          <div><span>52-Wk Range</span><b>{{ price(h.low52) }} - {{ price(h.high52) }}</b></div>
          <div><span>First Bought</span><b>{{ h.firstDate }}</b></div>
        </div>
        <table class="p-table mt-4">
          <thead><tr><th>Date</th><th>Action</th><th>Price</th><th>Currency</th><th>Shares</th><th>Commission</th></tr></thead>
          <tbody><tr v-for="e in txns" :key="e.id"><td>{{ e.date }}</td><td>{{ e.action }}</td><td>{{ price(e.price) }}</td><td>{{ e.currency }}</td><td>{{ shares(e.shares) }}</td><td>{{ price(e.commission) }}</td></tr></tbody>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.hd { background: var(--surface) !important; border: 1px solid var(--border); border-radius: 16px !important; }
.hd-head { display: flex; align-items: flex-start; padding: 16px 20px 4px; gap: 10px; }
.sym { font-size: 20px; font-weight: 700; line-height: 28px; }
.name { font-size: 13px; font-weight: 400; margin-left: 6px; }
.px { font-size: 16px; font-weight: 500; margin-top: 2px; }
.meta { font-size: 12px; margin-top: 2px; }
.close { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0 28px; margin-top: 12px; }
.stats div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding: 9px 0; font-size: 13px; }
.stats span { color: var(--text-2); white-space: nowrap; }
.stats b { font-weight: 500; text-align: right; }
</style>
