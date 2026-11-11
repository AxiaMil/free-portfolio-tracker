<script setup lang="ts">
// Lot list: sortable table on desktop, expandable lot cards on phones. Emits `chart` to show a ticker in the price chart.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import type { TradeLot } from '../../engine/trades.ts';
import { money, pct, price, shares, signClass } from '../../format.ts';
import HelpTip from '../HelpTip.vue';
import ShareButton from '../ShareButton.vue';

const props = defineProps<{ lots: TradeLot[]; portfolioName: string; benchLabel: string; selected: string | null }>();
const emit = defineEmits<{ (e: 'chart', symbol: string): void }>();
const { mdAndUp } = useDisplay();

interface Col { key: string; label: string; get: (l: TradeLot) => number | string | null; help?: string; right?: boolean }
const COLS = computed<Col[]>(() => [
  { key: 'symbol', label: 'Ticker', get: (l) => l.symbol },
  { key: 'side', label: 'Side', get: (l) => l.side },
  { key: 'openDate', label: 'Open Date', get: (l) => l.openDate },
  { key: 'price', label: 'Price', get: (l) => l.price },
  { key: 'currency', label: 'Ccy', get: (l) => l.currency },
  { key: 'openShares', label: 'Shares', get: (l) => l.openShares, help: 'Open shares / shares bought in the lot (split-adjusted).' },
  { key: 'costBasis', label: 'Cost Basis', get: (l) => l.costBasis, help: 'What the lot cost in your portfolio currency at the trade date’s exchange rate, excluding commission.' },
  { key: 'totalGain', label: 'Total Gain', get: (l) => l.totalGain, help: 'Unrealized + realized gain + dividends − fees for this lot.' },
  { key: 'totalReturn', label: 'Total Return', get: (l) => l.totalReturn, help: 'Money-weighted return of the lot (dividends and partial sales counted on their dates) over its holding period.' },
  { key: 'alpha', label: `Alpha (vs ${props.benchLabel})`, get: (l) => l.alpha, help: `Total return minus ${props.benchLabel}’s return over the same holding period, both in your portfolio currency.` },
  { key: 'holdingDays', label: 'Holding Days', get: (l) => l.holdingDays },
]);

const sortKey = ref('openDate');
const sortDesc = ref(true);
function sortBy(key: string) {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value;
  else { sortKey.value = key; sortDesc.value = !['symbol', 'side', 'currency'].includes(key); }
}

const sorted = computed(() => {
  const col = COLS.value.find((c) => c.key === sortKey.value);
  if (!col) return props.lots;
  const dir = sortDesc.value ? -1 : 1;
  return [...props.lots].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return c * dir || a.symbol.localeCompare(b.symbol);
  });
});

const perPage = ref(10);
const page = ref(1);
const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / perPage.value)));
const paged = computed(() => sorted.value.slice((page.value - 1) * perPage.value, page.value * perPage.value));
watch(() => [props.lots.length, perPage.value], () => { if (page.value > pages.value) page.value = 1; });
watch(() => props.lots, () => { page.value = Math.min(page.value, pages.value); });

const expanded = ref(new Set<string>());
function toggle(id: string) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  expanded.value = s;
}

const openPct = (l: TradeLot) => (l.shares ? Math.max(0, Math.min(100, (l.openShares / l.shares) * 100)) : 0);
const range = computed(() => {
  const n = sorted.value.length;
  return n ? `${(page.value - 1) * perPage.value + 1}-${Math.min(page.value * perPage.value, n)}` : '0-0';
});

function csv() {
  return [
    ['Ticker', 'Name', 'Side', 'Open Date', 'Price', 'Ccy', 'Open Shares', 'Shares', 'Cost Basis', 'Total Gain', 'Total Return', `Alpha (vs ${props.benchLabel})`, 'Holding Days', 'Close Date'],
    ...sorted.value.map((l) => [l.symbol, l.name, l.side, l.openDate, +l.price.toFixed(4), l.currency, +l.openShares.toFixed(6), +l.shares.toFixed(6), +l.costBasis.toFixed(2), +l.totalGain.toFixed(2),
      l.totalReturn == null ? '' : +(l.totalReturn * 100).toFixed(4), l.alpha == null ? '' : +(l.alpha * 100).toFixed(4), l.holdingDays, l.closeDate ?? '']),
  ];
}
</script>

<template>
  <div class="lt">
    <!-- desktop -->
    <div v-if="mdAndUp" class="card">
      <div class="table-wrap">
        <table class="p-table lots">
          <thead>
            <tr>
              <th v-for="c in COLS" :key="c.key" class="sortable" @click="sortBy(c.key)">
                {{ c.label }}<HelpTip v-if="c.help" :size="13" :text="c.help" icon="mdi-information" class="ml-1" />
                <v-icon v-if="sortKey === c.key" size="13" class="ml-1">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon>
              </th>
              <th class="btn-col"><ShareButton :csv="csv" filename="trade-lots" icon label="Export lots" class="exp" /></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in paged" :key="l.id" :class="{ sel: selected === l.symbol }" @click="emit('chart', l.symbol)">
              <td class="tick"><b>{{ l.symbol }}</b><span class="name">{{ l.name }}</span></td>
              <td><span class="side" :class="l.side">{{ l.side }}</span></td>
              <td>{{ l.openDate }}</td>
              <td>{{ price(l.price) }}</td>
              <td class="text-2">{{ l.currency }}</td>
              <td>
                <div class="sh">{{ shares(l.openShares) }} / {{ shares(l.shares) }}</div>
                <div class="bar"><i :style="{ width: openPct(l) + '%' }" /></div>
              </td>
              <td>{{ money(l.costBasis) }}</td>
              <td :class="signClass(l.totalGain)">{{ money(l.totalGain, { sign: true }) }}</td>
              <td :class="signClass(l.totalReturn)">{{ pct(l.totalReturn) }}</td>
              <td :class="signClass(l.alpha)">{{ pct(l.alpha) }}</td>
              <td>{{ l.holdingDays }}</td>
              <td class="btn-col">
                <v-tooltip :text="`Show ${l.symbol} on the chart`">
                  <template #activator="{ props: tp }">
                    <button v-bind="tp" class="chart-btn" :class="{ on: selected === l.symbol }" :aria-label="`Show ${l.symbol} on the chart`" @click.stop="emit('chart', l.symbol)"><v-icon size="19">mdi-chart-line</v-icon></button>
                  </template>
                </v-tooltip>
              </td>
            </tr>
            <tr v-if="!paged.length"><td :colspan="COLS.length + 1" class="empty">No lots match these filters.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Items per page:</span>
        <v-select v-model="perPage" :items="[10, 25, 50, 100]" density="compact" variant="plain" hide-details class="per" />
        <span>{{ range }} of {{ sorted.length }}</span>
        <button class="pg" :disabled="page === 1" aria-label="First page" @click="page = 1"><v-icon>mdi-page-first</v-icon></button>
        <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
        <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
        <button class="pg" :disabled="page >= pages" aria-label="Last page" @click="page = pages"><v-icon>mdi-page-last</v-icon></button>
      </div>
    </div>

    <!-- phone -->
    <div v-else class="m">
      <div v-for="l in paged" :key="l.id" class="lcard" :class="{ sel: selected === l.symbol }">
        <div class="lc-head">
          <div class="lc-title"><b>{{ l.symbol }}</b><span class="name">{{ l.name }}</span></div>
          <span class="side" :class="l.side">{{ l.side }}</span>
          <button class="exp-btn" :aria-label="expanded.has(l.id) ? 'Collapse' : 'Expand'" :aria-expanded="expanded.has(l.id)" @click="toggle(l.id)">
            <v-icon size="22">{{ expanded.has(l.id) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </button>
        </div>
        <div class="lc-mid">
          <div class="lc-left">
            <div class="pf"><v-icon size="14">mdi-briefcase</v-icon>{{ portfolioName }}</div>
            <div class="gain" :class="signClass(l.totalGain)">{{ money(l.totalGain, { sign: true }) }} <small>({{ pct(l.totalReturn) }})</small></div>
          </div>
          <div class="lc-shares">
            <div>{{ shares(l.openShares) }} / {{ shares(l.shares) }} shares</div>
            <div class="bar wide"><i :style="{ width: openPct(l) + '%' }" /></div>
          </div>
        </div>
        <div class="lc-grid">
          <div><span>Open Date</span><b>{{ l.openDate }}</b></div>
          <div><span>Price</span><b>{{ price(l.price) }}</b></div>
          <div><span>Cost Basis</span><b>{{ money(l.costBasis) }}</b></div>
          <template v-if="expanded.has(l.id)">
            <div><span>Ccy</span><b>{{ l.currency }}</b></div>
            <div><span>Total Return</span><b :class="signClass(l.totalReturn)">{{ pct(l.totalReturn) }}</b></div>
            <div><span>Alpha (vs {{ benchLabel }})</span><b :class="signClass(l.alpha)">{{ pct(l.alpha) }}</b></div>
            <div><span>Holding Days</span><b>{{ l.holdingDays }}</b></div>
            <div><span>Market Value</span><b>{{ money(l.marketValue) }}</b></div>
            <div><span>Dividends</span><b>{{ money(l.dividends) }}</b></div>
            <div><span>Fees</span><b>{{ money(l.fees) }}</b></div>
            <div><span>Status</span><b>{{ l.closeDate ? `Closed ${l.closeDate}` : 'Open' }}</b></div>
            <div class="chart-cell"><button class="outline-btn sm" @click="emit('chart', l.symbol)"><v-icon size="16">mdi-chart-line</v-icon>Chart</button></div>
          </template>
        </div>
      </div>
      <div v-if="!paged.length" class="empty">No lots match these filters.</div>
      <div class="m-pager">
        <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
        <span>{{ range }} of {{ sorted.length }} results</span>
        <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
      </div>
      <div class="m-pager2">
        <span>Page</span>
        <v-select v-model="page" :items="Array.from({ length: pages }, (_, i) => i + 1)" density="compact" variant="outlined" hide-details class="pgsel" />
        <span class="ml-4">Items per page:</span>
        <template v-for="(n, i) in [10, 50, 100]" :key="n">
          <span v-if="i" class="sep">|</span>
          <button class="per-link" :class="{ on: perPage === n }" @click="perPage = n; page = 1">{{ n }}</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.table-wrap { overflow-x: auto; }
.lots th, .lots td { padding-left: 10px; padding-right: 2px; }
.lots th:first-child, .lots td:first-child { padding-left: 16px; }
.lots th.sortable { cursor: pointer; user-select: none; }
.lots tbody tr { cursor: pointer; }
.lots tbody tr.sel td { background: var(--primary-soft); }
.tick { min-width: 120px; b { display: block; font-size: 14px; line-height: 19px; } }
.tick .name { display: block; font-size: 11.5px; line-height: 15px; color: var(--muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side { display: inline-block; padding: 0 9px; border-radius: 9px; font-size: 12px; line-height: 19px; letter-spacing: 0.3px; }
.side.long { background: var(--primary-soft); color: #6ea6f0; }
.side.short { background: var(--neg-soft); color: var(--neg); }
.sh { font-size: 13.5px; line-height: 18px; }
.bar { width: 64px; height: 3px; border-radius: 2px; background: var(--border-strong); margin-top: 4px; overflow: hidden; i { display: block; height: 100%; background: #3d8bfd; border-radius: 2px; } }
.bar.wide { width: 100px; height: 4px; margin-left: auto; margin-top: 5px; }
.btn-col { width: 44px; text-align: right; padding-right: 10px !important; }
.exp { width: 32px; height: 32px; border: 0; color: var(--text-2); }
.chart-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-strong); background: transparent; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  &:hover { color: var(--text); background: var(--hover); }
  &.on { color: var(--primary-fg); border-color: var(--primary); background: var(--primary-soft); }
}
.empty { text-align: center; color: var(--muted); padding: 28px 0; }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 6px 12px; font-size: 12.8px; color: var(--text-2); border-top: 1px solid var(--border); }
.per { max-width: 72px; :deep(.v-field__input) { font-size: 12.8px; } }
.pg { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; &:disabled { color: var(--faint); cursor: default; } }

// phone cards
.lcard { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); padding: 12px 12px 14px; margin-bottom: 9px; }
.lcard.sel { border-color: var(--primary-soft); }
.lc-head { display: flex; align-items: center; gap: 8px; }
.lc-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; b { font-size: 17px; font-weight: 700; } .name { font-size: 12.5px; color: var(--text-2); margin-left: 5px; } }
.lc-head .side { font-size: 12px; line-height: 19px; padding: 0 9px; }
.exp-btn { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; padding: 0; margin-left: 4px; }
.lc-mid { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-top: 0; }
.lc-left { min-width: 0; }
.pf { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-2); line-height: 20px; .v-icon { color: var(--text-2); } }
.gain { font-size: 17px; font-weight: 600; line-height: 24px; margin-top: 0; white-space: nowrap; small { font-size: 12.5px; font-weight: 400; margin-left: 2px; } }
.lc-shares { text-align: right; font-size: 13.5px; line-height: 18px; padding-bottom: 10px; white-space: nowrap; }
.lc-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px 8px; margin-top: 8px;
  div { display: flex; flex-direction: column; min-width: 0; }
  span { font-size: 12.5px; color: var(--text-2); line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  b { font-size: 14.5px; font-weight: 400; line-height: 22px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
.chart-cell { justify-content: flex-end; }
.m-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; font-size: 13px; letter-spacing: 0.3px; color: var(--text); .pg { color: var(--text-2); &:disabled { color: var(--border-strong); } } }
.m-pager2 { display: flex; align-items: center; gap: 6px; margin-top: 14px; font-size: 14px; color: var(--text); flex-wrap: wrap;
  .pgsel { max-width: 80px; flex: none; margin-left: 4px; :deep(.v-field) { border-radius: 8px; } }
}
.sep { color: var(--text); }
.per-link { background: none; border: 0; color: var(--text); font-weight: 600; cursor: pointer; padding: 0 2px; font-size: 14px; &.on { text-decoration: underline; text-underline-offset: 3px; } }
</style>
