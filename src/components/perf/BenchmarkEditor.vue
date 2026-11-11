<script setup lang="ts">
// Dialog to add / remove benchmarks and pick the main one (same behaviour as the Home "Benchmarks" editor).
import { ref } from 'vue';
import { activePortfolio, benchName, fetchSearch, BENCH_NAMES } from '../../store.ts';

const open = defineModel<boolean>({ required: true });
const search = ref('');
const results = ref<Array<{ symbol: string; name: string; exchange: string }>>([]);
let timer: ReturnType<typeof setTimeout> | null = null;

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
  <v-dialog v-model="open" max-width="520">
    <v-card class="pa-4">
      <v-card-title class="px-0">Benchmarks</v-card-title>
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-chip v-for="s in activePortfolio?.benchmarks" :key="s" closable :color="activePortfolio?.benchmark === s ? 'primary' : undefined" @click="activePortfolio && (activePortfolio.benchmark = s)" @click:close="remove(s)">{{ benchName(s) }}</v-chip>
      </div>
      <div class="muted text-caption mb-2">Click a chip to make it the main benchmark used for the historical comparison, "What if investing" and risk metrics.</div>
      <v-text-field :model-value="search" placeholder="Search index, ETF or ticker" prepend-inner-icon="mdi-magnify" @update:model-value="onSearch" />
      <v-list density="compact" class="mt-2">
        <v-list-item v-for="r in results" :key="r.symbol" :title="r.symbol" :subtitle="`${r.name} · ${r.exchange}`" @click="add(r.symbol)" />
      </v-list>
      <div v-if="!results.length" class="d-flex flex-wrap ga-2 mt-2">
        <v-chip v-for="s in SUGGEST.filter((x) => !activePortfolio?.benchmarks.includes(x))" :key="s" variant="outlined" size="small" @click="add(s)">+ {{ benchName(s) }}</v-chip>
      </div>
      <v-card-actions><v-spacer /><v-btn variant="text" @click="open = false">Done</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>
