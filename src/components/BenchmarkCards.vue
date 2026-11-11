<script setup lang="ts">
// "Benchmarks" strip of index cards (red when down, green when up) + editor for the benchmark list.
import { computed, ref } from 'vue';
import { market, activePortfolio, benchName, fetchSearch, BENCH_NAMES } from '../store.ts';
import { num, pct, signClass } from '../format.ts';

const editing = ref(false);
const search = ref('');
const results = ref<Array<{ symbol: string; name: string; exchange: string }>>([]);
let timer: ReturnType<typeof setTimeout> | null = null;

const cards = computed(() => (activePortfolio.value?.benchmarks ?? []).map((s) => {
  const q = market.value.quotes[s];
  return { symbol: s, name: benchName(s), price: q?.price ?? null, change: q?.change ?? null, changePct: q?.changePct != null ? q.changePct / 100 : null };
}));

function onSearch(v: string) {
  search.value = v;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => { results.value = v.trim() ? await fetchSearch(v).catch(() => []) : []; }, 250);
}
function add(sym: string) {
  const p = activePortfolio.value;
  if (p && !p.benchmarks.includes(sym)) p.benchmarks.push(sym);
  search.value = '';
  results.value = [];
}
function remove(sym: string) {
  const p = activePortfolio.value;
  if (!p || p.benchmarks.length <= 1) return;
  p.benchmarks = p.benchmarks.filter((x) => x !== sym);
  if (p.benchmark === sym) p.benchmark = p.benchmarks[0];
}
const SUGGEST = Object.keys(BENCH_NAMES);
</script>

<template>
  <div class="bc">
    <h2 class="section-title d-flex align-center ga-2">Benchmarks <button class="edit" aria-label="Edit benchmarks" @click="editing = true"><v-icon size="16">mdi-pencil</v-icon></button></h2>
    <div class="strip hide-scroll">
      <div v-for="c in cards" :key="c.symbol" class="bcard" :class="(c.change ?? 0) >= 0 ? 'up' : 'down'">
        <div class="bname">{{ c.name }}</div>
        <div class="bprice">{{ c.price == null ? '-' : num(c.price, 2) }}</div>
        <div class="bchg" :class="signClass(c.change)">{{ c.change == null ? '' : `${c.change >= 0 ? '+' : ''}${num(c.change, 2)}` }} <span>({{ pct(c.changePct) }})</span></div>
      </div>
    </div>
    <v-dialog v-model="editing" max-width="520">
      <v-card class="pa-4">
        <v-card-title class="px-0">Benchmarks</v-card-title>
        <div class="d-flex flex-wrap ga-2 mb-4">
          <v-chip v-for="s in activePortfolio?.benchmarks" :key="s" closable :color="activePortfolio?.benchmark === s ? 'primary' : undefined" @click="activePortfolio && (activePortfolio.benchmark = s)" @click:close="remove(s)">{{ benchName(s) }}</v-chip>
        </div>
        <div class="muted text-caption mb-2">Click a chip to make it the main benchmark used for "What if investing" and risk metrics.</div>
        <v-text-field :model-value="search" placeholder="Search index, ETF or ticker" prepend-inner-icon="mdi-magnify" @update:model-value="onSearch" />
        <v-list density="compact" class="mt-2">
          <v-list-item v-for="r in results" :key="r.symbol" :title="r.symbol" :subtitle="`${r.name} · ${r.exchange}`" @click="add(r.symbol)" />
        </v-list>
        <div v-if="!results.length" class="d-flex flex-wrap ga-2 mt-2">
          <v-chip v-for="s in SUGGEST.filter((x) => !activePortfolio?.benchmarks.includes(x))" :key="s" variant="outlined" size="small" @click="add(s)">+ {{ benchName(s) }}</v-chip>
        </div>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="editing = false">Done</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped lang="scss">
.edit { background: none; border: 0; color: var(--muted); cursor: pointer; display: inline-flex; &:hover { color: var(--text-2); } }
.strip { display: flex; gap: 16px; overflow-x: auto; margin-top: 20px; }
.bcard { flex: 0 0 150px; min-height: 99px; border-radius: 16px; padding: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow); }
.bcard.down { background: linear-gradient(180deg, var(--neg-soft), transparent 85%), var(--surface); }
.bcard.up { background: linear-gradient(180deg, var(--pos-soft), transparent 85%), var(--surface); }
.bname { font-weight: 700; font-size: 13px; line-height: 18px; color: var(--text-2); letter-spacing: 0.2px; }
.bprice { font-size: 20px; font-weight: 600; line-height: 28px; margin: 6px 0 2px; color: var(--text); }
.bchg { font-size: 13px; font-weight: 500; line-height: 20px; white-space: nowrap; }
.bchg.pos { color: var(--pos) !important; }
.bchg.neg { color: var(--neg) !important; }
</style>
