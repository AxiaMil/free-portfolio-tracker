<script setup lang="ts">
// Preview of a CSV import: every parsed row with a checkbox, likely duplicates unticked, then addTransactions().
// A row without a price gets the day's close, marked as such; one with no close to be found can't be imported.
import { computed, ref, watch } from 'vue';
import { activePortfolio, addTransactions, market, marketView, toast } from '../../store.ts';
import { getCharts } from '../../market/client.ts';
import type { Txn } from '../../engine/types.ts';
import { csvLine, downloadText, fmtPrice, fmtShares, fmt2 } from './fmt.ts';
import PDialog from './PDialog.vue';

const props = defineProps<{ txns: Omit<Txn, 'id'>[]; errors: string[]; filename: string }>();
const model = defineModel<boolean>({ default: false });

const key = (t: Omit<Txn, 'id'>) => [t.date, t.action, t.symbol.toUpperCase(), +Number(t.shares).toFixed(8), +Number(t.price).toFixed(8)].join('|');
const existing = computed(() => new Set((activePortfolio.value?.transactions ?? []).map(key)));
const dup = (t: Omit<Txn, 'id'>) => existing.value.has(key(t));
const picked = ref<boolean[]>([]);
/** each row's price: from the file, or the day's close (filled), or null while none is known */
const prices = ref<Array<number | null>>([]);
const filled = ref<boolean[]>([]);
const looking = ref(false);
const page = ref(1);
const PER = 50;
const PRICED = new Set(['Buy', 'Sell', 'Transfer in', 'Transfer out']);

async function fillPrices() {
  // only share prices: a dividend's amount per share isn't the day's close
  const missing = props.txns.map((t, i) => ({ t, i })).filter(({ t, i }) => prices.value[i] == null && PRICED.has(t.action));
  if (!missing.length) return;
  looking.value = true;
  try {
    const need = [...new Set(missing.map(({ t }) => t.symbol.toUpperCase()))].filter((s) => !marketView.value.custom.has(s) && !market.value.charts[s]?.bars?.length);
    if (need.length) {
      const got = await getCharts(need);
      market.value = { ...market.value, charts: { ...market.value.charts, ...Object.fromEntries(Object.entries(got).filter(([, c]) => c.bars?.length)) } };
    }
    for (const { t, i } of missing) {
      const px = marketView.value.tradedCloseAt(t.symbol.toUpperCase(), t.date);
      if (px == null) continue;
      prices.value[i] = +px.toFixed(4);
      filled.value[i] = true;
      picked.value[i] = !dup({ ...t, price: prices.value[i]! });
    }
  } catch { /* offline: those rows stay without a price */ } finally {
    looking.value = false;
  }
}

watch(() => [model.value, props.txns] as const, ([open]) => {
  if (!open) return;
  prices.value = props.txns.map((t) => (isFinite(t.price) ? t.price : null));
  filled.value = props.txns.map(() => false);
  picked.value = props.txns.map((t, i) => prices.value[i] != null && !dup(t));
  page.value = 1;
  void fillPrices();
}, { immediate: true });
const noPrice = computed(() => prices.value.filter((p) => p == null).length);

const count = computed(() => picked.value.filter(Boolean).length);
const dupCount = computed(() => props.txns.filter(dup).length);
const pages = computed(() => Math.max(1, Math.ceil(props.txns.length / PER)));
const rows = computed(() => props.txns.map((t, i) => ({ t, i })).slice((page.value - 1) * PER, page.value * PER));
const allOn = computed(() => picked.value.length > 0 && picked.value.every((p, i) => p || prices.value[i] == null) && picked.value.some(Boolean));

function toggleAll() {
  const v = !allOn.value;
  picked.value = picked.value.map((_, i) => v && prices.value[i] != null);
}

function doImport() {
  const chosen = props.txns.map((t, i) => ({ ...t, price: prices.value[i] as number })).filter((_, i) => picked.value[i] && prices.value[i] != null);
  if (!chosen.length) return;
  addTransactions(chosen);
  toast(`${chosen.length} transaction${chosen.length > 1 ? 's' : ''} imported`);
  model.value = false;
}

function template() {
  downloadText([
    csvLine(['Date', 'Action', 'Ticker', 'Price', 'Currency', 'Shares', 'Commission', 'Note']),
    csvLine(['2025-01-15', 'Buy', 'AAPL', 230.5, 'Market', 10, 1.5, '']),
    csvLine(['2025-02-01', 'Deposit', 'CASH', 1, 'USD', 5000, 0, 'Monthly top-up']),
  ].join('\n'), 'transactions-template.csv');
}
</script>

<template>
  <PDialog v-model="model" step="Upload Files" :title="`Import ${txns.length} transaction${txns.length === 1 ? '' : 's'}`" :max-width="900" fullscreen-mobile>
    <div class="summary">
      <span><v-icon size="16" class="mr-1">mdi-file-delimited-outline</v-icon>{{ filename }}</span>
      <span v-if="dupCount" class="dup-note"><v-icon size="16" class="mr-1">mdi-content-duplicate</v-icon>{{ dupCount }} already in {{ activePortfolio?.name }} (unticked)</span>
      <span v-if="looking" class="muted"><v-icon size="16" class="mr-1">mdi-timer-sand</v-icon>Looking up missing prices…</span>
      <span v-else-if="noPrice" class="err-note"><v-icon size="16" class="mr-1">mdi-alert-outline</v-icon>{{ noPrice }} without a price (unticked)</span>
      <span v-if="errors.length" class="err-note"><v-icon size="16" class="mr-1">mdi-alert-outline</v-icon>{{ errors.length }} line{{ errors.length > 1 ? 's' : '' }} skipped</span>
      <v-spacer />
      <button class="link" @click="template">Download CSV template</button>
    </div>
    <div class="tw">
      <table class="p-table imp">
        <thead>
          <tr>
            <th class="cbc"><button class="cb" :aria-label="allOn ? 'Untick all' : 'Tick all'" @click="toggleAll"><v-icon size="18">{{ allOn ? 'mdi-checkbox-marked' : count ? 'mdi-minus-box' : 'mdi-checkbox-blank-outline' }}</v-icon></button></th>
            <th>Date</th><th>Action</th><th>Ticker</th><th>Price</th><th>Currency</th><th>Shares</th><th>Commission</th><th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ t, i } in rows" :key="i" :class="{ off: !picked[i] }">
            <td class="cbc"><button class="cb" :class="{ on: picked[i] }" :disabled="prices[i] == null" :aria-label="`Include row ${i + 1}`" @click="picked[i] = !picked[i]"><v-icon size="18">{{ picked[i] ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}</v-icon></button></td>
            <td>{{ t.date }}</td><td>{{ t.action }}</td><td>{{ t.symbol === 'CASH' ? '-' : t.symbol }}</td><td>{{ prices[i] == null ? '-' : fmtPrice(prices[i]) }}</td>
            <td>{{ t.currency }}</td><td>{{ fmtShares(t.shares) }}</td><td>{{ fmt2(t.commission) }}</td>
            <td><span v-if="prices[i] == null" class="tag">{{ looking ? 'Looking up price' : 'No price' }}</span><span v-else-if="filled[i]" class="tag info">Day's close</span><span v-if="dup(t)" class="tag">Duplicate</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pages > 1" class="pgr">
      <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
      <span>Page {{ page }} of {{ pages }}</span>
      <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
    </div>
    <details v-if="errors.length" class="errs"><summary>Skipped lines</summary><div v-for="e in errors" :key="e">{{ e }}</div></details>
    <template #actions>
      <span class="muted sel">{{ count }} selected</span>
      <v-spacer />
      <button class="tbtn" @click="model = false">Cancel</button>
      <button class="tbtn primary" :disabled="!count" data-test="do-import" @click="doImport">Import {{ count }}</button>
    </template>
  </PDialog>
</template>

<style scoped lang="scss">
.summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 12px; font-size: 13px; color: var(--text-2); }
.dup-note { color: var(--warn); }
.err-note { color: var(--neg); }
.link { background: none; border: 0; padding: 0; color: var(--primary-text); font-weight: 600; cursor: pointer; font-size: 13px; }
.tw { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
.imp td, .imp th { height: 36px; font-size: 13.5px; }
.imp th { font-size: 11.5px; }
.cbc { width: 36px; padding-right: 0 !important; }
.cb { background: none; border: 0; padding: 0; cursor: pointer; color: var(--text-2); display: inline-flex; &.on { color: var(--primary); } }
.imp thead .cb .v-icon { color: var(--text-2); }
tr.off td:not(.cbc) { color: var(--faint); }
.tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: rgba(244, 183, 64, 0.12); color: var(--warn); white-space: nowrap; & + .tag { margin-left: 4px; } &.info { background: var(--primary-soft); color: var(--primary-text); } }
.cb:disabled { cursor: default; opacity: 0.4; }
.pgr { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 8px; font-size: 13px; }
.pg { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; &:disabled { color: var(--faint); cursor: default; } }
.errs { margin-top: 10px; font-size: 12.5px; color: var(--text-2); summary { cursor: pointer; } }
.sel { font-size: 13px; padding-left: 4px; }
</style>
