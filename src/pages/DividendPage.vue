<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Dividends: projected / trailing income, yields, payout calendar, history chart and ticker tables.
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { activePortfolio, marketView, result, store } from '../store.ts';
import { bucketize, buildDividendEvents, summarize, type Freq } from '../engine/dividends.ts';
import { ccySymbol, hidden, money, num, pct, signClass } from '../format.ts';
import PillToggle from '../components/PillToggle.vue';
import DivDonut from '../components/div/DivDonut.vue';
import ShareButton from '../components/ShareButton.vue';
import DivCalendar from '../components/div/DivCalendar.vue';
import DivBarChart from '../components/div/DivBarChart.vue';
import DivTable from '../components/div/DivTable.vue';

const { mdAndUp } = useDisplay();
type Mode = 'Upcoming' | 'Historical';
const mode = ref<Mode>('Upcoming');
const donut = ref<'Dividend' | 'Market Value'>('Dividend');
const view = ref<'Chart' | 'Table'>('Chart');
const freq = ref<Freq>('Monthly');
const bc = ref();
const barChart = computed(() => bc.value?.chart);


const r = computed(() => result.value);
const events = computed(() => (r.value ? buildDividendEvents(r.value, marketView.value) : []));
const s = computed(() => (r.value ? summarize(events.value, r.value, mode.value) : null));
const buckets = computed(() => bucketize(events.value, freq.value));
const sym = computed(() => ccySymbol(store.base));
// amounts on this page are net of the portfolio's dividend withholding tax; the headline shows the sum
const taxRate = computed(() => activePortfolio.value?.dividendTaxRate ?? 0);
const big = (v: number, d = 0) => (hidden() ? '••••••' : num(v, d));

const donutItems = computed(() => {
  const res = r.value;
  const sum = s.value;
  if (!res || !sum) return [];
  if (donut.value === 'Dividend') return sum.byTicker;
  const payers = new Set(sum.payers);
  return res.holdings.filter((h) => payers.has(h.symbol)).map((h) => ({ name: h.symbol, value: h.marketValue }));
});
const donutOptions = computed(() => [{ value: 'Dividend' as const, label: `Dividend (${mode.value})` }, { value: 'Market Value' as const, label: 'Market Value' }]);

const yoyHelp = computed(() => {
  const sum = s.value;
  if (!sum) return '';
  return mode.value === 'Upcoming'
    ? `Projected income for the next 12 months compared with the ${money(sum.prev)} received over the past 12 months.`
    : `Dividends received over the past 12 months compared with the ${money(sum.prev)} received in the 12 months before.`;
});
const yieldHelp = computed(() => (mode.value === 'Upcoming'
  ? 'Projected 12-month dividend income divided by the current portfolio value (yield) or by the cost of the shares you hold (yield on cost).'
  : 'Dividends received over the past 12 months divided by the current portfolio value (yield) or by the cost of the shares you hold (yield on cost).'));

const tableRows = computed(() => [...buckets.value].reverse());
const bucketCsv = () => [['Period', 'Received', 'Upcoming', 'Total'], ...buckets.value.map((b) => [b.key, b.received.toFixed(2), b.upcoming.toFixed(2), (b.received + b.upcoming).toFixed(2)])];
</script>

<template>
  <div class="page div-page">
    <template v-if="r && s">
      <!-- ---------- headline ---------- -->
      <section class="top">
        <div v-if="mdAndUp" class="pv">
          <div class="lbl">Portfolio Value</div>
          <div class="value"><span class="ccy">{{ sym }}</span>{{ big(r.value) }}</div>
          <div class="sub">Number of Assets: {{ r.holdings.length }}</div>
          <div class="sub">Number of Dividend-Paying Assets: {{ s.payers.length }}</div>
        </div>
        <div class="proj">
          <PillToggle v-model="mode" :options="['Upcoming', 'Historical'] as const" />
          <div class="plbl">
            <template v-if="mode === 'Upcoming'">Next 12 months projected<br />Annual Dividend Income</template>
            <template v-else>Past 12 months<br />Dividend Income</template>
          </div>
          <div class="value"><span class="ccy">{{ sym }}</span>{{ big(s.total, 2) }}</div>
          <div v-if="s.yoy != null" class="yoy" :class="signClass(s.yoy)">
            {{ pct(s.yoy) }} YoY
            <v-tooltip :text="yoyHelp" max-width="320">
              <template #activator="{ props: a }"><v-icon v-bind="a" size="17" class="info" :class="signClass(s.yoy)">mdi-information</v-icon></template>
            </v-tooltip>
          </div>
          <div v-if="s.withheld > 0" class="net-math tnum" data-test="div-net-math">Gross {{ money(s.gross) }} − {{ +taxRate.toFixed(2) }}% withholding {{ money(s.withheld) }} = net {{ money(s.total) }}</div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="sl">Portfolio Yield (TTM)</div>
            <v-tooltip :text="yieldHelp" max-width="320"><template #activator="{ props: a }"><div v-bind="a" class="sv">{{ pct(s.yieldTTM, { sign: false }) }}</div></template></v-tooltip>
          </div>
          <div class="stat">
            <div class="sl">Yield on Cost (TTM)</div>
            <v-tooltip :text="yieldHelp" max-width="320"><template #activator="{ props: a }"><div v-bind="a" class="sv">{{ pct(s.yieldOnCost, { sign: false }) }}</div></template></v-tooltip>
          </div>
          <div class="stat">
            <div class="sl">Avg Monthly Income</div>
            <div class="sv">{{ money(s.avgMonthly) }}</div>
          </div>
          <div class="stat">
            <div class="sl">Avg Daily Income</div>
            <div class="sv">{{ money(s.avgDaily) }}</div>
          </div>
        </div>
      </section>

      <!-- ---------- donut + calendar ---------- -->
      <section class="row-dc">
        <div class="donut-col">
          <div class="center"><PillToggle v-model="donut" :options="donutOptions" /></div>
          <DivDonut v-if="donutItems.length" :items="donutItems" :palette="palette.series" :height="mdAndUp ? 440 : 262" :compact="!mdAndUp" />
          <div v-else class="empty" :style="{ height: (mdAndUp ? 440 : 262) + 'px' }">No dividends {{ mode === 'Upcoming' ? 'expected in the next 12 months' : 'received in the past 12 months' }}</div>
        </div>
        <div class="cal-col"><DivCalendar :events="events" :today="r.today" :mode="mode" /></div>
      </section>

      <!-- ---------- history chart ---------- -->
      <section class="hist">
        <h2 class="section-title">Historical and Upcoming Dividends</h2>
        <div class="hist-ctl">
          <div class="toggles">
            <PillToggle v-model="view" :options="['Chart', 'Table'] as const" />
            <PillToggle v-model="freq" :options="['Monthly', 'Quarterly', 'Annually'] as const" />
          </div>
          <div class="right">
            <div v-if="view === 'Chart'" class="legend">
              <span class="li"><i :style="{ background: palette.pos }" />Received</span>
              <span class="li"><i :style="{ background: palette.bench }" />Upcomings</span>
            </div>
            <ShareButton v-if="mdAndUp" icon :chart="view === 'Chart' ? barChart : undefined" :csv="bucketCsv" filename="dividends-history" />
          </div>
        </div>
        <DivBarChart v-if="view === 'Chart'" ref="bc" :buckets="buckets" :height="mdAndUp ? 330 : 250" />
        <div v-else class="card btable">
          <table class="p-table">
            <thead><tr><th>Period</th><th class="num">Received</th><th class="num">Upcoming</th><th class="num">Total</th></tr></thead>
            <tbody>
              <tr v-for="b in tableRows" :key="b.key">
                <td>{{ b.key }}</td>
                <td class="num">{{ b.received ? money(b.received) : '-' }}</td>
                <td class="num">{{ b.upcoming ? money(b.upcoming) : '-' }}</td>
                <td class="num strong">{{ money(b.received + b.upcoming) }}</td>
              </tr>
              <tr v-if="!tableRows.length"><td colspan="4" class="empty-td">No dividends yet</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="tables">
        <DivTable :events="events" />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.top { display: grid; grid-template-columns: 362px 300px 1fr; align-items: start; margin-top: 15px; }
.lbl { font-size: 14px; line-height: 21px; color: var(--text); margin-top: 2px; }
.value { font-size: 48px; font-weight: 600; line-height: 50px; letter-spacing: -1.44px; white-space: nowrap; color: var(--text); }
.value .ccy { font-size: 28px; margin-right: 8px; font-weight: 600; letter-spacing: 0; line-height: 1; }
.pv .value { margin: 11px 0 8px; }
.sub { font-size: 14px; line-height: 22px; color: var(--muted); }
.proj .plbl { margin-top: 25px; font-size: 15px; line-height: 22px; color: var(--text); }
.proj .value { margin-top: -1px; }
.yoy { margin-top: -1px; font-size: 14px; line-height: 21px; display: inline-flex; align-items: center; gap: 3px; }
.info { cursor: help; }
.net-math { margin-top: 4px; font-size: 12.5px; line-height: 18px; color: var(--muted); }
.stats { display: grid; grid-template-columns: 1fr 1fr; row-gap: 27px; padding-top: 46px; }
.stat { text-align: center; }
.sl { font-size: 14px; line-height: 21px; color: var(--text); }
.sv { font-size: 21px; line-height: 28px; margin-top: 7px; color: var(--text); font-weight: 450; display: inline-block; }

.row-dc { display: grid; grid-template-columns: 1fr 527px; gap: 4px; margin-top: 24px; }
.center { display: flex; justify-content: center; }
.donut-col { min-width: 0; }
.empty { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 14px; }

.hist { margin-top: 44px; }
.hist-ctl { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 18px 0 8px; flex-wrap: wrap; }
.toggles { display: flex; gap: 12px; flex-wrap: wrap; }
.right { display: flex; align-items: center; gap: 18px; }
.legend { display: flex; gap: 18px; font-size: 14px; color: var(--text); }
.li { display: inline-flex; align-items: center; gap: 7px; }
.li i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.btable { margin-top: 8px; max-height: 460px; overflow: auto; }
.p-table th.num, .p-table td.num { text-align: right; padding-right: 16px; }
.p-table td { height: 38px; }
.strong { font-weight: 600; }
.empty-td { text-align: center; color: var(--muted); }
.tables { margin-top: 30px; }

@media (max-width: 959px) {
  .top { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 14px; margin-top: 0; }
  .proj { display: flex; flex-direction: column; align-items: center; }
  .proj .plbl { margin-top: 8px; font-size: 15px; }
  .proj .value { margin-top: 0; }
  .yoy { margin-top: 0; }
  .stats { width: 100%; padding-top: 6px; row-gap: 18px; }
  .sv { margin-top: 3px; }
  .row-dc { grid-template-columns: 1fr; margin-top: 30px; gap: 16px; }
  .hist { margin-top: 34px; }
  .hist-ctl { flex-direction: column; align-items: stretch; margin: 14px 0 4px; gap: 10px; }
  .toggles { flex-direction: column; align-items: flex-start; gap: 10px; }
  .right { justify-content: flex-end; }
  .legend { font-size: 13.5px; }
  .tables { margin-top: 22px; }
}
</style>
