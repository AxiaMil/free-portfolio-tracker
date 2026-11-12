<script setup lang="ts">
// Rebalance calculator: set a target (% or amount) per asset and see what to buy or sell to get there.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { result, store } from '../store.ts';
import { ccySymbol, hidden, num } from '../format.ts';
import PillToggle from '../components/PillToggle.vue';
import NumField from '../components/rebalance/NumField.vue';
import AddAssetDialog from '../components/rebalance/AddAssetDialog.vue';
import RebalanceResults from '../components/rebalance/RebalanceResults.vue';
import { useRebalance, type RebalanceMode } from '../components/rebalance/useRebalance.ts';

const { mdAndUp } = useDisplay();
const rb = useRebalance();
const { rows, totals, mode, cashValue } = rb;

const sym = computed(() => ccySymbol(store.base).trim());
const modeOptions = computed(() => [
  { value: 'pct' as RebalanceMode, label: '%' },
  { value: 'value' as RebalanceMode, label: sym.value },
]);
const modeModel = computed<RebalanceMode>({ get: () => mode.value, set: (m) => rb.setMode(m) });

const isPct = computed(() => mode.value === 'pct');
const targetLabel = computed(() => (isPct.value ? 'Target Allocation' : 'Target Value'));
const pct2 = (r: number) => `${num(r * 100, 2)}%`;
const amount = (v: number) => `${sym.value} ${hidden() ? '••••' : num(v, 2)}`;

const cashRow = computed(() => rows.value[0]);

// pagination: cash counts as one of the rows on the first page
const PER_OPTIONS = [10, 50, 100];
const perPage = ref(10);
const page = ref(1);
const totalRows = computed(() => rows.value.length);
const pages = computed(() => Math.max(1, Math.ceil(totalRows.value / perPage.value)));
const pageRows = computed(() => rows.value.slice((page.value - 1) * perPage.value, page.value * perPage.value).filter((r) => r.kind !== 'cash'));
const showCash = computed(() => page.value === 1);
const rangeText = computed(() => {
  const n = totalRows.value;
  if (!n) return '0 results';
  return `${(page.value - 1) * perPage.value + 1}-${Math.min(page.value * perPage.value, n)} of ${n} results`;
});
watch([perPage, totalRows], () => { if (page.value > pages.value) page.value = pages.value; });
function setPer(n: number) { perPage.value = n; page.value = 1; }

const addOpen = ref(false);
function onAdd(s: string) {
  if (rb.addAsset(s)) page.value = pages.value; // show the new row
}

const targetProps = computed(() =>
  isPct.value ? { label: targetLabel.value, suffix: '%', decimals: 2, min: 0 } : { label: targetLabel.value, prefix: sym.value, decimals: 2, min: 0 },
);
</script>

<template>
  <div v-if="result" class="page rebal" :class="{ m: !mdAndUp }">
    <div class="head">
      <h1 class="r-title">Rebalance Calculator</h1>
      <v-spacer />
      <span v-if="mdAndUp" class="tb-lbl">Target by</span>
      <PillToggle v-model="modeModel" :options="modeOptions" size="sm" class="tb" />
      <v-tooltip text="Back to your current allocation (clears targets, cash amount and added assets)">
        <template #activator="{ props }">
          <button v-bind="props" class="reset" @click="rb.reset()"><v-icon size="16">mdi-refresh</v-icon>Reset</button>
        </template>
      </v-tooltip>
    </div>

    <!-- cash -->
    <div v-if="showCash && cashRow" class="rcard cash">
      <div class="c-name"><b>{{ cashRow.name }}</b></div>
      <div class="c-val">
        <NumField class="cur-field" label="Current Value" :prefix="sym" :min="0" :model-value="Math.round(cashValue * 100) / 100" @update:model-value="rb.setCash($event)" />
      </div>
      <div class="c-alloc"><div class="lbl">Current Allocation</div><div class="val">{{ pct2(cashRow.currentPct) }}</div></div>
      <v-icon class="arrow">mdi-arrow-right-bold</v-icon>
      <div class="c-tgt"><NumField v-bind="targetProps" :model-value="cashRow.input" @update:model-value="rb.setTarget(cashRow.key, $event)" /></div>
    </div>

    <!-- holdings and added assets -->
    <div class="list">
      <div v-for="r in pageRows" :key="r.key" class="rcard" :class="{ extra: r.kind === 'extra' }">
        <div class="c-name">
          <b>{{ r.symbol }}</b>
          <span class="nm">{{ r.kind === 'extra' && r.name === r.symbol ? 'New target' : r.name }}</span>
        </div>
        <div class="c-val"><div class="lbl">Current Value</div><div class="val">{{ amount(r.current) }}</div></div>
        <div class="c-alloc"><div class="lbl">Current Allocation</div><div class="val">{{ pct2(r.currentPct) }}</div></div>
        <v-icon class="arrow">mdi-arrow-right-bold</v-icon>
        <div class="c-tgt"><NumField v-bind="targetProps" :model-value="r.input" @update:model-value="rb.setTarget(r.key, $event)" /></div>
        <button v-if="r.kind === 'extra'" class="rm" :aria-label="`Remove ${r.symbol}`" @click="rb.removeAsset(r.symbol)"><v-icon size="18">mdi-close</v-icon></button>
      </div>
    </div>

    <button class="add-asset" @click="addOpen = true">+ Add Asset</button>

    <!-- pagination -->
    <div v-if="mdAndUp" class="pager">
      <button class="tri" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon size="28">mdi-menu-left</v-icon></button>
      <span class="range">{{ rangeText }}</span>
      <button class="tri" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon size="28">mdi-menu-right</v-icon></button>
      <span class="pg-lbl">Page</span>
      <v-select v-model="page" :items="Array.from({ length: pages }, (_, i) => i + 1)" variant="outlined" density="compact" hide-details class="pg-sel" />
      <span class="pg-lbl">Items per page:</span>
      <span class="per">
        <template v-for="(n, i) in PER_OPTIONS" :key="n"><span v-if="i" class="bar">|</span><button :class="{ on: perPage === n }" @click="setPer(n)">{{ n }}</button></template>
      </span>
    </div>
    <div v-else class="m-pager">
      <div class="m-row">
        <button class="round" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon size="20">mdi-chevron-left</v-icon></button>
        <span class="range">{{ rangeText }}</span>
        <button class="round" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon size="20">mdi-chevron-right</v-icon></button>
      </div>
      <div class="m-row2">
        <span>Page</span>
        <v-select v-model="page" :items="Array.from({ length: pages }, (_, i) => i + 1)" variant="outlined" density="compact" hide-details class="pg-sel" />
        <span>Items per page:</span>
        <span class="per">
          <template v-for="(n, i) in PER_OPTIONS" :key="n"><span v-if="i" class="bar">|</span><button :class="{ on: perPage === n }" @click="setPer(n)">{{ n }}</button></template>
        </span>
      </div>
    </div>

    <RebalanceResults :rows="rows" :totals="totals" />

    <AddAssetDialog v-model="addOpen" @add="onAdd" />
  </div>
</template>

<style scoped lang="scss">
.head { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
.r-title { font-size: 20px; line-height: 28px; font-weight: 700; color: var(--text); margin: 0; white-space: nowrap; }
.tb-lbl { font-size: 13px; color: var(--text-2); margin-right: -2px; }
.tb { padding: 3px; :deep(.pill) { font-size: 12px; line-height: 16px; padding: 3px 11px; } }
.reset {
  display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--text); cursor: pointer;
  font: 600 13px/1 var(--font); letter-spacing: 1px; padding: 6px 4px;
  &:hover { color: var(--text-2); }
}

// one row per asset; column widths tuned for a 1512px screen
.rcard {
  position: relative;
  display: grid;
  grid-template-columns: 187px 176px 0.89fr 28px 1fr;
  align-items: center;
  min-height: 54px;
  padding: 0 68px 0 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.rcard.cash { min-height: 53px; margin-top: 19px; }
.list { margin-top: 25px; }
.c-name { display: flex; flex-direction: column; min-width: 0; line-height: 21px; b { font-size: 16px; font-weight: 700; } }
.nm { font-size: 12px; line-height: 18px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.lbl { font-size: 12px; line-height: 16px; color: var(--text); }
.val { font-size: 16px; line-height: 22px; color: var(--text); white-space: nowrap; }
.cur-field { width: 145px; margin-left: -8px; }
.arrow { color: var(--text); font-size: 28px; justify-self: center; }
.c-tgt { width: 130px; justify-self: end; }
.rm {
  position: absolute; right: 18px; top: 50%; transform: translateY(-50%); background: none; border: 0; color: var(--muted); cursor: pointer;
  display: inline-flex; padding: 4px; border-radius: 50%;
  &:hover { color: var(--text); background: var(--line-soft); }
}
.rcard :deep(.v-field) { height: 39px; }
.rcard :deep(.v-field__input) { min-height: 39px; padding-top: 7px; padding-bottom: 7px; }
.add-asset {
  display: block; width: 100%; height: 28px; margin-top: 10px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--surface-2);
  color: var(--text); font: 600 12.5px/1 var(--font); letter-spacing: 1.2px; cursor: pointer;
  &:hover { background: var(--surface-3); }
}
.pager { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-left: 14px; font-size: 16px; }
.tri { background: none; border: 0; color: var(--muted); cursor: pointer; display: inline-flex; padding: 0; &:disabled { color: var(--faint); cursor: default; } }
.range { color: var(--text); white-space: nowrap; }
.pg-lbl { color: var(--text-2); margin-left: 6px; }
.pg-sel { max-width: 80px; flex: none; :deep(.v-field) { border-radius: 10px; } }
.per { color: var(--text-2); display: inline-flex; align-items: center; gap: 4px; button { background: none; border: 0; color: var(--text-2); cursor: pointer; font: inherit; padding: 0 2px; &.on { color: var(--text); font-weight: 700; text-decoration: underline; } } }

// phone: two-line cards
.rebal.m {
  .head { gap: 8px; margin-top: 16px; }
  .reset { padding: 6px 0; }
  .rcard {
    grid-template-columns: 158px 1fr 130px;
    grid-template-areas: 'name val val' 'alloc arrow tgt';
    row-gap: 4px;
    padding: 10px 12px 10px 16px;
    min-height: 0;
  }
  .rcard.cash { grid-template-areas: 'name val val' 'alloc arrow tgt'; margin-top: 18px; padding-top: 12px; }
  .c-name { grid-area: name; align-self: start; }
  .c-val { grid-area: val; align-self: start; }
  .rcard.cash .c-val { justify-self: start; margin-left: -18px; }
  .c-alloc { grid-area: alloc; padding-left: 9px; align-self: end; padding-bottom: 2px; }
  .arrow { grid-area: arrow; font-size: 26px; }
  .c-tgt { grid-area: tgt; justify-self: end; }
  .nm { max-width: 150px; }
  .cur-field { margin-left: 0; }
  .list { margin-top: 24px; }
  .rm { top: 10px; right: 8px; transform: none; }
  .rcard.extra .c-val { padding-right: 26px; }
}
.m-pager { margin-top: 14px; font-size: 13px; }
.m-row { display: flex; align-items: center; justify-content: space-between; .range { font-size: 13px; letter-spacing: 0.4px; } }
.round {
  width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--surface-2); color: var(--text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  &:disabled { color: var(--faint); cursor: default; }
}
.m-row2 { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-weight: 600; .per { color: var(--text); button { color: var(--text); font-weight: 600; } } }
</style>
