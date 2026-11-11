<script setup lang="ts">
// Search a ticker (or one of the portfolio's custom assets) to add it to the rebalance calculator as a new target.
import { ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { activePortfolio, fetchSearch } from '../../store.ts';

interface Hit { symbol: string; name: string; exchange: string; type: string }

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ add: [symbol: string] }>();
const { mdAndUp } = useDisplay();

const q = ref('');
const hits = ref<Hit[]>([]);
const loading = ref(false);
const failed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

function customHits(s: string): Hit[] {
  const t = s.toLowerCase();
  return (activePortfolio.value?.customAssets ?? [])
    .filter((c) => !t || c.symbol.toLowerCase().includes(t) || c.name.toLowerCase().includes(t))
    .map((c) => ({ symbol: c.symbol, name: c.name, exchange: 'Custom asset', type: c.assetType ?? '' }));
}

watch(q, (v) => {
  if (timer) clearTimeout(timer);
  const s = v.trim();
  failed.value = false;
  if (!s) {
    seq++;
    loading.value = false;
    hits.value = customHits('');
    return;
  }
  loading.value = true;
  timer = setTimeout(async () => {
    const my = ++seq;
    try {
      const r = await fetchSearch(s);
      if (my === seq) hits.value = [...customHits(s), ...r];
    } catch {
      if (my === seq) { hits.value = customHits(s); failed.value = true; }
    } finally {
      if (my === seq) loading.value = false;
    }
  }, 250);
});

watch(open, (o) => {
  if (o) { q.value = ''; hits.value = customHits(''); }
});

function pick(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (!s) return;
  emit('add', s);
  open.value = false;
}

function onEnter() {
  if (loading.value) return;
  pick(hits.value[0]?.symbol ?? q.value);
}
</script>

<template>
  <v-dialog v-model="open" :max-width="mdAndUp ? 520 : undefined" :fullscreen="!mdAndUp" scrollable>
    <v-card class="add-card">
      <div class="hd">
        <span class="t">Add Asset</span>
        <v-spacer />
        <button class="x" aria-label="Close" @click="open = false"><v-icon>mdi-close</v-icon></button>
      </div>
      <p class="sub">Search a ticker to add it as a new target. Its current value is 0, so the calculator shows what to buy.</p>
      <v-text-field
        v-model="q"
        autofocus
        placeholder="Ticker or company name"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        hide-details
        class="q"
        @keydown.enter="onEnter"
      />
      <div class="results">
        <v-progress-linear v-if="loading" indeterminate color="primary" height="2" />
        <button v-for="h in hits" :key="h.symbol + h.exchange" class="hit" @click="pick(h.symbol)">
          <span class="sym">{{ h.symbol }}</span>
          <span class="nm">{{ h.name }}</span>
          <span class="ex">{{ [h.exchange, h.type].filter(Boolean).join(' · ') }}</span>
        </button>
        <div v-if="!loading && q.trim() && !hits.length" class="none">
          {{ failed ? 'Search is unavailable offline.' : 'No match.' }}
          <button class="link" @click="pick(q)">Add “{{ q.trim().toUpperCase() }}” anyway</button>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.add-card { padding: 18px 20px 14px; border-radius: 16px !important; }
.hd { display: flex; align-items: center; }
.t { font-size: 18px; font-weight: 700; }
.x { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; }
.sub { color: var(--text-2); font-size: 13px; line-height: 19px; margin: 6px 0 14px; }
.q :deep(.v-field) { border-radius: 10px; }
.results { margin-top: 10px; min-height: 120px; max-height: 360px; overflow-y: auto; }
.hit {
  display: grid; grid-template-columns: 96px 1fr; grid-template-rows: auto auto; column-gap: 12px; width: 100%;
  text-align: left; background: none; border: 0; border-bottom: 1px solid var(--border); padding: 9px 6px; color: var(--text); cursor: pointer;
  &:hover { background: var(--hover); }
  .sym { font-weight: 700; font-size: 14px; grid-row: span 2; align-self: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ex { font-size: 11.5px; color: var(--muted); }
}
.none { color: var(--text-2); font-size: 13px; padding: 16px 6px; }
.link { background: none; border: 0; color: var(--nav-active-fg); cursor: pointer; font-weight: 600; padding: 0 0 0 6px; }
</style>
