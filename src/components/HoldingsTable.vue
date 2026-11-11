<script setup lang="ts">
// Holdings table (desktop) / holding cards (mobile) with Overview, Cost, Gain and Price views.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRouter } from 'vue-router';
import { result, openAddTransaction, removePosition, store, toast } from '../store.ts';
import type { Holding } from '../engine/types.ts';
import { alloc, ccySymbol, money, pct, price, shares, signClass } from '../format.ts';
import PillToggle from './PillToggle.vue';
import ShareButton from './ShareButton.vue';
import HelpTip from './HelpTip.vue';
import HoldingDialog from './HoldingDialog.vue';

const { mdAndUp } = useDisplay();
const router = useRouter();
type View = 'Overview' | 'Cost' | 'Gain' | 'Price';
const view = ref<View>('Overview');
const search = ref('');
const showCash = ref(true);
const typeFilter = ref<string[]>([]);
const sortKey = ref<string>('allocation');
const sortDesc = ref(true);
const sortTouched = ref(false); // no arrow until the user picks a column
const perPage = ref(100);
const page = ref(1);
const mobileMode = ref<'Expand' | 'Compact'>('Expand');
const mobilePer = ref(10);
const confirmRemove = ref<string | null>(null);
const detail = ref<string | null>(null);

interface Col { key: string; label: string; get: (h: Holding) => number | string | null; fmt: (h: Holding) => string; cls?: (h: Holding) => string; help?: string; cash?: (h: Holding) => string }

const COLS: Record<View, Col[]> = {
  Overview: [
    { key: 'allocation', label: 'Allocation', get: (h) => h.allocation, fmt: (h) => alloc(h.allocation), cash: (h) => alloc(h.allocation) },
    { key: 'last', label: 'Last', get: (h) => h.last, fmt: (h) => price(h.last) },
    { key: 'avgCost', label: 'Avg Cost', get: (h) => h.avgCost, fmt: (h) => price(h.avgCost) },
    { key: 'dayGainPct', label: '1D Gain %', get: (h) => h.dayGainPct, fmt: (h) => pct(h.dayGainPct), cls: (h) => signClass(h.dayGainPct) },
    { key: 'unrealizedPct', label: 'Unr. Gain %', get: (h) => h.unrealizedPct, fmt: (h) => pct(h.unrealizedPct), cls: (h) => signClass(h.unrealizedPct), help: 'Unrealized gain divided by the cost of the shares you still hold (FX included).' },
    { key: 'dayGain', label: '1D Gain', get: (h) => h.dayGain, fmt: (h) => money(h.dayGain, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.dayGain) },
    { key: 'unrealized', label: 'Unr. Gain', get: (h) => h.unrealized, fmt: (h) => money(h.unrealized, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.unrealized) },
    { key: 'marketValue', label: 'Market Value', get: (h) => h.marketValue, fmt: (h) => money(h.marketValue, { decimals: 'auto' }), cash: (h) => money(h.marketValue) },
    { key: 'shares', label: 'Shares', get: (h) => h.shares, fmt: (h) => shares(h.shares) },
  ],
  Cost: [
    { key: 'allocation', label: 'Allocation', get: (h) => h.allocation, fmt: (h) => alloc(h.allocation), cash: (h) => alloc(h.allocation) },
    { key: 'costAllocation', label: 'Cost Allocation', get: (h) => h.costAllocation, fmt: (h) => alloc(h.costAllocation), cash: (h) => alloc(h.costAllocation) },
    { key: 'allocChg', label: 'Allocation Chg', get: (h) => h.allocation - h.costAllocation, fmt: (h) => pct(h.allocation - h.costAllocation), cash: (h) => pct(h.allocation - h.costAllocation) },
    { key: 'marketValue', label: 'Market Value', get: (h) => h.marketValue, fmt: (h) => money(h.marketValue, { decimals: 'auto' }), cash: (h) => money(h.marketValue) },
    { key: 'costValue', label: 'Cost Value', get: (h) => h.costValue, fmt: (h) => money(h.costValue, { decimals: 'auto' }), cash: (h) => money(h.costValue) },
    { key: 'unrealized', label: 'Unrealized Gain', get: (h) => h.unrealized, fmt: (h) => money(h.unrealized, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.unrealized) },
  ],
  Gain: [
    { key: 'allocation', label: 'Allocation', get: (h) => h.allocation, fmt: (h) => alloc(h.allocation), cash: (h) => alloc(h.allocation) },
    { key: 'unrealized', label: 'Unrealized Gain', get: (h) => h.unrealized, fmt: (h) => money(h.unrealized, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.unrealized) },
    { key: 'realized', label: 'Realized Gain', get: (h) => h.realized, fmt: (h) => money(h.realized, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.realized) },
    { key: 'dividends', label: 'Dividend', get: (h) => h.dividends, fmt: (h) => money(h.dividends, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.dividends) },
    { key: 'fees', label: 'Fees', get: (h) => -h.fees, fmt: (h) => money(-h.fees, { sign: true, decimals: 'auto' }), cls: (h) => signClass(-h.fees) },
    { key: 'totalGain', label: 'Total Gain', get: (h) => h.totalGain, fmt: (h) => money(h.totalGain, { sign: true, decimals: 'auto' }), cls: (h) => signClass(h.totalGain) },
    { key: 'totalReturn', label: 'Total Return', get: (h) => h.totalReturn, fmt: (h) => pct(h.totalReturn), cls: (h) => signClass(h.totalReturn) },
    { key: 'annualizedReturn', label: 'Annualized Return', get: (h) => h.annualizedReturn, fmt: (h) => pct(h.annualizedReturn), cls: (h) => signClass(h.annualizedReturn) },
  ],
  Price: [
    { key: 'allocation', label: 'Allocation', get: (h) => h.allocation, fmt: (h) => alloc(h.allocation), cash: (h) => alloc(h.allocation) },
    { key: 'last', label: 'Last', get: (h) => h.last, fmt: (h) => price(h.last) },
    { key: 'range52', label: '52-Wk Range', get: (h) => h.low52, fmt: () => '' },
    { key: 'offHigh52', label: '%Off 52W High', get: (h) => h.offHigh52, fmt: (h) => (h.offHigh52 == null ? '-' : `${(h.offHigh52 * 100).toFixed(1)}%`) },
  ],
};

const assetTypes = computed(() => [...new Set((result.value?.holdings ?? []).map((h) => h.assetType))]);

const rows = computed(() => {
  const r = result.value;
  if (!r) return [] as Holding[];
  const q = search.value.trim().toLowerCase();
  let hs = r.holdings.filter((h) => !q || h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  if (typeFilter.value.length) hs = hs.filter((h) => typeFilter.value.includes(h.assetType));
  const col = [...COLS[view.value], ...COLS.Overview, ...COLS.Gain].find((c) => c.key === sortKey.value);
  if (sortKey.value === 'symbol') hs = [...hs].sort((a, b) => a.symbol.localeCompare(b.symbol) * (sortDesc.value ? -1 : 1));
  else if (col) hs = [...hs].sort((a, b) => ((Number(col.get(a)) || 0) - (Number(col.get(b)) || 0)) * (sortDesc.value ? -1 : 1));
  return hs;
});

const total = computed(() => rows.value.length + (showCash.value ? 1 : 0));
const paged = computed(() => rows.value.slice((page.value - 1) * perPage.value, page.value * perPage.value));
const mobilePage = ref(1);
const mobileRows = computed(() => rows.value.slice((mobilePage.value - 1) * mobilePer.value, mobilePage.value * mobilePer.value));
const mobilePages = computed(() => Math.max(1, Math.ceil(rows.value.length / mobilePer.value)));
watch([search, view, typeFilter], () => { page.value = 1; mobilePage.value = 1; });

function sortBy(key: string) {
  sortTouched.value = true;
  if (sortKey.value === key) sortDesc.value = !sortDesc.value;
  else { sortKey.value = key; sortDesc.value = key === 'symbol' ? false : true; }
}

function rangePos(h: Holding) {
  if (h.low52 == null || h.high52 == null || h.last == null || h.high52 === h.low52) return 50;
  return Math.max(0, Math.min(100, ((h.last - h.low52) / (h.high52 - h.low52)) * 100));
}

function csv() {
  const cols = COLS[view.value];
  return [['Ticker', 'Name', ...cols.map((c) => c.label)], ...rows.value.map((h) => [h.symbol, h.name, ...cols.map((c) => (c.key === 'range52' ? `${h.low52 ?? ''}-${h.high52 ?? ''}` : c.fmt(h)))])];
}

function doRemove() {
  if (confirmRemove.value) {
    removePosition(confirmRemove.value);
    toast(`Removed ${confirmRemove.value} and its transactions`);
  }
  confirmRemove.value = null;
}

const SORT_OPTIONS = [
  { title: 'Allocation', value: 'allocation' }, { title: 'Ticker', value: 'symbol' }, { title: 'Daily Gain', value: 'dayGain' },
  { title: 'All Gain', value: 'unrealized' }, { title: 'Total Value', value: 'marketValue' }, { title: 'Daily Gain %', value: 'dayGainPct' }, { title: 'All Gain %', value: 'unrealizedPct' },
];
</script>

<template>
  <div v-if="result" class="ht">
    <!-- desktop -->
    <div v-if="mdAndUp" class="card">
      <div class="toolbar">
        <PillToggle v-model="view" :options="['Overview', 'Cost', 'Gain', 'Price'] as const" />
        <v-spacer />
        <v-text-field v-model="search" class="search" placeholder="Search Ticker" prepend-inner-icon="mdi-magnify" density="compact" variant="outlined" hide-details />
        <v-menu :close-on-content-click="false">
          <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="Filter"><v-icon :color="typeFilter.length ? 'primary' : undefined">mdi-filter</v-icon></button></template>
          <v-list density="compact" min-width="200">
            <v-list-subheader>Assets Type</v-list-subheader>
            <v-list-item v-for="t in assetTypes" :key="t" @click="typeFilter = typeFilter.includes(t) ? typeFilter.filter((x) => x !== t) : [...typeFilter, t]">
              <template #prepend><v-checkbox-btn :model-value="typeFilter.includes(t)" density="compact" /></template>{{ t }}
            </v-list-item>
          </v-list>
        </v-menu>
        <v-tooltip :text="showCash ? 'Hide cash' : 'Show cash'"><template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="Toggle cash" @click="showCash = !showCash"><v-icon :color="showCash ? undefined : 'var(--faint)'">mdi-cash-multiple</v-icon></button></template></v-tooltip>
        <button class="outline-btn rebal" @click="router.push('/allocation/rebalance')"><v-icon size="18">mdi-scale-balance</v-icon>Rebalance</button>
        <ShareButton icon :csv="csv" filename="holdings" />
      </div>
      <div class="table-wrap">
        <table class="p-table">
          <thead>
            <tr>
              <th class="sortable" @click="sortBy('symbol')">Ticker <v-icon size="13" class="ml-2">mdi-swap-vertical</v-icon></th>
              <th v-for="c in COLS[view]" :key="c.key" class="sortable" @click="c.key !== 'range52' && sortBy(c.key)">
                {{ c.label }} <HelpTip v-if="c.help" :size="14" :text="c.help" icon="mdi-information" />
                <v-icon v-if="sortTouched && sortKey === c.key" size="14">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-if="showCash && page === 1" class="cash-row">
              <td class="tick"><b>{{ ccySymbol(result.base) }} Cash</b></td>
              <td v-for="c in COLS[view]" :key="c.key">{{ c.cash ? c.cash(result.cashRow) : '' }}</td>
              <td class="menu-cell">
                <v-menu><template #activator="{ props }"><button v-bind="props" class="row-menu" aria-label="Cash actions"><v-icon>mdi-menu-down</v-icon></button></template>
                  <v-list density="compact"><v-list-item prepend-icon="mdi-plus" @click="openAddTransaction({ action: 'Deposit', symbol: 'CASH' })">Add Transaction</v-list-item></v-list>
                </v-menu>
              </td>
            </tr>
            <tr v-for="h in paged" :key="h.symbol">
              <td class="tick"><button class="tick-btn" @click="detail = h.symbol"><b>{{ h.symbol }}</b><span class="name">{{ h.name }}</span></button></td>
              <td v-for="c in COLS[view]" :key="c.key" :class="c.cls ? c.cls(h) : ''">
                <template v-if="c.key === 'range52'">
                  <div class="range52"><span>{{ price(h.low52) }}</span><div class="bar"><div class="dot" :style="{ left: rangePos(h) + '%' }" /></div><span>{{ price(h.high52) }}</span></div>
                </template>
                <template v-else-if="c.key === 'offHigh52'"><span class="off-chip">{{ c.fmt(h) }}</span></template>
                <template v-else>{{ c.fmt(h) }}</template>
              </td>
              <td class="menu-cell">
                <v-menu><template #activator="{ props }"><button v-bind="props" class="row-menu" :aria-label="`${h.symbol} actions`"><v-icon>mdi-menu-down</v-icon></button></template>
                  <v-list density="compact">
                    <v-list-item prepend-icon="mdi-plus" @click="openAddTransaction({ symbol: h.symbol, action: 'Buy' })">Add Transaction</v-list-item>
                    <v-list-item prepend-icon="mdi-minus" @click="confirmRemove = h.symbol">Remove Position</v-list-item>
                    <v-list-item prepend-icon="mdi-file-document-outline" @click="router.push({ path: '/transactions', query: { q: h.symbol } })">View Transactions</v-list-item>
                  </v-list>
                </v-menu>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">Items per page:</span>
        <v-select v-model="perPage" :items="[10, 25, 50, 100]" density="compact" variant="plain" hide-details class="per" />
        <span>{{ total ? (page - 1) * perPage + 1 : 0 }}-{{ Math.min(page * perPage, total) }} of {{ total }}</span>
        <button class="pg" :disabled="page === 1" aria-label="First page" @click="page = 1"><v-icon>mdi-page-first</v-icon></button>
        <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
        <button class="pg" :disabled="page * perPage >= rows.length" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
        <button class="pg" :disabled="page * perPage >= rows.length" aria-label="Last page" @click="page = Math.ceil(rows.length / perPage)"><v-icon>mdi-page-last</v-icon></button>
      </div>
    </div>

    <!-- mobile -->
    <div v-else class="m">
      <div class="m-top">
        <PillToggle v-model="mobileMode" :options="['Expand', 'Compact'] as const" />
        <v-spacer />
        <v-menu :close-on-content-click="false">
          <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="Filter"><v-icon>mdi-filter</v-icon></button></template>
          <v-list density="compact"><v-list-item v-for="t in assetTypes" :key="t" @click="typeFilter = typeFilter.includes(t) ? typeFilter.filter((x) => x !== t) : [...typeFilter, t]"><template #prepend><v-checkbox-btn :model-value="typeFilter.includes(t)" density="compact" /></template>{{ t }}</v-list-item></v-list>
        </v-menu>
        <button class="icon-btn" aria-label="Toggle cash" @click="showCash = !showCash"><v-icon>mdi-cash-multiple</v-icon></button>
      </div>
      <v-text-field v-model="search" class="m-search" placeholder="Search Ticker" append-inner-icon="mdi-magnify" density="compact" variant="outlined" hide-details />
      <div class="m-sort">
        <v-select v-model="sortKey" :items="SORT_OPTIONS" label="Sorted by" variant="underlined" density="compact" hide-details class="sort-sel" />
        <button class="desc" @click="sortDesc = !sortDesc">{{ sortDesc ? 'Descending' : 'Ascending' }} <v-icon size="16">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></button>
      </div>
      <div v-if="showCash && mobilePage === 1" class="hcard cash">
        <b>{{ ccySymbol(result.base) }} Cash</b><span>{{ alloc(result.cashRow.allocation) }}</span><span>{{ money(result.cashRow.marketValue) }}</span>
      </div>
      <div v-for="h in mobileRows" :key="h.symbol" class="hcard" @click="detail = h.symbol">
        <div class="hc-left">
          <div class="hc-sym">{{ h.symbol }}</div>
          <div class="hc-name">{{ h.name }}</div>
          <div class="hc-last">{{ price(h.last) }}</div>
          <div :class="signClass(h.dayGainPct)">{{ pct(h.dayGainPct) }}</div>
          <template v-if="mobileMode === 'Expand'"><div class="hc-lbl mt-3">Allocation</div><div>{{ alloc(h.allocation) }}</div></template>
        </div>
        <div class="hc-grid">
          <span class="hc-lbl">Daily Gain</span><span :class="signClass(h.dayGain)">{{ money(h.dayGain, { sign: true }) }} ({{ pct(h.dayGainPct, { sign: false }) }})</span>
          <span class="hc-lbl">All Gain</span><span :class="signClass(h.unrealized)">{{ money(h.unrealized, { sign: true }) }} ({{ pct(h.unrealizedPct, { sign: false }) }})</span>
          <template v-if="mobileMode === 'Expand'">
            <span class="hc-lbl">Avg. Cost</span><span>{{ price(h.avgCost) }}</span>
            <span class="hc-lbl">Shares</span><span>{{ shares(h.shares) }}</span>
            <span class="hc-lbl">Total Value</span><span>{{ money(h.marketValue) }}</span>
          </template>
        </div>
      </div>
      <div class="m-pager">
        <button class="pg round" :disabled="mobilePage === 1" aria-label="Previous page" @click="mobilePage--"><v-icon>mdi-chevron-left</v-icon></button>
        <span>{{ rows.length ? (mobilePage - 1) * mobilePer + 1 : 0 }}-{{ Math.min(mobilePage * mobilePer, rows.length) }} of {{ rows.length + (showCash ? 1 : 0) }} results</span>
        <button class="pg round" :disabled="mobilePage >= mobilePages" aria-label="Next page" @click="mobilePage++"><v-icon>mdi-chevron-right</v-icon></button>
      </div>
      <div class="m-pager2">
        <span>Page</span>
        <v-select v-model="mobilePage" :items="Array.from({ length: mobilePages }, (_, i) => i + 1)" density="compact" hide-details class="pgsel" />
        <span>Items per page:</span>
        <button v-for="n in [10, 20, 50]" :key="n" class="per-link" :class="{ on: mobilePer === n }" @click="mobilePer = n; mobilePage = 1">{{ n }}</button>
      </div>
    </div>

    <v-dialog :model-value="!!confirmRemove" max-width="420" @update:model-value="confirmRemove = null">
      <v-card class="pa-2">
        <v-card-title>Remove {{ confirmRemove }}?</v-card-title>
        <v-card-text>This deletes every transaction for {{ confirmRemove }} from this portfolio. A backup of your data is kept in the data/backups folder.</v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="confirmRemove = null">Cancel</v-btn><v-btn color="error" variant="flat" @click="doRemove">Remove</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
    <HoldingDialog v-model="detail" />
  </div>
</template>

<style scoped lang="scss">
.toolbar { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.search { max-width: 240px; :deep(input) { font-size: 15px; } :deep(.v-field) { border-radius: 8px; } }
.icon-btn { background: none; border: 0; color: var(--text-2); cursor: pointer; padding: 4px; display: inline-flex; .v-icon { font-size: 20px; } }
.table-wrap { overflow-x: auto; }
.p-table th.sortable { cursor: pointer; user-select: none; }
.tick { min-width: 140px; }
.tick-btn { background: none; border: 0; color: var(--text); text-align: left; cursor: pointer; display: flex; flex-direction: column; font-size: 14px; line-height: 19px; }
.tick-btn .name { font-size: 11.5px; line-height: 15px; color: var(--muted); font-weight: 400; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cash-row td { font-size: 14px; }
.menu-cell { width: 36px; text-align: right; }
.row-menu { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; }
.range52 { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.range52 .bar { position: relative; width: 100px; height: 3px; border-radius: 2px; background: var(--border-strong); }
.range52 .dot { position: absolute; top: -3.5px; width: 10px; height: 10px; border-radius: 50%; background: var(--text); transform: translateX(-50%); }
.off-chip { display: inline-block; min-width: 54px; padding: 2px 8px; border-radius: 6px; background: var(--neg-soft); color: var(--neg); text-align: center; font-size: 13px; }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 6px 12px; font-size: 12.8px; color: var(--text-2); border-top: 1px solid var(--border); }
.per { max-width: 72px; :deep(.v-field__input) { font-size: 12.8px; } }
.pg { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; &:disabled { color: var(--faint); cursor: default; } &.round { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-2); align-items: center; justify-content: center; } }
.m-top { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.m-search { margin-top: 12px; :deep(input) { font-size: 15px; } :deep(.v-field) { border-radius: 8px; } }
.m-sort { display: flex; align-items: flex-end; gap: 16px; margin: 12px 0; .sort-sel { max-width: 180px; } }
.desc { background: none; border: 0; color: var(--text); font-weight: 600; letter-spacing: 0.9px; font-size: 11px; cursor: pointer; padding: 0 0 8px 36px; display: inline-flex; align-items: center; gap: 2px; }
.hcard { display: flex; gap: 14px; border: 1px solid var(--border); border-radius: 16px; padding: 12px; margin-bottom: 10px; background: var(--surface); cursor: pointer; font-size: 14px; }
.hcard.cash { justify-content: space-between; align-items: center; }
.hc-left { width: 92px; flex: none; min-width: 0; }
.hc-sym { font-weight: 700; font-size: 16px; line-height: 22px; }
.hc-name { color: var(--muted); font-size: 11px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hc-last { font-size: 17px; line-height: 22px; margin-top: 4px; }
.hc-lbl { color: var(--text-2); font-size: 12px; }
.hc-left .hc-lbl { font-size: 10.5px; margin-top: 10px !important; }
.hc-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-content: start; align-items: baseline; font-size: 14px; line-height: 20px; }
.m-pager { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12.8px; letter-spacing: 0.4px; color: var(--text); }
.m-pager2 { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; font-weight: 600; .pgsel { max-width: 80px; } }
.per-link { background: none; border: 0; color: var(--text); font-weight: 600; cursor: pointer; padding: 0 2px; &.on { text-decoration: underline; } }
</style>
