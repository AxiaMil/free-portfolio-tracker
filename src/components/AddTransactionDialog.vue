<script setup lang="ts">
// "Manage Transaction" (step 1: choose portfolio) -> "Add Transactions" (step 2: editable rows + CSV upload).
import { computed, reactive, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRouter } from 'vue-router';
import { store, activePortfolio, addTransactions, fetchSearch, newPortfolio, toast, market } from '../store.ts';
import { ASSET_ACTIONS, CASH_ACTIONS, POPULAR_ACTIONS, type Action, type Txn } from '../engine/types.ts';
import { todayLocal, uid } from '../engine/util.ts';
import { parseTransactionsCsv } from '../csv.ts';

const { mdAndUp } = useDisplay();
const router = useRouter();
const step = ref<1 | 2>(1);
interface Row { key: string; date: string; action: Action; symbol: string; shares: string; price: string; currency: string; commission: string; note: string; open: boolean }
const rows = ref<Row[]>([]);
const page = ref(1);
const perPage = ref(10);
const fileInput = ref<HTMLInputElement | null>(null);
const search = reactive<Record<string, Array<{ symbol: string; name: string; exchange: string }>>>({});
const loadingSearch = reactive<Record<string, boolean>>({});
const actionTab = ref<'Popular' | 'Cash' | 'Asset'>('Popular');
const CURRENCIES = ['Market', 'USD', 'SGD', 'HKD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'MYR', 'THB', 'INR', 'KRW', 'TWD', 'CHF', 'NZD', 'IDR', 'PHP'];

const isCash = (a: Action) => CASH_ACTIONS.includes(a);
const dateMenu = reactive<Record<string, boolean>>({});
const toLocalDate = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return y ? new Date(y, (m || 1) - 1, dd || 1) : new Date(); };
const fromLocalDate = (d: unknown) => { const x = d instanceof Date ? d : new Date(String(d)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function pickDate(r: { date: string; key: string }, v: unknown) { r.date = fromLocalDate(v); dateMenu[r.key] = false; autofillPrice(r as any); }
const blankRow = (p: Partial<Txn> = {}): Row => ({
  key: uid('r'), date: p.date ?? todayLocal(), action: (p.action as Action) ?? 'Buy', symbol: p.symbol && p.symbol !== 'CASH' ? p.symbol : '',
  shares: p.shares != null ? String(p.shares) : '', price: p.price != null ? String(p.price) : '', currency: p.currency ?? (p.action && isCash(p.action as Action) ? activePortfolio.value?.currency ?? 'USD' : 'Market'),
  commission: p.commission != null ? String(p.commission) : '0', note: p.note ?? '', open: false,
});

watch(() => store.addDialog.open, (open) => {
  if (!open) return;
  const pre = store.addDialog.prefill;
  rows.value = [blankRow(pre ?? {})];
  page.value = 1;
  step.value = pre ? 2 : 1;
});

const paged = computed(() => rows.value.slice((page.value - 1) * perPage.value, page.value * perPage.value));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / perPage.value)));

function addRow(copy?: Row) {
  rows.value.push(copy ? { ...copy, key: uid('r') } : blankRow());
  page.value = pages.value;
}
function removeRow(r: Row) {
  rows.value = rows.value.filter((x) => x.key !== r.key);
  if (!rows.value.length) rows.value.push(blankRow());
}

let timers: Record<string, ReturnType<typeof setTimeout>> = {};
function onSearch(r: Row, q: string | null) {
  if (timers[r.key]) clearTimeout(timers[r.key]);
  if (!q || q.length < 1) return;
  timers[r.key] = setTimeout(async () => {
    loadingSearch[r.key] = true;
    search[r.key] = await fetchSearch(q).catch(() => []);
    loadingSearch[r.key] = false;
  }, 220);
}

async function autofillPrice(r: Row) {
  if (!r.symbol || r.price || isCash(r.action)) return;
  try {
    let chart = market.value.charts[r.symbol];
    if (!chart) {
      const res = await fetch(`/api/charts?symbols=${encodeURIComponent(r.symbol)}`).then((x) => x.json());
      chart = res[r.symbol];
      if (chart?.bars?.length) market.value = { ...market.value, charts: { ...market.value.charts, [r.symbol]: chart } };
    }
    const bars = chart?.bars ?? [];
    let px: number | null = null;
    for (const b of bars) if (b[0] <= r.date) px = b[4];
    if (px != null && !r.price) r.price = String(+px.toFixed(4));
  } catch { /* offline: leave empty */ }
}

function setAction(r: Row, a: Action) {
  r.action = a;
  if (isCash(a)) { r.symbol = ''; r.price = r.price || '1'; if (r.currency === 'Market') r.currency = activePortfolio.value?.currency ?? 'USD'; }
}

function validate(r: Row): string | null {
  if (!r.date) return 'Date is required';
  if (!isCash(r.action) && !r.symbol.trim()) return 'Ticker is required';
  if (!(Number(r.shares) > 0)) return isCash(r.action) ? 'Amount must be greater than 0' : 'Shares must be greater than 0';
  if (!(Number(r.price) >= 0) || r.price === '') return 'Price is required';
  return null;
}

function save() {
  const bad = rows.value.map(validate).findIndex((e) => e);
  if (bad >= 0) { toast(`Row ${bad + 1}: ${validate(rows.value[bad])}`, 'error'); return; }
  addTransactions(rows.value.map((r) => ({
    date: r.date, action: r.action, symbol: isCash(r.action) ? 'CASH' : r.symbol.trim().toUpperCase(), price: Number(r.price), currency: r.currency,
    shares: Number(r.shares), commission: Number(r.commission) || 0, note: r.note,
  })));
  toast(`${rows.value.length} transaction${rows.value.length > 1 ? 's' : ''} added`);
  store.addDialog.open = false;
}

async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const text = await f.text();
  const { txns, errors } = parseTransactionsCsv(text);
  if (!txns.length) { toast(errors[0] ?? 'No transactions found in file', 'error'); return; }
  const imported = txns.map((t) => blankRow(t));
  rows.value = rows.value.length === 1 && !rows.value[0].symbol && !rows.value[0].shares ? imported : [...rows.value, ...imported];
  step.value = 2;
  toast(`${txns.length} rows loaded from ${f.name}${errors.length ? ` (${errors.length} skipped)` : ''}`);
  (ev.target as HTMLInputElement).value = '';
}

function createPortfolio() {
  if (!store.state) return;
  const p = newPortfolio(`Portfolio ${store.state.portfolios.length + 1}`, activePortfolio.value?.currency ?? 'USD');
  store.state.portfolios.push(p);
  store.state.activePortfolioId = p.id;
}
function choose(id: string) {
  if (store.state) store.state.activePortfolioId = id;
  step.value = 2;
}
</script>

<template>
  <v-dialog v-model="store.addDialog.open" :max-width="step === 1 ? 700 : 1152" :fullscreen="!mdAndUp" scrollable>
    <v-card class="atd" :class="{ s2: step === 2 }">
      <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="onFile" />
      <!-- step 1 -->
      <template v-if="step === 1">
        <div class="head">
          <div><div class="step">STEP 1 OF 2</div><div class="title">Manage Transaction</div></div>
          <button class="x" aria-label="Close" @click="store.addDialog.open = false"><v-icon size="20">mdi-close</v-icon></button>
        </div>
        <div class="body1">
          <div v-for="p in store.state?.portfolios" :key="p.id" class="pf-row">
            <span>{{ p.name }}</span>
            <button class="add-circle" :aria-label="`Add to ${p.name}`" @click="choose(p.id)"><v-icon size="20">mdi-plus</v-icon></button>
          </div>
          <button class="mini-btn mt-6" @click="createPortfolio">+ Create Portfolio</button>
          <button class="link-btn mt-3" @click="store.addDialog.open = false; router.push('/menu/portfolio')"><v-icon size="13">mdi-cog</v-icon> Portfolio Settings</button>
        </div>
        <div class="foot1"><v-spacer /><button class="text-btn save" @click="store.addDialog.open = false">Done</button></div>
      </template>

      <!-- step 2 -->
      <template v-else>
        <div class="head">
          <button class="x back" aria-label="Back" @click="step = 1"><v-icon size="20">mdi-arrow-left</v-icon></button>
          <div><div class="step">STEP 2 OF 2</div><div class="title">Add Transactions</div></div>
          <v-spacer />
          <button class="x" aria-label="Close" @click="store.addDialog.open = false"><v-icon size="20">mdi-close</v-icon></button>
        </div>
        <div class="bar">
          <span class="pname">{{ activePortfolio?.name }}</span>
          <v-spacer />
          <button class="discard" @click="rows = [blankRow()]; page = 1"><v-icon size="16">mdi-delete</v-icon> Discard All</button>
          <button class="dark-btn" @click="fileInput?.click()"><v-icon size="18">mdi-cloud-upload</v-icon> Upload Files</button>
          <button class="primary-btn" @click="addRow()">+ Add Transaction</button>
        </div>
        <v-card-text class="rows-wrap">
          <div v-for="(r, i) in paged" :key="r.key" class="trow">
            <div class="fields">
              <v-menu v-model="dateMenu[r.key]" :close-on-content-click="false" location="bottom start">
                <template #activator="{ props }">
                  <v-text-field v-model="r.date" label="Date" placeholder="YYYY-MM-DD" density="compact" variant="outlined" hide-details class="f-date" v-bind="props" @change="autofillPrice(r)" />
                </template>
                <v-date-picker :model-value="toLocalDate(r.date)" :max="new Date()" show-adjacent-months color="primary" @update:model-value="(v: unknown) => pickDate(r, v)" />
              </v-menu>
              <span class="div" />
              <v-menu :close-on-content-click="true">
                <template #activator="{ props }">
                  <v-text-field v-bind="props" :model-value="r.action" label="Action" readonly append-inner-icon="mdi-menu-down" density="compact" variant="outlined" hide-details class="f-action" />
                </template>
                <v-card class="action-menu">
                  <div class="am-tabs" @click.stop>
                    <button v-for="t in ['Popular', 'Cash', 'Asset'] as const" :key="t" :class="{ on: actionTab === t }" @click.stop="actionTab = t">{{ t }}</button>
                  </div>
                  <v-list density="compact">
                    <v-list-item v-for="a in (actionTab === 'Popular' ? POPULAR_ACTIONS : actionTab === 'Cash' ? CASH_ACTIONS : ASSET_ACTIONS)" :key="a" :active="r.action === a" @click="setAction(r, a)">{{ a }}</v-list-item>
                  </v-list>
                </v-card>
              </v-menu>
              <span class="div" />
              <v-combobox
                v-model="r.symbol"
                :items="search[r.key] ?? []"
                item-title="symbol"
                item-value="symbol"
                :return-object="false"
                label="Ticker"
                placeholder="Search ticker, name, ISIN"
                persistent-placeholder
                :disabled="isCash(r.action)"
                :loading="loadingSearch[r.key]"
                density="compact"
                variant="outlined"
                hide-details
                class="f-ticker"
                no-filter
                @update:search="(q: string) => onSearch(r, q)"
                @update:model-value="autofillPrice(r)"
              >
                <template #item="{ props, item }">
                  <v-list-item v-bind="props" :title="item.raw.symbol" :subtitle="`${item.raw.name} · ${item.raw.exchange}`" />
                </template>
              </v-combobox>
              <span class="div" />
              <v-text-field v-model="r.shares" :label="isCash(r.action) ? 'Amount' : 'Shares'" type="number" density="compact" variant="outlined" hide-details class="f-shares" />
              <span class="div" />
              <v-text-field v-model="r.price" label="Price" type="number" density="compact" variant="outlined" hide-details class="f-price" />
              <span class="div" />
              <v-select v-model="r.currency" :items="CURRENCIES" label="Currency" density="compact" variant="outlined" hide-details class="f-ccy" />
              <span class="div" />
              <v-text-field v-model="r.commission" label="Commission" type="number" density="compact" variant="outlined" hide-details class="f-comm" />
            </div>
            <div class="row-actions">
              <button aria-label="Duplicate row" @click="addRow(r)"><v-icon size="20">mdi-content-copy</v-icon></button>
              <button aria-label="Delete row" @click="removeRow(r)"><v-icon size="20">mdi-delete</v-icon></button>
              <button aria-label="More fields" @click="r.open = !r.open"><v-icon size="20">{{ r.open ? 'mdi-menu-up' : 'mdi-menu-down' }}</v-icon></button>
            </div>
            <v-text-field v-if="r.open" v-model="r.note" label="Note" density="compact" variant="outlined" hide-details class="f-note" />
            <div v-if="i === paged.length - 1" class="add-more">
              <button class="primary-btn" @click="addRow()"><v-icon size="18">mdi-plus</v-icon>Transaction</button>
              <button class="mini-btn mt-3" @click="fileInput?.click()"><v-icon size="16">mdi-cloud-upload</v-icon> Upload Files</button>
              <div class="hint">CSV columns: Date, Action, Ticker, Shares, Price, Currency, Commission</div>
            </div>
          </div>
        </v-card-text>
        <div class="foot">
          <div class="pager">
            <span>{{ (page - 1) * perPage + 1 }}-{{ Math.min(page * perPage, rows.length) }} of {{ rows.length }} results</span>
            <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-menu-left</v-icon></button>
            <span class="vdiv" />
            <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-menu-right</v-icon></button>
            <span class="ml-4">Page</span>
            <v-select v-model="page" :items="Array.from({ length: pages }, (_, k) => k + 1)" density="compact" variant="outlined" hide-details class="pgsel" />
            <span>out of {{ pages }}</span>
            <span class="ml-4">Rows per page:</span>
            <template v-for="(n, k) in [10, 50, 100]" :key="n"><span v-if="k" class="sep">|</span><button class="per-link" :class="{ on: perPage === n }" @click="perPage = n; page = 1">{{ n }}</button></template>
          </div>
          <div class="actions">
            <button class="text-btn" @click="store.addDialog.open = false">Cancel</button>
            <button class="text-btn save" @click="save">Save</button>
          </div>
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.atd { background: var(--surface-2) !important; border-radius: 8px !important; color: var(--text); }
.head { display: flex; align-items: center; gap: 12px; min-height: 68px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.step { color: var(--primary-text); font-weight: 700; font-size: 12.8px; line-height: 17px; letter-spacing: 0.4px; }
.title { font-size: 20px; font-weight: 600; line-height: 28px; color: var(--text); }
.x { background: none; border: 0; color: var(--text); cursor: pointer; margin-left: auto; display: inline-flex; padding: 4px; }
.x.back { margin-left: 4px; margin-right: 0; }
.body1 { padding: 20px 20px 32px; min-height: 210px; display: flex; flex-direction: column; align-items: flex-start; }
.pf-row { display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 16px; padding: 6px 8px 6px 4px; }
.add-circle { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border-strong); background: transparent; color: var(--text); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; &:hover { background: var(--hover); } }
.mini-btn { display: inline-flex; align-items: center; gap: 6px; height: 27px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: transparent; color: var(--text); font: 600 12px/1 var(--font); letter-spacing: 1px; cursor: pointer; &:hover { background: var(--hover); } }
.link-btn { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; color: var(--text); font: 600 12px/1 var(--font); letter-spacing: 1px; cursor: pointer; margin-left: 12px; }
.foot1 { display: flex; align-items: center; min-height: 52px; padding: 0 20px; border-top: 1px solid var(--border); }
.text-btn { background: none; border: 0; color: var(--text-2); font: 700 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; padding: 8px; }
.text-btn.save { color: var(--primary-text); }
.bar { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 32px; background: var(--primary-soft); flex-wrap: wrap; }
.pname { font-size: 20px; font-weight: 600; color: var(--primary-text); }
.discard { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--neg); font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; padding: 0 12px; }
.dark-btn { background: var(--surface-2); color: var(--text); border: 0; border-radius: 8px; height: 36px; padding: 0 16px; font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }
.primary-btn { background: var(--primary); color: var(--primary-fg); border: 0; border-radius: 8px; height: 36px; padding: 0 16px; font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.rows-wrap { flex: 1 1 auto; min-height: min(calc(100vh - 290px), 470px); padding: 16px 16px !important; overflow-y: auto; }
.trow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 0 0 10px; }
.fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 8px; flex: 1; }
.div { width: 1px; height: 46px; background: var(--border); margin: 0 2px; }
.fields :deep(.v-field) { border-radius: 8px; font-size: 15px; }
.fields :deep(.v-field__input) { min-height: 40px; padding-top: 8px; padding-bottom: 8px; }
.fields :deep(.v-label.v-field-label) { font-size: 15px; }
.fields :deep(.v-label.v-field-label--floating) { font-size: 11px; }
.fields :deep(input::placeholder) { font-size: 12.8px; }
.f-date { width: 130px; flex: none; }
.f-action { width: 95px; flex: none; }
.f-ticker { width: 215px; flex: none; }
.f-shares { width: 90px; flex: none; }
.f-price { width: 100px; flex: none; }
.f-ccy { width: 120px; flex: none; }
.f-comm { width: 102px; flex: none; }
.f-note { width: 100%; flex: none; }
.row-actions { display: flex; gap: 8px; margin-left: auto; button { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; &:hover { color: var(--text); } } }
.add-more { width: 100%; display: flex; flex-direction: column; align-items: center; margin-top: 12px; }
.hint { color: var(--muted); font-size: 11.5px; margin-top: 10px; text-align: center; }
.action-menu { background: var(--surface-3) !important; min-width: 220px; }
.am-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid var(--border); button { background: none; border: 0; color: var(--muted); padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: 600; } button.on { background: var(--surface-3); color: var(--text); } }
.foot { border-top: 1px solid var(--border); padding: 8px 16px 6px; font-size: 15px; color: var(--text-2); }
.pager { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 48px; }
.vdiv { width: 1px; height: 34px; background: var(--border); }
.pgsel { max-width: 100px; }
.pg { background: none; border: 0; color: var(--text-2); cursor: pointer; display: inline-flex; &:disabled { color: var(--faint); cursor: default; } }
.per-link { background: none; border: 0; color: var(--text-2); font: 500 15px var(--font); cursor: pointer; padding: 0 2px; &.on { text-decoration: underline; font-weight: 700; color: var(--text); } }
.sep { color: var(--muted); }
.actions { display: flex; justify-content: flex-end; gap: 16px; padding: 0 4px 4px; }
@media (max-width: 959px) {
  .rows-wrap { min-height: 0; }
  .bar { padding: 10px 16px; .pname { font-size: 18px; width: 100%; } }
  .div { display: none; }
  .f-date, .f-action, .f-ccy, .f-shares, .f-price, .f-comm { width: calc(50% - 4px); }
  .f-ticker { width: 100%; }
  .trow { border-bottom: 1px solid var(--border); padding-bottom: 14px; margin-bottom: 8px; }
  .row-actions { width: 100%; justify-content: flex-end; }
  .bar { gap: 8px; }
  .pager { gap: 6px; font-size: 13px; }
}
</style>
