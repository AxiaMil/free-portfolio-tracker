<script setup lang="ts">
// Data & Backup: download / restore the whole state as JSON, export every transaction as CSV, show where data lives.
import { computed, onMounted, ref } from 'vue';
import { store, newPortfolio, refreshMarket, toast } from '../../store.ts';
import type { AppState, Portfolio, Preferences } from '../../engine/types.ts';
import { csvLine, downloadText } from '../txn/fmt.ts';
import ConfirmDialog from '../txn/ConfirmDialog.vue';

const dataDir = ref('');
onMounted(async () => {
  try {
    const r = await fetch('/api/status').then((x) => x.json());
    dataDir.value = r.dataDir ?? '';
  } catch { /* offline server: keep the relative paths */ }
});

const stats = computed(() => {
  const ps = store.state?.portfolios ?? [];
  return { portfolios: ps.length, txns: ps.reduce((s, p) => s + p.transactions.length, 0), custom: ps.reduce((s, p) => s + p.customAssets.length, 0) };
});

function backup() {
  if (!store.state) return;
  downloadText(JSON.stringify(store.state, null, 2), `portfolio-backup-${store.today}.json`, 'application/json');
  toast('Backup downloaded');
}

function exportAll() {
  const ps = store.state?.portfolios ?? [];
  const lines = [csvLine(['Portfolio', 'Date', 'Action', 'Ticker', 'Price', 'Currency', 'Shares', 'Commission', 'Note'])];
  for (const p of ps) for (const t of [...p.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(csvLine([p.name, t.date, t.action, t.symbol, t.price, t.currency, t.shares, t.commission, t.note ?? '']));
  }
  downloadText(lines.join('\n'), `all-transactions-${store.today}.csv`);
  toast(`Exported ${lines.length - 1} transactions`);
}

// ---------- restore ----------
const fileInput = ref<HTMLInputElement | null>(null);
const pending = ref<AppState | null>(null);
const pendingName = ref('');
const confirmOpen = computed({ get: () => !!pending.value, set: (v: boolean) => { if (!v) pending.value = null; } });

function normalize(raw: unknown): AppState {
  const d = raw as Partial<AppState>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.portfolios) || !d.portfolios.length) throw new Error('This file has no portfolios');
  const portfolios: Portfolio[] = d.portfolios.map((p, i) => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.transactions)) throw new Error(`Portfolio ${i + 1} has no transactions list`);
    const blank = newPortfolio(String(p.name || `Portfolio ${i + 1}`), String(p.currency || 'USD'));
    return { ...blank, ...p, id: String(p.id || blank.id), customAssets: Array.isArray(p.customAssets) ? p.customAssets : [], benchmarks: Array.isArray(p.benchmarks) && p.benchmarks.length ? p.benchmarks : blank.benchmarks };
  });
  const cur = store.state?.preferences;
  const preferences: Preferences = {
    hideValues: false, decimalSeparator: '.', thousandSeparator: ',', costMethod: 'FIFO', accent: '', theme: '', userInitial: 'A',
    ...(cur ?? {}), ...((d.preferences ?? {}) as Partial<Preferences>),
  };
  const active = portfolios.some((p) => p.id === d.activePortfolioId) ? String(d.activePortfolioId) : portfolios[0].id;
  return { version: Number(d.version) || 1, activePortfolioId: active, preferences, portfolios };
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    pending.value = normalize(JSON.parse(await f.text()));
    pendingName.value = f.name;
  } catch (e) {
    toast(`Could not read ${f.name}: ${e instanceof Error ? e.message : e}`, 'error');
  }
}

const pendingSummary = computed(() => {
  const s = pending.value;
  if (!s) return '';
  const n = s.portfolios.reduce((a, p) => a + p.transactions.length, 0);
  return `${s.portfolios.length} portfolio${s.portfolios.length > 1 ? 's' : ''} (${s.portfolios.map((p) => p.name).join(', ')}) with ${n} transactions`;
});

function restore() {
  const s = pending.value;
  if (!s || !store.state) return;
  store.state.version = s.version;
  store.state.preferences = s.preferences;
  store.state.portfolios = s.portfolios;
  store.state.activePortfolioId = s.activePortfolioId;
  refreshMarket(false);
  toast(`Restored from ${pendingName.value}`);
  pending.value = null;
}

const path = (rel: string) => (dataDir.value ? `${dataDir.value.replace(/\/$/, '')}/${rel}` : `data/${rel}`);
</script>

<template>
  <div class="sec">
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />
    <div class="sec-h">Your data</div>
    <div class="stats">
      <div><b>{{ stats.portfolios }}</b><span>portfolio{{ stats.portfolios === 1 ? '' : 's' }}</span></div>
      <div><b>{{ stats.txns }}</b><span>transactions</span></div>
      <div><b>{{ stats.custom }}</b><span>custom assets</span></div>
    </div>
    <div class="saved" :class="{ bad: store.saveError }">
      <v-icon size="16">{{ store.saveError ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
      {{ store.saveError ? 'Last save failed: ' + store.saveError : 'Every change is saved to disk automatically.' }}
    </div>

    <div class="sec-h mt">Backup &amp; restore</div>
    <div class="acts">
      <button class="btn-primary" data-test="backup" @click="backup"><v-icon size="18">mdi-download</v-icon>Download backup (JSON)</button>
      <button class="btn-outline" data-test="restore" @click="fileInput?.click()"><v-icon size="18">mdi-backup-restore</v-icon>Restore from file</button>
      <button class="btn-outline" data-test="export-all" @click="exportAll"><v-icon size="18">mdi-file-delimited-outline</v-icon>Export all transactions (CSV)</button>
    </div>
    <div class="r-d mt-2">Restoring replaces all portfolios and settings with the file's contents. The current version is kept in the backups folder first.</div>

    <div class="sec-h mt">Where it is stored</div>
    <div class="files">
      <div class="f"><v-icon size="18">mdi-file-document-outline</v-icon><div><code>{{ path('portfolio.json') }}</code><span>Portfolios, transactions, custom assets and settings</span></div></div>
      <div class="f"><v-icon size="18">mdi-folder-clock-outline</v-icon><div><code>{{ path('backups/') }}</code><span>The previous 30 versions, written automatically on every save</span></div></div>
      <div class="f"><v-icon size="18">mdi-folder-outline</v-icon><div><code>{{ path('cache/') }}</code><span>Cached market prices so the app keeps working offline</span></div></div>
    </div>
    <div class="r-d mt-2">Copy the data folder to move everything to another computer.</div>

    <ConfirmDialog v-model="confirmOpen" title="Restore this backup?" confirm-text="Restore" @confirm="restore">
      <p class="mt-0">{{ pendingName }} contains {{ pendingSummary }}.</p>
      <p class="mb-0">Everything currently in the app will be replaced. The current version is kept in data/backups.</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; div { display: flex; flex-direction: column; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; } b { font-size: 20px; font-weight: 600; line-height: 26px; } span { font-size: 12px; color: var(--text-2); } }
.saved { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; color: var(--text-2); .v-icon { color: var(--pos); } &.bad { color: var(--neg); .v-icon { color: var(--neg); } } }
.acts { display: flex; flex-wrap: wrap; gap: 8px; }
.files { display: flex; flex-direction: column; gap: 8px; }
.f { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; .v-icon { color: var(--primary-text); margin-top: 1px; } div { display: flex; flex-direction: column; min-width: 0; } code { font-family: var(--mono); font-size: 12.5px; color: var(--text); word-break: break-all; } span { font-size: 12.5px; color: var(--text-2); } }
</style>
