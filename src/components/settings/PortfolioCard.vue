<script setup lang="ts">
// One portfolio's settings as a card ("Currency: USD  Benchmark: S&P500  Transaction Source: ...").
// Every value is a button that opens a small editor.
import { computed, ref } from 'vue';
import { BENCH_NAMES, benchName, fetchSearch, refreshMarket, toast } from '../../store.ts';
import type { Portfolio } from '../../engine/types.ts';
import { CURRENCIES } from '../txn/fmt.ts';

const props = defineProps<{ p: Portfolio; active: boolean; canDelete: boolean; showActive?: boolean }>();
const expanded = defineModel<boolean>('expanded', { default: false });
const emit = defineEmits<{ (e: 'rename'): void; (e: 'delete'): void; (e: 'activate'): void }>();

function setCurrency(c: string) {
  if (c === props.p.currency) return;
  props.p.currency = c;
  if (props.active) refreshMarket(false);
  toast(`${props.p.name} now reports in ${c}`);
}

// ---- benchmark ----
const benchMenu = ref(false);
const bq = ref('');
const bResults = ref<Array<{ symbol: string; name: string; exchange: string }>>([]);
const bLoading = ref(false);
let bt: ReturnType<typeof setTimeout> | null = null;
function onBenchSearch(q: string) {
  bq.value = q;
  if (bt) clearTimeout(bt);
  if (!q) { bResults.value = []; return; }
  bt = setTimeout(async () => {
    bLoading.value = true;
    bResults.value = await fetchSearch(q).catch(() => []);
    bLoading.value = false;
  }, 250);
}
const suggestions = computed(() => Object.keys(BENCH_NAMES).filter((s) => !props.p.benchmarks.includes(s)).slice(0, 10));
function setPrimary(sym: string) {
  if (!props.p.benchmarks.includes(sym)) props.p.benchmarks.push(sym);
  props.p.benchmark = sym;
}
function addBench(sym: string) {
  const s = sym.trim().toUpperCase().startsWith('^') ? sym.trim().toUpperCase() : sym.trim();
  if (!s) return;
  if (!props.p.benchmarks.includes(s)) props.p.benchmarks.push(s);
  bq.value = '';
  bResults.value = [];
}
function removeBench(sym: string) {
  if (props.p.benchmarks.length <= 1) return;
  props.p.benchmarks = props.p.benchmarks.filter((x) => x !== sym);
  if (props.p.benchmark === sym) props.p.benchmark = props.p.benchmarks[0];
}

// ---- dividend tax ----
const taxMenu = ref(false);
const taxInput = ref('');
function openTax(v: boolean) {
  taxMenu.value = v;
  if (v) taxInput.value = String(props.p.dividendTaxRate ?? 0);
}
function saveTax() {
  const n = Number(taxInput.value);
  if (!(n >= 0 && n <= 100)) { toast('Enter a rate between 0 and 100', 'error'); return; }
  props.p.dividendTaxRate = n;
  taxMenu.value = false;
}
const fmtRate = (n: number) => `${+Number(n || 0).toFixed(4)}%`;
</script>

<template>
  <div class="pcard" :class="{ active }">
    <div class="pc-top">
      <span class="pc-name">{{ p.name }}</span>
      <span v-if="active && showActive" class="pc-badge">Active</span>
      <button v-else-if="!active" class="pc-switch" @click="emit('activate')">Switch to this portfolio</button>
      <v-spacer />
      <button class="pc-ic" :aria-label="expanded ? 'Show less' : 'Show more'" :aria-expanded="expanded" @click="expanded = !expanded"><v-icon size="20">{{ expanded ? 'mdi-menu-up' : 'mdi-menu-down' }}</v-icon></button>
      <v-menu location="bottom end">
        <template #activator="{ props: a }"><button v-bind="a" class="pc-ic" :aria-label="`${p.name} options`"><v-icon size="20">mdi-dots-horizontal</v-icon></button></template>
        <v-list density="compact" min-width="200">
          <v-list-item prepend-icon="mdi-pencil" title="Rename" @click="emit('rename')" />
          <v-list-item v-if="!active" prepend-icon="mdi-swap-horizontal" title="Switch to this portfolio" @click="emit('activate')" />
          <v-list-item prepend-icon="mdi-delete" title="Delete portfolio" :disabled="!canDelete" @click="emit('delete')" />
        </v-list>
      </v-menu>
    </div>

    <div class="pc-grid">
      <!-- currency -->
      <div class="kv">
        <span class="k">Currency:</span>
        <v-menu location="bottom start" max-height="340">
          <template #activator="{ props: a }"><button v-bind="a" class="v" :aria-label="`Currency ${p.currency}, change`">{{ p.currency }}<v-icon size="16" class="caret">mdi-menu-down</v-icon></button></template>
          <v-list density="compact" min-width="160">
            <v-list-item v-for="c in CURRENCIES" :key="c" :active="c === p.currency" :title="c" @click="setCurrency(c)" />
          </v-list>
        </v-menu>
      </div>
      <!-- benchmark -->
      <div class="kv">
        <span class="k">Benchmark:</span>
        <v-menu v-model="benchMenu" :close-on-content-click="false" location="bottom start">
          <template #activator="{ props: a }"><button v-bind="a" class="v" :aria-label="`Benchmark ${benchName(p.benchmark)}, change`">{{ benchName(p.benchmark) }}<v-icon size="16" class="caret">mdi-menu-down</v-icon></button></template>
          <v-card class="menu-card bench">
            <div class="mc-t">Benchmarks</div>
            <div class="mc-d">The primary one is used for "What if investing in…", the charts and risk metrics. All of them appear on Home and Performance.</div>
            <div v-for="b in p.benchmarks" :key="b" class="b-row">
              <button class="b-pick" :class="{ on: p.benchmark === b }" @click="setPrimary(b)">
                <v-icon size="18">{{ p.benchmark === b ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}</v-icon>
                <span>{{ benchName(b) }}</span><span class="b-sym">{{ b }}</span>
              </button>
              <button class="b-x" :disabled="p.benchmarks.length <= 1" :aria-label="`Remove ${benchName(b)}`" @click="removeBench(b)"><v-icon size="16">mdi-close</v-icon></button>
            </div>
            <v-autocomplete
              class="mt-3"
              :items="bResults"
              item-title="symbol"
              item-value="symbol"
              :search="bq"
              :loading="bLoading"
              no-filter
              density="compact"
              placeholder="Add a ticker or index (e.g. ^STI, QQQ)"
              hide-details
              prepend-inner-icon="mdi-magnify"
              @update:search="onBenchSearch"
              @update:model-value="(v: string) => v && addBench(v)"
              @keydown.enter="bq && addBench(bq)"
            >
              <template #item="{ props: ip, item }"><v-list-item v-bind="ip" :title="item.raw.symbol" :subtitle="`${item.raw.name} · ${item.raw.exchange}`" /></template>
            </v-autocomplete>
            <div class="sugg">
              <button v-for="s in suggestions" :key="s" class="chip" @click="addBench(s)">+ {{ benchName(s) }}</button>
            </div>
          </v-card>
        </v-menu>
      </div>
      <div class="kv">
        <span class="k">Transaction Source:</span>
        <span class="v static">This app</span>
      </div>

      <template v-if="expanded">
        <div class="kv">
          <span class="k">Dividend tax rate:</span>
          <v-menu :model-value="taxMenu" :close-on-content-click="false" location="bottom start" @update:model-value="openTax">
            <template #activator="{ props: a }"><button v-bind="a" class="v" aria-label="Dividend tax rate, change">{{ fmtRate(p.dividendTaxRate) }}<v-icon size="16" class="caret">mdi-pencil</v-icon></button></template>
            <v-card class="menu-card">
              <div class="mc-t">Dividend tax rate</div>
              <div class="mc-d">Withholding tax taken from every automatic dividend (added as a Taxes entry).</div>
              <v-text-field v-model="taxInput" type="number" min="0" max="100" step="0.1" suffix="%" density="compact" hide-details autofocus @keydown.enter="saveTax" />
              <div class="sugg">
                <button v-for="r in [0, 10, 15, 30]" :key="r" class="chip" @click="taxInput = String(r)">{{ r }}%</button>
              </div>
              <div class="mc-foot"><button class="tb" @click="taxMenu = false">Cancel</button><button class="tb primary" @click="saveTax">Save</button></div>
            </v-card>
          </v-menu>
        </div>
        <div class="kv">
          <span class="k">Margin &amp; Short Selling:</span>
          <v-menu location="bottom start">
            <template #activator="{ props: a }"><button v-bind="a" class="v" aria-label="Margin and short selling, change">{{ p.margin ? 'Enabled' : 'Disabled' }}<v-icon size="16" class="caret">mdi-menu-down</v-icon></button></template>
            <v-list density="compact" max-width="320">
              <v-list-item :active="p.margin" title="Enabled" subtitle="Cash may go negative and sells beyond your shares open short positions" lines="two" @click="p.margin = true" />
              <v-list-item :active="!p.margin" title="Disabled" subtitle="Missing cash for a buy is added as an automatic deposit" lines="two" @click="p.margin = false" />
            </v-list>
          </v-menu>
        </div>
        <div class="kv">
          <span class="k">Auto Dividend:</span>
          <v-menu location="bottom start">
            <template #activator="{ props: a }"><button v-bind="a" class="v" aria-label="Auto dividend, change">{{ p.autoDividend ? 'Enabled' : 'Disabled' }}<v-icon size="16" class="caret">mdi-menu-down</v-icon></button></template>
            <v-list density="compact" max-width="320">
              <v-list-item :active="p.autoDividend" title="Enabled" subtitle="Dividends are added from market data for the shares you held" lines="two" @click="p.autoDividend = true" />
              <v-list-item :active="!p.autoDividend" title="Disabled" subtitle="Only the dividends you enter yourself are counted" lines="two" @click="p.autoDividend = false" />
            </v-list>
          </v-menu>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pcard { padding: 2px 14px 3px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg); }
.pc-top { display: flex; align-items: center; gap: 10px; height: 28px; }
.pc-name { font-size: 20px; font-weight: 600; line-height: 28px; color: var(--text); }
.pc-badge { font-size: 11px; font-weight: 600; letter-spacing: 0.6px; padding: 2px 8px; border-radius: 6px; color: var(--nav-active-fg); background: var(--nav-active-bg); }
.pc-switch { background: none; border: 0; padding: 0; color: var(--primary-text); font: 600 12.5px var(--font); letter-spacing: 0.4px; cursor: pointer; }
.pc-ic { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; padding: 3px; border-radius: 50%; &:hover { background: var(--line-soft); } }
.pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); row-gap: 2px; margin-top: 0; }
.kv { display: flex; align-items: center; gap: 12px; min-height: 30px; font-size: 16px; white-space: nowrap; }
.k { color: var(--text-2); }
.v { display: inline-flex; align-items: center; gap: 2px; background: none; border: 0; padding: 2px 4px; margin-left: -4px; border-radius: 6px; color: var(--text); font: 500 16px var(--font); cursor: pointer; &:hover { background: var(--line-soft); .caret { opacity: 1; } } }
.v.static { cursor: default; &:hover { background: none; } }
.caret { opacity: 0.35; color: var(--text-2); transition: opacity 0.15s ease; }
.menu-card { width: 340px; padding: 14px 16px 12px; background: var(--surface-2) !important; }
.menu-card.bench { width: 380px; }
.mc-t { font-size: 15px; font-weight: 600; }
.mc-d { font-size: 12.5px; line-height: 18px; color: var(--text-2); margin: 4px 0 12px; }
.b-row { display: flex; align-items: center; gap: 6px; }
.b-pick { flex: 1; display: flex; align-items: center; gap: 8px; padding: 6px 6px; background: none; border: 0; border-radius: 8px; color: var(--text); font: 14px var(--font); cursor: pointer; text-align: left; .v-icon { color: var(--muted); } &.on .v-icon { color: var(--primary); } &:hover { background: var(--hover); } }
.b-sym { margin-left: auto; font-size: 12px; color: var(--muted); }
.b-x { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; padding: 4px; border-radius: 50%; &:disabled { opacity: 0.3; cursor: default; } &:hover:not(:disabled) { background: var(--line-soft); } }
.sugg { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chip { border: 1px solid var(--border-strong); background: transparent; color: var(--text-2); border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; &:hover { background: var(--hover); } }
.mc-foot { display: flex; justify-content: flex-end; gap: 4px; margin-top: 12px; }
.tb { background: none; border: 0; color: var(--text-2); font: 700 13px var(--font); letter-spacing: 1px; cursor: pointer; padding: 8px 10px; border-radius: 8px; &.primary { color: var(--primary-text); } &:hover { background: var(--hover); } }
@media (max-width: 959px) {
  .pcard { padding: 8px 12px 10px; }
  .pc-top { height: auto; min-height: 30px; }
  .pc-name { font-size: 18px; }
  .pc-grid { grid-template-columns: 1fr; row-gap: 4px; margin-top: 4px; }
  .kv { justify-content: space-between; font-size: 15px; }
  .v { font-size: 15px; margin-left: 0; }
}
</style>
