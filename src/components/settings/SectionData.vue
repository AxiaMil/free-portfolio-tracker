<script setup lang="ts">
// Data & Backup: download / restore the whole state as JSON, export every transaction as CSV,
// show where data is saved, and restore one of the automatic snapshots.
import { computed, onMounted, ref } from 'vue';
import { store, refreshMarket, toast } from '../../store.ts';
import type { AppState } from '../../engine/types.ts';
import { listSnapshots, normalizeState, readSnapshot, storageInfo, type Snapshot } from '../../platform/storage.ts';
import { csvLine, downloadText } from '../txn/fmt.ts';
import ConfirmDialog from '../txn/ConfirmDialog.vue';

const where = storageInfo();
const snapshots = ref<Snapshot[]>([]);
const showAllSnaps = ref(false);
onMounted(async () => { snapshots.value = await listSnapshots(); });
const snapTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  try {
    pending.value = normalizeState(JSON.parse(await f.text()), store.state?.preferences);
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

async function restoreSnapshot(snap: Snapshot) {
  try {
    pending.value = await readSnapshot(snap.key);
    pendingName.value = `the snapshot from ${snapTime(snap.at)}`;
  } catch (e) {
    toast(`Could not read that snapshot: ${e instanceof Error ? e.message : e}`, 'error');
  }
}
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
    <div class="saved" :class="{ bad: store.saveError || where.kind === 'memory' }">
      <v-icon size="16">{{ store.saveError || where.kind === 'memory' ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
      {{ store.saveError ? 'Last save failed: ' + store.saveError : where.kind === 'memory' ? 'Changes are kept only until this page closes.' : 'Every change is saved automatically.' }}
    </div>

    <div class="sec-h mt">Backup &amp; restore</div>
    <div class="acts">
      <button class="btn-primary" data-test="backup" @click="backup"><v-icon size="18">mdi-download</v-icon>Download backup (JSON)</button>
      <button class="btn-outline" data-test="restore" @click="fileInput?.click()"><v-icon size="18">mdi-backup-restore</v-icon>Restore from file</button>
      <button class="btn-outline" data-test="export-all" @click="exportAll"><v-icon size="18">mdi-file-delimited-outline</v-icon>Export all transactions (CSV)</button>
    </div>
    <div class="r-d mt-2">Restoring replaces all portfolios and settings with the file's contents. The version you have now stays in the snapshots below.</div>

    <div class="sec-h mt">Where it is saved</div>
    <div class="files">
      <div class="f">
        <v-icon size="18" :class="{ 'warn-t': where.kind === 'memory' }">{{ where.kind === 'host' ? 'mdi-database-outline' : where.kind === 'memory' ? 'mdi-alert-outline' : 'mdi-file-document-outline' }}</v-icon>
        <div>
          <b>{{ where.label }}</b>
          <span v-if="where.kind === 'browser'">Portfolios, transactions, custom assets and settings are kept in this browser's storage for this site. Nothing is uploaded. Download a backup to move them to another browser or device.</span>
          <span v-else-if="where.kind === 'memory'" class="warn-t">The page this tracker runs in blocks browser storage, so your changes are lost when it closes. Download a backup before you leave, and restore it next time.</span>
          <span v-else>Portfolios, transactions, custom assets and settings are saved by the app this tracker runs in.</span>
        </div>
      </div>
      <div class="f"><v-icon size="18">mdi-folder-outline</v-icon><div><b>Market data cache</b><span>Prices, dividends and FX rates are cached in this browser so the app keeps working offline.</span></div></div>
    </div>

    <div class="sec-h mt">Automatic snapshots</div>
    <div v-if="!snapshots.length" class="r-d">A snapshot of your data is kept in this browser at most every 5 minutes while you make changes (the last 30). None yet.</div>
    <div v-else class="snaps">
      <div v-for="snap in (showAllSnaps ? snapshots : snapshots.slice(0, 5))" :key="snap.key" class="snap">
        <v-icon size="18">mdi-folder-clock-outline</v-icon>
        <div><b>{{ snapTime(snap.at) }}</b><span>{{ snap.portfolios }} portfolio{{ snap.portfolios === 1 ? '' : 's' }}, {{ snap.transactions }} transactions</span></div>
        <button class="btn-outline sm" @click="restoreSnapshot(snap)">Restore</button>
      </div>
      <button v-if="snapshots.length > 5" class="more" @click="showAllSnaps = !showAllSnaps">{{ showAllSnaps ? 'Show fewer' : `Show all ${snapshots.length}` }}</button>
    </div>

    <ConfirmDialog v-model="confirmOpen" title="Restore this backup?" confirm-text="Restore" @confirm="restore">
      <p class="mt-0">{{ pendingName }} contains {{ pendingSummary }}.</p>
      <p class="mb-0">Everything currently in the app will be replaced. The current version is kept as a snapshot.</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.warn-t { color: var(--warn) !important; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; div { display: flex; flex-direction: column; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; } b { font-size: 20px; font-weight: 600; line-height: 26px; } span { font-size: 12px; color: var(--text-2); } }
.saved { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; color: var(--text-2); .v-icon { color: var(--pos); } &.bad { color: var(--neg); .v-icon { color: var(--neg); } } }
.acts { display: flex; flex-wrap: wrap; gap: 8px; }
.files { display: flex; flex-direction: column; gap: 8px; }
.f, .snap { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; > .v-icon { color: var(--primary-text); margin-top: 1px; } > div { display: flex; flex-direction: column; min-width: 0; flex: 1; } b { font-size: 13.5px; font-weight: 600; color: var(--text); } span { font-size: 12.5px; line-height: 18px; color: var(--text-2); } }
.snaps { display: flex; flex-direction: column; gap: 6px; }
.snap { align-items: center; padding: 8px 8px 8px 12px; .btn-outline.sm { height: 30px; padding: 0 12px; font-size: 12.5px; letter-spacing: 0.3px; } }
.more { align-self: flex-start; border: 0; background: none; color: var(--primary-text); font: 600 12.5px var(--font); cursor: pointer; padding: 4px 2px; }
</style>
