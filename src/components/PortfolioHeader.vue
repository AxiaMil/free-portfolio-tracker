<script setup lang="ts">
// "My Portfolio" headline + Benchmark / Key Stats / P&L Breakdown / Gains & Returns panel.
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { store, result, benchName, activePortfolio } from '../store.ts';
import { headline, keyStats, gainsAndReturns, HEADER_PERIODS } from '../composables/stats.ts';
import { money, num, pct, signClass, ccySymbol } from '../format.ts';
import { localTimestamp } from '../engine/util.ts';
import HelpTip from './HelpTip.vue';

const { mdAndUp } = useDisplay();
const tab = ref<'Benchmark' | 'Key Stats' | 'P&L Breakdown' | 'Gains & Returns'>('Benchmark');
const TABS = ['Benchmark', 'Key Stats', 'P&L Breakdown', 'Gains & Returns'] as const;
const infoOpen = ref(false);

const h = computed(() => headline.value);
const sym = computed(() => ccySymbol(store.base));
// small amounts keep their cents (an empty portfolio reads 0.00), larger ones are rounded
const wholeAbove1k = (v: number) => (Math.abs(v) < 1000 ? 2 : 0);
const big = computed(() => {
  if (store.state?.preferences.hideValues) return '••••••';
  const v = h.value?.value ?? 0;
  return num(v, wholeAbove1k(v));
});
// in the device's own time zone, named: "2026-11-12 15:27:02.413 GMT+8"
const lastUpdated = computed(() => (store.lastUpdated ? localTimestamp(store.lastUpdated) : ''));
// together they add up to the portfolio's value minus its net deposits
const DIV_TIP = 'Before withholding tax, which is under Taxes. Per holding, dividends are shown after it.';
const pnlRows = computed(() => {
  const p = result.value?.pnl;
  if (!p) return [];
  return [
    ['Unrealized Gains', p.unrealized], ['Realized Gains', p.realized], ['Dividends', p.dividends, DIV_TIP], ['Fees', p.fees],
    ['Taxes', p.taxes], ['Interests', p.interests], ['Others', p.others],
  ] as Array<[string, number, string?]>;
});
// a currency with no exchange rate yet is counted 1:1; say so once the first download is done
const missingFx = computed(() => (store.loading ? [] : result.value?.missingFx ?? []));
function togglePrivacy() {
  if (store.state) store.state.preferences.hideValues = !store.state.preferences.hideValues;
}
</script>

<template>
  <div v-if="h" class="ph">
    <div class="left">
      <div class="title">{{ activePortfolio?.name ?? 'My Portfolio' }} <button class="eye" :aria-label="store.state?.preferences.hideValues ? 'Show values' : 'Hide values'" @click="togglePrivacy"><v-icon size="16">{{ store.state?.preferences.hideValues ? 'mdi-eye-off' : 'mdi-eye' }}</v-icon></button></div>
      <div class="value"><span class="ccy">{{ sym }}</span>{{ big }}</div>
      <div class="line" :class="signClass(h.today.gain)">{{ money(h.today.gain, { sign: true }) }} ({{ pct(h.today.pct) }}) <span class="tag">TODAY</span></div>
      <div class="line" :class="signClass(h.yesterday.gain)">{{ money(h.yesterday.gain, { sign: true }) }} ({{ pct(h.yesterday.pct) }}) <span class="tag">YESTERDAY</span></div>
      <div class="line period" :class="signClass(h.period?.gain)">
        {{ money(h.period?.gain ?? 0, { sign: true }) }} ({{ pct(h.period?.pct ?? 0) }})
        <v-menu location="bottom start">
          <template #activator="{ props }">
            <button v-bind="props" class="period-btn">{{ store.headerPeriod === 'All' ? 'ALL' : store.headerPeriod }} <v-icon size="14">mdi-chevron-down</v-icon></button>
          </template>
          <v-list density="compact">
            <v-list-item v-for="k in HEADER_PERIODS" :key="k" :active="store.headerPeriod === k" @click="store.headerPeriod = k">{{ k === 'All' ? 'ALL' : k }}</v-list-item>
          </v-list>
        </v-menu>
        <button v-if="!mdAndUp" class="info-btn" aria-label="Portfolio details" @click="infoOpen = true"><v-icon size="18">mdi-information</v-icon></button>
      </div>
      <div class="updated">Last Updated: {{ lastUpdated || '—' }}<span v-if="store.offline" class="offline"> · offline (cached prices)</span></div>
      <div v-if="missingFx.length" class="updated offline" data-test="missing-fx">No exchange rate for {{ missingFx.join(', ') }} to {{ store.base }} yet: those amounts are counted as if 1 {{ missingFx[0] }} = 1 {{ store.base }}.</div>
    </div>

    <div v-if="mdAndUp" class="right">
      <div class="tabs">
        <button v-for="t in TABS" :key="t" class="tab" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
      </div>
      <div class="panel">
        <slot name="panel" :tab="tab">
          <template v-if="tab === 'Benchmark'">
            <div class="bench-grid">
              <div class="bcol">
                <div class="blabel">What if investing in {{ benchName(h.bench.symbol) }} <HelpTip :size="12" :text="`Value of your portfolio if every deposit had bought ${benchName(h.bench.symbol)} instead, on the same dates.`" /></div>
                <div class="bval"><span class="ccy">{{ sym }}</span>{{ store.state?.preferences.hideValues ? '••••' : num(h.bench.value, 2) }}</div>
                <div class="bline" :class="signClass(h.bench.today.gain)">{{ money(h.bench.today.gain, { sign: true }) }} ({{ pct(h.bench.today.pct) }}) <span class="tag">TODAY</span></div>
                <div class="bline" :class="signClass(h.bench.yesterday.gain)">{{ money(h.bench.yesterday.gain, { sign: true }) }} ({{ pct(h.bench.yesterday.pct) }}) <span class="tag">YESTERDAY</span></div>
                <div class="bline" :class="signClass(h.bench.all?.gain)">{{ money(h.bench.all?.gain ?? 0, { sign: true }) }} ({{ pct(h.bench.all?.pct ?? 0) }}) <span class="tag">ALL</span></div>
              </div>
              <div class="bcol">
                <div class="blabel">What if not investing <HelpTip :size="12" text="Your net deposits kept as cash." /></div>
                <div class="bval"><span class="ccy">{{ sym }}</span>{{ store.state?.preferences.hideValues ? '••••' : num(h.noInvest.value, 2) }}</div>
                <div class="bline">{{ money(0, { sign: true }) }} (+0.00%) <span class="tag">TODAY</span></div>
                <div class="bline">{{ money(0, { sign: true }) }} (+0.00%) <span class="tag">YESTERDAY</span></div>
                <div class="bline">{{ money(0, { sign: true }) }} (+0.00%) <span class="tag">ALL</span></div>
              </div>
            </div>
          </template>
          <template v-else-if="tab === 'Key Stats' && keyStats">
            <div class="ks-grid">
              <div><div class="ks-l">All-time high</div><div class="ks-v">{{ money(keyStats.ath, { decimals: wholeAbove1k(keyStats.ath) }).replace(sym, sym + ' ') }}</div></div>
              <div><div class="ks-l">52-wk high</div><div class="ks-v">{{ money(keyStats.high52, { decimals: wholeAbove1k(keyStats.high52) }).replace(sym, sym + ' ') }}</div></div>
              <div><div class="ks-l">Dividend Yield</div><div class="ks-v">{{ pct(keyStats.dividendYield, { sign: false }) }}</div></div>
              <div><div class="ks-l">Max Drawdown</div><div class="ks-v">{{ pct(keyStats.maxDD, { sign: false }) }}</div></div>
              <div><div class="ks-l">Max Drawdown Duration</div><div class="ks-v">{{ num(keyStats.maxDDDuration, 2) }} days</div></div>
              <div><div class="ks-l">Sharpe Ratio</div><div class="ks-v">{{ keyStats.sharpe == null ? '-' : num(keyStats.sharpe, 2) }}</div></div>
              <div><div class="ks-l">Beta</div><div class="ks-v">{{ keyStats.beta == null ? '-' : num(keyStats.beta, 2) }}</div></div>
            </div>
          </template>
          <template v-else-if="tab === 'P&L Breakdown'">
            <div class="rows">
              <div v-for="[l, v, tip] in pnlRows" :key="l" class="row"><span>{{ l }}<HelpTip v-if="tip" class="ml-1" :size="12" :text="tip" /></span><span :class="signClass(v)">{{ money(v, { sign: true }) }}</span></div>
            </div>
          </template>
          <template v-else-if="tab === 'Gains & Returns'">
            <div class="rows">
              <div v-for="g in gainsAndReturns" :key="g.key" class="row">
                <span>Total Gain {{ g.label === 'All-Time' ? 'All-Time' : g.label.replace('YTD', 'YTD') }}</span>
                <span :class="signClass(g.res?.gain)">{{ g.res ? `${money(g.res.gain, { sign: true })} (${pct(g.res.pct)})` : '-' }}</span>
              </div>
            </div>
          </template>
        </slot>
      </div>
    </div>

    <!-- mobile: the same panel in a sheet -->
    <v-bottom-sheet v-model="infoOpen">
      <v-card class="sheet">
        <div class="tabs m">
          <button v-for="t in TABS" :key="t" class="tab" :class="{ active: tab === t }" @click="tab = t">{{ t }}</button>
        </div>
        <div class="panel m">
          <template v-if="tab === 'Benchmark'">
            <div class="rows">
              <div class="row"><span>What if investing in {{ benchName(h.bench.symbol) }}</span><span>{{ money(h.bench.value) }}</span></div>
              <div class="row"><span>Gain (ALL)</span><span :class="signClass(h.bench.all?.gain)">{{ money(h.bench.all?.gain ?? 0, { sign: true }) }} ({{ pct(h.bench.all?.pct ?? 0) }})</span></div>
              <div class="row"><span>What if not investing</span><span>{{ money(h.noInvest.value) }}</span></div>
            </div>
          </template>
          <template v-else-if="tab === 'Key Stats' && keyStats">
            <div class="rows">
              <div class="row"><span>All-time high</span><span>{{ money(keyStats.ath, { decimals: wholeAbove1k(keyStats.ath) }) }}</span></div>
              <div class="row"><span>52-wk high</span><span>{{ money(keyStats.high52, { decimals: wholeAbove1k(keyStats.high52) }) }}</span></div>
              <div class="row"><span>Dividend Yield</span><span>{{ pct(keyStats.dividendYield, { sign: false }) }}</span></div>
              <div class="row"><span>Max Drawdown</span><span>{{ pct(keyStats.maxDD, { sign: false }) }}</span></div>
              <div class="row"><span>Max Drawdown Duration</span><span>{{ num(keyStats.maxDDDuration, 2) }} days</span></div>
              <div class="row"><span>Sharpe Ratio</span><span>{{ keyStats.sharpe == null ? '-' : num(keyStats.sharpe, 2) }}</span></div>
              <div class="row"><span>Beta</span><span>{{ keyStats.beta == null ? '-' : num(keyStats.beta, 2) }}</span></div>
            </div>
          </template>
          <template v-else-if="tab === 'P&L Breakdown'">
            <div class="rows"><div v-for="[l, v, tip] in pnlRows" :key="l" class="row"><span>{{ l }}<HelpTip v-if="tip" class="ml-1" :size="12" :text="tip" /></span><span :class="signClass(v)">{{ money(v, { sign: true }) }}</span></div></div>
          </template>
          <template v-else>
            <div class="rows"><div v-for="g in gainsAndReturns" :key="g.key" class="row"><span>Total Gain {{ g.label }}</span><span :class="signClass(g.res?.gain)">{{ g.res ? `${money(g.res.gain, { sign: true })} (${pct(g.res.pct)})` : '-' }}</span></div></div>
          </template>
        </div>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<style scoped lang="scss">
.ph { display: flex; justify-content: space-between; gap: 32px; padding-top: 12px; }
.left { min-width: 0; }
.title { display: flex; align-items: center; gap: 6px; font-size: 14px; line-height: 21px; color: var(--text-2); }
.eye { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; }
.value { font-size: 48px; font-weight: 600; line-height: 50.4px; margin: 4px 0 4px; letter-spacing: -1.44px; white-space: nowrap; color: var(--text); }
.value .ccy { font-size: 28px; margin-right: 8px; font-weight: 600; letter-spacing: 0; }
.bval .ccy { font-size: 18px; margin-right: 6px; font-weight: 600; letter-spacing: 0; }
.line { font-size: 14px; font-weight: 500; line-height: 21px; margin: 4px 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 2px; }
.period-btn { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--border-strong); border-radius: 6px; color: var(--text-2); background: transparent; padding: 0 4px 0 8px; height: 22px; font: 500 12px var(--font); margin-left: 6px; cursor: pointer; }
.info-btn { background: none; border: 0; color: var(--text-2); cursor: pointer; margin-left: 6px; display: inline-flex; }
.updated { font-size: 11px; color: var(--muted); margin-top: 12px; }
.offline { color: var(--warn); }
.right { flex: 0 0 auto; width: 470px; max-width: 50%; }
.tabs { display: flex; justify-content: flex-end; gap: 40px; margin-bottom: 22px; flex-wrap: wrap; }
// phone sheet: four equal tabs that always fit; long names wrap onto two lines
.tabs.m { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 14px 12px 0; .tab { white-space: normal; text-align: center; line-height: 17px; font-size: 13.5px; } }
.tab { background: none; border: 0; color: var(--muted); font: 500 14px/20px var(--font); padding: 4px 0; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
.tab:hover { color: var(--text-2); }
.tab.active { color: var(--text); font-weight: 600; border-bottom-color: var(--primary); }
.bench-grid { display: flex; justify-content: flex-end; gap: 56px; text-align: right; }
.blabel { font-size: 14px; color: var(--text-2); display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.bval { font-size: 30px; font-weight: 600; letter-spacing: -0.6px; margin: 6px 0 8px; white-space: nowrap; color: var(--text); }
.bline { font-size: 12.5px; font-weight: 500; line-height: 22px; color: var(--text); white-space: nowrap; }
.bline .tag { font-size: 10.5px; }
.ks-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 13px 24px; text-align: left; }
.ks-l { font-size: 12px; line-height: 18px; color: var(--text-2); }
.ks-v { font-size: 13px; line-height: 18px; font-weight: 500; margin-top: 2px; color: var(--text); }
.rows { display: flex; flex-direction: column; gap: 3px; margin-top: -8px; }
.panel.m .rows { margin-top: 0; gap: 8px; }
.row { display: flex; justify-content: space-between; gap: 20px; font-size: 13px; line-height: 18px; color: var(--text-2); span:last-child { color: var(--text); font-weight: 500; } }
.sheet { background: var(--surface) !important; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
.panel.m { padding: 16px; }
@media (max-width: 959px) {
  .ph { padding-top: 0; }
  .title { font-size: 14px; }
  .value { font-size: 36px; line-height: 40px; letter-spacing: -1px; margin: 8px 0 6px; }
  .value .ccy { font-size: 22px; }
  .line { margin: 2px 0; }
  .updated { margin-top: 8px; }
}
</style>
