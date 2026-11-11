<script setup lang="ts">
// Transactions: the user's own input (editable) and the Adjusted ledger the engine uses (auto deposits / dividends / taxes).
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRoute } from 'vue-router';
import { store, activePortfolio, result, openAddTransaction, deleteTransactions, toast } from '../store.ts';
import type { Action } from '../engine/types.ts';
import { parseTransactionsCsv, transactionsToCsv } from '../csv.ts';
import PillToggle from '../components/PillToggle.vue';
import HelpTip from '../components/HelpTip.vue';
import EditTransactionDialog from '../components/txn/EditTransactionDialog.vue';
import WarningsDialog from '../components/txn/WarningsDialog.vue';
import ImportDialog from '../components/txn/ImportDialog.vue';
import ConfirmDialog from '../components/txn/ConfirmDialog.vue';
import { csvLine, downloadText, fmt2, fmtPrice, fmtShares } from '../components/txn/fmt.ts';

const { mdAndUp } = useDisplay();
const route = useRoute();

type View = 'My Input' | 'Adjusted';
const view = ref<View>('My Input');
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
watch(() => route.query.q, (q) => { if (typeof q === 'string') search.value = q; });

const ADJ_HELP = 'My Input lists the transactions exactly as you entered them. Adjusted is what every calculation uses: your input plus automatic deposits (added when a buy needs more cash than the portfolio holds, unless margin is enabled), automatic dividends (shares held on each ex-dividend date, paid on the pay date) and the withholding taxes from your dividend tax rate. Commission and Amount are converted to the portfolio currency.';

interface Row {
  key: string;
  txnId: string | null;
  date: string;
  action: Action;
  symbol: string;
  price: number;
  currency: string;
  shares: number;
  commission: number;
  commissionBase: number;
  amountBase: number;
  status: 'confirmed' | 'upcoming';
  auto: null | 'deposit' | 'dividend' | 'tax';
  note: string;
  seq: number;
}

const base = computed(() => store.base);
const warnings = computed(() => result.value?.warnings ?? []);
const warnById = computed(() => new Map(warnings.value.map((w) => [w.id, w])));

const inputRows = computed<Row[]>(() => (activePortfolio.value?.transactions ?? []).map((t, i) => ({
  key: t.id, txnId: t.id, date: t.date, action: t.action, symbol: (t.symbol || 'CASH').toUpperCase(), price: Number(t.price) || 0,
  currency: t.currency || 'Market', shares: Number(t.shares) || 0, commission: Number(t.commission) || 0, commissionBase: 0, amountBase: 0,
  status: 'confirmed', auto: null, note: t.note ?? '', seq: i,
})));

// auto taxes are booked on cash; show the ticker whose dividend they belong to (id = auto-tax-<SYMBOL>-<exDate>)
const taxTicker = (id: string) => (id.startsWith('auto-tax-') && id.length > 20 ? id.slice(9, -11) : 'CASH');
const adjustedRows = computed<Row[]>(() => (result.value?.ledger ?? []).map((e, i) => ({
  key: e.id + ':' + i, txnId: e.auto ? null : e.sourceId ?? e.id, date: e.date, action: e.action, symbol: e.auto === 'tax' ? taxTicker(e.id) : e.symbol, price: e.price, currency: e.currency,
  shares: e.shares, commission: e.commission, commissionBase: e.commissionBase, amountBase: e.amountBase, status: e.status, auto: e.auto, note: '', seq: i,
})));

const sourceRows = computed(() => (view.value === 'My Input' ? inputRows.value : adjustedRows.value));
const itemCount = computed(() => sourceRows.value.length);

// ---------- search + filters ----------
const fActions = ref<string[]>([]);
const fTickers = ref<string[]>([]);
const fFrom = ref('');
const fTo = ref('');
const fKinds = ref<string[]>([]); // Adjusted only: Manual / Auto deposit / Auto dividend / Auto tax / Confirmed / Upcoming
const filterOpen = ref(false);
const KIND_OPTIONS = ['Manual', 'Auto deposit', 'Auto dividend', 'Auto tax', 'Confirmed', 'Upcoming'];
const activeFilters = computed(() => fActions.value.length + fTickers.value.length + (fFrom.value ? 1 : 0) + (fTo.value ? 1 : 0) + (view.value === 'Adjusted' ? fKinds.value.length : 0));
const actionOptions = computed(() => [...new Set(sourceRows.value.map((r) => r.action))].sort());
const tickerOptions = computed(() => [...new Set(sourceRows.value.map((r) => r.symbol).filter((s) => s !== 'CASH'))].sort());
const toggled = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const toggleAction = (a: string) => { fActions.value = toggled(fActions.value, a); };
const toggleKind = (k: string) => { fKinds.value = toggled(fKinds.value, k); };
function clearFilters() {
  fActions.value = []; fTickers.value = []; fFrom.value = ''; fTo.value = ''; fKinds.value = [];
}
function kindMatch(r: Row): boolean {
  const k = fKinds.value;
  if (view.value !== 'Adjusted' || !k.length) return true;
  const typeSel = k.filter((x) => x === 'Manual' || x.startsWith('Auto'));
  const statusSel = k.filter((x) => x === 'Confirmed' || x === 'Upcoming');
  const type = r.auto ? `Auto ${r.auto}` : 'Manual';
  return (!typeSel.length || typeSel.includes(type)) && (!statusSel.length || statusSel.includes(r.status === 'confirmed' ? 'Confirmed' : 'Upcoming'));
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return sourceRows.value.filter((r) => {
    if (q && ![r.symbol, r.action, r.date, r.note, r.currency].some((s) => s.toLowerCase().includes(q))) return false;
    if (fActions.value.length && !fActions.value.includes(r.action)) return false;
    if (fTickers.value.length && !fTickers.value.includes(r.symbol)) return false;
    if (fFrom.value && r.date < fFrom.value) return false;
    if (fTo.value && r.date > fTo.value) return false;
    return kindMatch(r);
  });
});

// ---------- sorting ----------
type SortKey = 'date' | 'action' | 'symbol' | 'price' | 'currency' | 'shares' | 'commission' | 'amount';
const sortKey = ref<SortKey>('date');
const sortDesc = ref(true);
const SORT_GET: Record<SortKey, (r: Row) => string | number> = {
  date: (r) => r.date, action: (r) => r.action, symbol: (r) => r.symbol, price: (r) => r.price, currency: (r) => r.currency,
  shares: (r) => r.shares, commission: (r) => (view.value === 'Adjusted' ? r.commissionBase : r.commission), amount: (r) => r.amountBase,
};
const sorted = computed(() => {
  const get = SORT_GET[sortKey.value];
  const dir = sortDesc.value ? -1 : 1;
  return [...filtered.value].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    if (c) return c * dir;
    // ties: newest date first, then the most recently entered first
    return b.date.localeCompare(a.date) || (b.seq - a.seq) * (sortKey.value === 'date' ? -dir : 1);
  });
});
function sortBy(k: SortKey) {
  if (sortKey.value === k) sortDesc.value = !sortDesc.value;
  else { sortKey.value = k; sortDesc.value = k === 'date' || k === 'amount' || k === 'price' || k === 'shares' || k === 'commission'; }
}
const SORT_OPTIONS = computed(() => [
  { title: 'Date', value: 'date' }, { title: 'Ticker', value: 'symbol' }, { title: 'Action', value: 'action' }, { title: 'Price', value: 'price' },
  { title: 'Shares', value: 'shares' }, { title: 'Commission', value: 'commission' }, ...(view.value === 'Adjusted' ? [{ title: 'Amount', value: 'amount' }] : []),
]);

// ---------- paging ----------
const perPage = ref(50);
const page = ref(1);
const mobilePer = ref(10);
const per = computed(() => (mdAndUp.value ? perPage.value : mobilePer.value));
const pages = computed(() => Math.max(1, Math.ceil(sorted.value.length / per.value)));
const paged = computed(() => sorted.value.slice((page.value - 1) * per.value, page.value * per.value));
watch([search, view, fActions, fTickers, fFrom, fTo, fKinds, sortKey, sortDesc, perPage, mobilePer], () => { page.value = 1; });
watch(pages, (n) => { if (page.value > n) page.value = n; });

// ---------- selection (My Input) ----------
const selected = ref<string[]>([]);
const isSel = (id: string | null) => !!id && selected.value.includes(id);
function toggleSel(id: string | null) {
  if (!id) return;
  selected.value = isSel(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id];
}
const pageIds = computed(() => paged.value.map((r) => r.txnId).filter((x): x is string => !!x));
const pageAllSel = computed(() => pageIds.value.length > 0 && pageIds.value.every((id) => selected.value.includes(id)));
const pageSomeSel = computed(() => pageIds.value.some((id) => selected.value.includes(id)));
function toggleAllPage() {
  if (pageAllSel.value) selected.value = selected.value.filter((id) => !pageIds.value.includes(id));
  else selected.value = [...new Set([...selected.value, ...pageIds.value])];
}
watch(view, () => { selected.value = []; });
watch(inputRows, (rows) => {
  const ids = new Set(rows.map((r) => r.txnId));
  if (selected.value.some((id) => !ids.has(id))) selected.value = selected.value.filter((id) => ids.has(id));
});

// ---------- edit / delete ----------
const editId = ref<string | null>(null);
const warnOpen = ref(false);
const confirm = ref<{ ids: string[]; title: string; text: string } | null>(null);
const confirmOpen = computed({ get: () => !!confirm.value, set: (v: boolean) => { if (!v) confirm.value = null; } });

function describe(id: string): string {
  const t = activePortfolio.value?.transactions.find((x) => x.id === id);
  if (!t) return 'this transaction';
  const sym = t.symbol === 'CASH' ? '' : ` ${t.symbol}`;
  return `${t.action}${sym} on ${t.date} (${fmtShares(t.shares)} @ ${fmtPrice(t.price)})`;
}
function askDelete(ids: string[]) {
  if (!ids.length) return;
  confirm.value = ids.length === 1
    ? { ids, title: 'Delete transaction?', text: `${describe(ids[0])} will be removed from ${activePortfolio.value?.name}. A copy of your previous data is kept in data/backups.` }
    : { ids, title: `Delete ${ids.length} transactions?`, text: `The ${ids.length} selected transactions will be removed from ${activePortfolio.value?.name}. A copy of your previous data is kept in data/backups.` };
}
function doDelete() {
  const ids = confirm.value?.ids ?? [];
  deleteTransactions(ids);
  selected.value = selected.value.filter((id) => !ids.includes(id));
  if (editId.value && ids.includes(editId.value)) editId.value = null;
  toast(ids.length === 1 ? 'Transaction deleted' : `${ids.length} transactions deleted`);
  confirm.value = null;
}
function editFromWarnings(id: string) {
  warnOpen.value = false;
  editId.value = id;
}
function duplicate(r: Row) {
  const t = activePortfolio.value?.transactions.find((x) => x.id === r.txnId);
  if (!t) return;
  const { id: _id, ...rest } = t;
  openAddTransaction(rest);
}
function addTxn() {
  openAddTransaction((store.state?.portfolios.length ?? 0) > 1 ? null : {});
}

// ---------- import / export ----------
const fileInput = ref<HTMLInputElement | null>(null);
const imp = ref<{ txns: ReturnType<typeof parseTransactionsCsv>['txns']; errors: string[]; filename: string }>({ txns: [], errors: [], filename: '' });
const importOpen = ref(false);
async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  const { txns, errors } = parseTransactionsCsv(await f.text());
  if (!txns.length) { toast(errors[0] ?? `No transactions found in ${f.name}`, 'error'); return; }
  imp.value = { txns, errors, filename: f.name };
  importOpen.value = true;
}

function exportCsv() {
  const name = (activePortfolio.value?.name ?? 'portfolio').replace(/[^\w-]+/g, '-').toLowerCase();
  if (view.value === 'My Input') {
    const ids = new Set(sorted.value.map((r) => r.txnId));
    const txns = (activePortfolio.value?.transactions ?? []).filter((t) => ids.has(t.id)).sort((a, b) => a.date.localeCompare(b.date));
    downloadText(transactionsToCsv(txns), `transactions-${name}-${store.today}.csv`);
  } else {
    const lines = [csvLine(['Date', 'Action', 'Ticker', 'Price', 'Currency', 'Shares', `Commission (${base.value})`, `Amount (${base.value})`, 'Status', 'Type'])];
    for (const r of [...sorted.value].reverse()) lines.push(csvLine([r.date, r.action, r.symbol, +r.price.toFixed(6), r.currency, +r.shares.toFixed(6), r.commissionBase.toFixed(2), r.amountBase.toFixed(2), r.status === 'confirmed' ? 'Confirmed' : 'Upcoming', r.auto ? `Auto ${r.auto}` : 'Manual']));
    downloadText(lines.join('\n'), `transactions-adjusted-${name}-${store.today}.csv`);
  }
  toast(`Exported ${sorted.value.length} rows`);
}

const tickerLabel = (r: Row) => (r.symbol === 'CASH' ? '-' : r.symbol);
const autoLabel = (a: Row['auto']) => (a === 'deposit' ? 'Auto deposit: covers the cash needed for buys on this day' : a === 'dividend' ? 'Auto dividend: from the shares held on the ex-dividend date' : 'Auto tax: dividend withholding tax from your tax rate');
</script>

<template>
  <div class="page tx" :class="{ phone: !mdAndUp }">
    <input ref="fileInput" type="file" accept=".csv,text/csv,text/plain" hidden @change="onFile" />

    <!-- heading -->
    <div class="head1">
      <h1 class="tx-title">Transactions</h1>
      <v-tooltip text="Transactions you enter or import in this app. They are saved in data/portfolio.json.">
        <template #activator="{ props }">
          <fieldset v-bind="props" class="src"><legend>Source</legend><v-icon size="22">mdi-database</v-icon><span>This app</span></fieldset>
        </template>
      </v-tooltip>
    </div>
    <div class="head2">
      <div class="counts">
        <div class="items">{{ itemCount }} items</div>
        <button v-if="warnings.length" class="warn-chip" data-test="warnings" @click="warnOpen = true">
          <v-icon size="17">mdi-alert-circle</v-icon>{{ warnings.length }} warning{{ warnings.length === 1 ? '' : 's' }}
        </button>
      </div>
      <div class="head-btns">
        <button class="btn-primary" data-test="add-txn" @click="addTxn">+ Add Transaction</button>
        <button v-if="mdAndUp" class="btn-outline" @click="fileInput?.click()">Upload Files</button>
      </div>
    </div>
    <div class="toggle-row">
      <PillToggle v-model="view" class="mini" :options="['My Input', 'Adjusted'] as const" />
      <HelpTip icon="mdi-help-circle" :size="mdAndUp ? 21 : 22" :text="ADJ_HELP" />
    </div>

    <!-- list -->
    <div class="tcard">
      <div class="tbar">
        <v-text-field v-model="search" class="search" placeholder="Search" prepend-inner-icon="mdi-magnify" density="compact" variant="outlined" hide-details clearable />
        <v-menu v-model="filterOpen" :close-on-content-click="false" location="bottom end">
          <template #activator="{ props }">
            <button v-bind="props" class="icon-btn" :class="{ on: activeFilters }" aria-label="Filter">
              <v-icon size="22">mdi-filter-variant</v-icon><span v-if="activeFilters" class="badge">{{ activeFilters }}</span>
            </button>
          </template>
          <v-card class="fmenu">
            <div class="fm-lbl">Action</div>
            <div class="fchips">
              <button v-for="a in actionOptions" :key="a" class="fchip" :class="{ on: fActions.includes(a) }" @click="toggleAction(a)">{{ a }}</button>
            </div>
            <div class="fm-lbl">Ticker</div>
            <v-autocomplete v-model="fTickers" :items="tickerOptions" multiple chips closable-chips density="compact" placeholder="All tickers" hide-details />
            <div class="fm-lbl">Date</div>
            <div class="fm-dates">
              <v-text-field v-model="fFrom" type="date" label="From" density="compact" hide-details />
              <v-text-field v-model="fTo" type="date" label="To" density="compact" hide-details />
            </div>
            <template v-if="view === 'Adjusted'">
              <div class="fm-lbl">Type &amp; status</div>
              <div class="fchips">
                <button v-for="k in KIND_OPTIONS" :key="k" class="fchip" :class="{ on: fKinds.includes(k) }" @click="toggleKind(k)">{{ k }}</button>
              </div>
            </template>
            <div class="fm-foot">
              <button class="lnk muted-l" :disabled="!activeFilters" @click="clearFilters">Clear all</button>
              <v-spacer />
              <button class="lnk" @click="filterOpen = false">Done</button>
            </div>
          </v-card>
        </v-menu>
        <div v-if="selected.length && view === 'My Input'" class="selbar">
          <span>{{ selected.length }} selected</span>
          <button class="sel-del" data-test="bulk-delete" @click="askDelete(selected)"><v-icon size="18">mdi-delete</v-icon>Delete</button>
          <button class="lnk muted-l" @click="selected = []">Clear</button>
        </div>
        <v-spacer v-if="mdAndUp" />
        <v-tooltip v-if="mdAndUp" text="Export CSV">
          <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="Export CSV" data-test="export" @click="exportCsv"><v-icon size="21">mdi-tray-arrow-down</v-icon></button></template>
        </v-tooltip>
        <v-menu v-else location="bottom end">
          <template #activator="{ props }"><button v-bind="props" class="icon-btn" aria-label="More"><v-icon size="22">mdi-dots-vertical</v-icon></button></template>
          <v-list density="compact">
            <v-list-item prepend-icon="mdi-cloud-upload" title="Upload Files (CSV)" @click="fileInput?.click()" />
            <v-list-item prepend-icon="mdi-tray-arrow-down" title="Export CSV" @click="exportCsv" />
          </v-list>
        </v-menu>
      </div>

      <!-- desktop table -->
      <div v-if="mdAndUp" class="table-wrap">
        <table class="ttable" :class="view === 'My Input' ? 'input' : 'adjusted'">
          <colgroup v-if="view === 'My Input'">
            <col style="width: 3.37%" /><col style="width: 13.3%" /><col style="width: 10%" /><col style="width: 10.3%" /><col style="width: 8.85%" />
            <col style="width: 12.4%" /><col style="width: 10.45%" /><col style="width: 15.8%" /><col />
          </colgroup>
          <colgroup v-else>
            <col style="width: 10.5%" /><col style="width: 9%" /><col style="width: 9.5%" /><col style="width: 9%" /><col style="width: 8%" />
            <col style="width: 10.5%" /><col style="width: 13%" /><col style="width: 13%" /><col />
          </colgroup>
          <thead>
            <tr>
              <th v-if="view === 'My Input'" class="c-cb">
                <button class="cb" :aria-label="pageAllSel ? 'Unselect all' : 'Select all'" @click="toggleAllPage">
                  <v-icon size="19">{{ pageAllSel ? 'mdi-checkbox-marked' : pageSomeSel ? 'mdi-minus-box' : 'mdi-checkbox-blank-outline' }}</v-icon>
                </button>
              </th>
              <th class="sortable" @click="sortBy('date')">Date<v-icon v-if="sortKey === 'date' && !sortDesc" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('action')">Action<v-icon v-if="sortKey === 'action'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('symbol')">Ticker<v-icon v-if="sortKey === 'symbol'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('price')">Price<v-icon v-if="sortKey === 'price'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('currency')">Currency<v-icon v-if="sortKey === 'currency'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('shares')">Shares<v-icon v-if="sortKey === 'shares'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th class="sortable" @click="sortBy('commission')">{{ view === 'My Input' ? 'Commission' : `Commission (${base})` }}<v-icon v-if="sortKey === 'commission'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th v-if="view === 'Adjusted'" class="sortable" @click="sortBy('amount')">Amount ({{ base }})<v-icon v-if="sortKey === 'amount'" size="13" class="sarrow">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></th>
              <th v-if="view === 'Adjusted'">Status</th>
              <th v-else />
            </tr>
          </thead>
          <tbody v-if="view === 'My Input'">
            <tr v-for="r in paged" :key="r.key" :class="{ sel: isSel(r.txnId) }">
              <td class="c-cb"><button class="cb" :class="{ on: isSel(r.txnId) }" :aria-label="`Select ${r.action} ${r.symbol} ${r.date}`" @click="toggleSel(r.txnId)"><v-icon size="19">{{ isSel(r.txnId) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline' }}</v-icon></button></td>
              <td>{{ r.date }}</td>
              <td>{{ r.action }}</td>
              <td>{{ tickerLabel(r) }}</td>
              <td>
                {{ fmtPrice(r.price) }}
                <v-tooltip v-if="warnById.get(r.key)" :text="warnById.get(r.key)!.message" max-width="320">
                  <template #activator="{ props }"><v-icon v-bind="props" size="14" class="row-warn">mdi-alert-circle</v-icon></template>
                </v-tooltip>
              </td>
              <td>{{ r.currency }}</td>
              <td>{{ fmtShares(r.shares) }}</td>
              <td>{{ fmt2(r.commission) }}</td>
              <td class="c-act">
                <button class="ico" :aria-label="`Edit ${r.action} ${r.symbol} ${r.date}`" data-test="edit" @click="editId = r.txnId"><v-icon size="21">mdi-pencil</v-icon></button>
                <button class="ico" :aria-label="`Delete ${r.action} ${r.symbol} ${r.date}`" data-test="delete" @click="askDelete([r.txnId!])"><v-icon size="21">mdi-delete</v-icon></button>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="r in paged" :key="r.key" :class="{ clickable: !!r.txnId }" @click="r.txnId && (editId = r.txnId)">
              <td>{{ r.date }}</td>
              <td>{{ r.action }}</td>
              <td>{{ tickerLabel(r) }}</td>
              <td>{{ fmtPrice(r.price) }}</td>
              <td>{{ r.currency }}</td>
              <td>{{ fmtShares(r.shares) }}</td>
              <td>{{ fmt2(r.commissionBase, true) }}</td>
              <td>{{ fmt2(r.amountBase, true) }}</td>
              <td class="status">
                <span :class="r.status === 'confirmed' ? 'st-ok' : 'st-up'">{{ r.status === 'confirmed' ? 'Confirmed' : 'Upcoming' }}</span>
                <v-tooltip v-if="r.auto" :text="autoLabel(r.auto)"><template #activator="{ props }"><span v-bind="props" class="auto">Auto</span></template></v-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!paged.length" class="empty">
          <template v-if="itemCount">No transactions match your search or filters. <button class="lnk" @click="search = ''; clearFilters()">Clear</button></template>
          <template v-else>No transactions yet. <button class="lnk" @click="addTxn">Add your first transaction</button> or upload a CSV file.</template>
        </div>
      </div>

      <!-- phone list -->
      <template v-else>
        <div class="m-sort">
          <v-select v-model="sortKey" :items="SORT_OPTIONS" label="Sort by" density="compact" variant="outlined" hide-details class="sort-sel" />
          <button class="desc" @click="sortDesc = !sortDesc">{{ sortDesc ? 'Descending' : 'Ascending' }} <v-icon size="16">{{ sortDesc ? 'mdi-arrow-down' : 'mdi-arrow-up' }}</v-icon></button>
        </div>
        <div v-for="r in paged" :key="r.key" class="mcard" :class="{ sel: isSel(r.txnId) }">
          <div class="mc-head">
            <span class="mc-title">{{ r.symbol === 'CASH' ? r.action : `${r.action} ${r.symbol}` }}</span>
            <span class="mc-date">{{ r.date }}</span>
            <v-icon v-if="view === 'My Input' && warnById.get(r.key)" size="15" class="row-warn ml-1" @click="warnOpen = true">mdi-alert-circle</v-icon>
            <v-spacer />
            <template v-if="view === 'My Input'">
              <button class="ico" :aria-label="`Edit ${r.action} ${r.symbol} ${r.date}`" @click="editId = r.txnId"><v-icon size="21">mdi-pencil</v-icon></button>
              <button class="ico" :aria-label="`Delete ${r.action} ${r.symbol} ${r.date}`" @click="askDelete([r.txnId!])"><v-icon size="21">mdi-delete</v-icon></button>
              <v-menu location="bottom end">
                <template #activator="{ props }"><button v-bind="props" class="ico" aria-label="More actions"><v-icon size="21">mdi-dots-vertical</v-icon></button></template>
                <v-list density="compact">
                  <v-list-item prepend-icon="mdi-content-copy" title="Duplicate" @click="duplicate(r)" />
                  <v-list-item :prepend-icon="isSel(r.txnId) ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'" :title="isSel(r.txnId) ? 'Unselect' : 'Select'" @click="toggleSel(r.txnId)" />
                </v-list>
              </v-menu>
            </template>
            <template v-else>
              <span :class="r.status === 'confirmed' ? 'st-ok' : 'st-up'" class="mc-status">{{ r.status === 'confirmed' ? 'Confirmed' : 'Upcoming' }}</span>
              <span v-if="r.auto" class="auto">Auto</span>
            </template>
          </div>
          <div class="mc-grid">
            <span class="lbl">Price</span><span>{{ fmtPrice(r.price) }}</span>
            <span class="lbl">Currency</span><span>{{ r.currency }}</span>
            <span class="lbl">Shares</span><span>{{ fmtShares(r.shares) }}</span>
            <template v-if="view === 'My Input'">
              <span class="lbl">Commission</span><span>{{ fmt2(r.commission) }}</span>
              <span class="lbl">Portfolio</span><span class="span3">{{ activePortfolio?.name }}</span>
            </template>
            <template v-else>
              <span class="lbl">Comm. ({{ base }})</span><span>{{ fmt2(r.commissionBase, true) }}</span>
              <span class="lbl">Amount</span><span class="span3">{{ fmt2(r.amountBase, true) }} {{ base }}</span>
            </template>
          </div>
        </div>
        <div v-if="!paged.length" class="empty">
          <template v-if="itemCount">No transactions match. <button class="lnk" @click="search = ''; clearFilters()">Clear</button></template>
          <template v-else>No transactions yet.</template>
        </div>
      </template>

      <!-- paging -->
      <div v-if="mdAndUp" class="pager">
        <span class="muted">Items per page:</span>
        <v-select v-model="perPage" :items="[10, 25, 50, 100]" density="compact" variant="plain" hide-details class="per" />
        <span>{{ sorted.length ? (page - 1) * perPage + 1 : 0 }}-{{ Math.min(page * perPage, sorted.length) }} of {{ sorted.length }}</span>
        <button class="pg" :disabled="page === 1" aria-label="First page" @click="page = 1"><v-icon>mdi-page-first</v-icon></button>
        <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
        <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
        <button class="pg" :disabled="page >= pages" aria-label="Last page" @click="page = pages"><v-icon>mdi-page-last</v-icon></button>
      </div>
      <div v-else-if="sorted.length" class="m-pager">
        <div class="m-pg1">
          <button class="pg round" :disabled="page === 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
          <span>{{ (page - 1) * mobilePer + 1 }}-{{ Math.min(page * mobilePer, sorted.length) }} of {{ sorted.length }} results</span>
          <button class="pg round" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
        </div>
        <div class="m-pg2">
          <span>Page</span>
          <v-select v-model="page" :items="Array.from({ length: pages }, (_, i) => i + 1)" density="compact" variant="outlined" hide-details class="pgsel" />
          <span>Items per page:</span>
          <button v-for="n in [10, 20, 50]" :key="n" class="per-link" :class="{ on: mobilePer === n }" @click="mobilePer = n">{{ n }}</button>
        </div>
      </div>
    </div>

    <EditTransactionDialog v-model="editId" @delete="(id: string) => askDelete([id])" />
    <WarningsDialog v-model="warnOpen" @edit="editFromWarnings" />
    <ImportDialog v-model="importOpen" :txns="imp.txns" :errors="imp.errors" :filename="imp.filename" />
    <ConfirmDialog v-model="confirmOpen" :title="confirm?.title ?? ''" :text="confirm?.text" confirm-text="Delete" @confirm="doDelete" />
  </div>
</template>

<style scoped lang="scss">
.page.tx { max-width: 1202px; }
.head1 { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-top: 20px; }
.tx-title { font-size: 20px; font-weight: 500; line-height: 28px; letter-spacing: 0.15px; margin: 0; color: var(--text); }
.src {
  display: flex; align-items: center; gap: 10px; min-width: 156px; height: 51px; margin: 0; padding: 0 14px 4px 15px;
  border: 1px solid var(--text-2); border-radius: 4px; color: var(--text); font-size: 16px; line-height: 20px; cursor: default;
  legend { padding: 0 4px; margin-left: -3px; font-size: 11.5px; line-height: 14px; color: var(--text); }
  .v-icon { color: var(--text); }
}
.head2 { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-top: 17px; }
.items { font-size: 16px; line-height: 24px; padding-top: 2px; color: var(--text); }
.warn-chip {
  display: inline-flex; align-items: center; gap: 9px; height: 27px; margin-top: 3px; padding: 0 13px 0 12px; border: 1.5px solid var(--warn); border-radius: 8px;
  background: rgba(244, 183, 64, 0.04); color: var(--warn); font: 600 12.5px/1 var(--font); letter-spacing: 1.2px; cursor: pointer;
  .v-icon { color: var(--warn); }
  &:hover { background: rgba(244, 183, 64, 0.1); }
}
.head-btns { display: flex; gap: 9px; }
.btn-primary {
  height: 36px; padding: 0 17px; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-fg); font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; white-space: nowrap;
  &:hover { filter: brightness(1.08); }
}
.btn-outline {
  height: 36px; padding: 0 17px; border: 1px solid var(--border-strong); border-radius: 8px; background: transparent; color: var(--primary-text); font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; white-space: nowrap;
  &:hover { background: var(--primary-soft); }
}
.toggle-row { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.mini { padding: 2px; :deep(.pill) { font-size: 12.5px; line-height: 18px; padding: 2px 11px; } }
.toggle-row :deep(.help-tip) { color: var(--muted); }

.tcard { margin-top: 13px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); overflow: hidden; }
.tbar { display: flex; align-items: center; gap: 12px; padding: 12px 12px 13px 13px; border-bottom: 1px solid var(--border); min-height: 66px; }
.search { flex: 0 1 501px; :deep(.v-field) { border-radius: 8px; font-size: 16px; } :deep(input) { font-size: 16px; } :deep(.v-field__prepend-inner .v-icon) { opacity: 1; font-size: 24px; } }
.tbar > .search + .icon-btn { margin-left: -8px; }
.icon-btn {
  position: relative; background: none; border: 0; color: var(--text-2); cursor: pointer; padding: 6px; display: inline-flex; border-radius: 8px;
  &:hover { background: var(--hover); }
  &.on .v-icon { color: var(--primary-text); }
}
.badge { position: absolute; top: 0; right: -2px; min-width: 15px; height: 15px; border-radius: 8px; background: var(--primary); color: var(--primary-fg); font-size: 10px; line-height: 15px; text-align: center; padding: 0 3px; }
.selbar { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--text); padding-left: 4px; }
.sel-del { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 12px; border: 1px solid var(--neg-soft); border-radius: 8px; background: var(--neg-soft); color: var(--neg); font: 600 12.5px/1 var(--font); letter-spacing: 0.8px; cursor: pointer; .v-icon { color: var(--neg); } }
.lnk { background: none; border: 0; padding: 0; color: var(--primary-text); font: 600 13px/1.4 var(--font); cursor: pointer; &:disabled { opacity: 0.4; cursor: default; } }
.muted-l { color: var(--text-2); }

.fmenu { width: 384px; padding: 6px 16px 10px; background: var(--surface-2) !important; }
.fm-lbl { font-size: 11.5px; font-weight: 600; letter-spacing: 0.6px; color: var(--muted); text-transform: uppercase; margin: 12px 0 8px; }
.fchips { display: flex; flex-wrap: wrap; gap: 6px; }
.fchip { border: 1px solid var(--border-strong); background: transparent; color: var(--text-2); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; cursor: pointer; &.on { background: var(--nav-active-bg); border-color: var(--primary); color: var(--primary-fg); } }
.fm-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.fm-foot { display: flex; align-items: center; margin-top: 14px; }

.table-wrap { overflow-x: auto; }
.ttable { width: 100%; min-width: 860px; border-collapse: collapse; table-layout: fixed; font-size: 14px; color: var(--text); }
.ttable th {
  height: 40px; padding: 2px 8px 0 12px; text-align: left; font-size: 11.5px; font-weight: 500; color: var(--text-2); border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  &.sortable { cursor: pointer; user-select: none; &:hover { color: var(--text); } }
}
.ttable.input th:nth-child(2), .ttable.input td:nth-child(2) { padding-left: 4px; }
.sarrow { margin-left: 4px; color: var(--text); }
.ttable td { height: 36px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 20px; }
.ttable tbody tr:hover td { background: var(--hover); }
.ttable tbody tr.sel td { background: var(--primary-soft); }
.ttable tbody tr.clickable { cursor: pointer; }
.c-cb { padding: 0 0 0 11px !important; }
.cb { background: none; border: 0; padding: 0; cursor: pointer; color: var(--text-2); display: inline-flex; vertical-align: middle; &.on { color: var(--primary); } }
.c-act { padding-left: 4px !important; }
.ico {
  background: none; border: 0; padding: 4px 6px; margin-right: 4px; cursor: pointer; color: var(--text-2); display: inline-flex; border-radius: 6px; vertical-align: middle;
  &:hover { background: var(--line-soft); color: var(--text); }
}
.row-warn { color: var(--warn); margin-left: 4px; vertical-align: -1px; cursor: help; }
.status { overflow: visible !important; }
.st-ok { color: var(--pos); }
.st-up { color: var(--warn); }
.auto { display: inline-block; margin-left: 8px; padding: 1px 7px; border: 1px solid rgba(167, 139, 250, 0.55); border-radius: 6px; color: var(--primary-text); font-size: 11px; line-height: 16px; letter-spacing: 0.4px; vertical-align: 1px; }
.empty { padding: 28px 16px; text-align: center; color: var(--text-2); font-size: 14px; }

.pager { display: flex; align-items: center; justify-content: flex-end; gap: 14px; padding: 6px 12px; font-size: 12.8px; color: var(--text-2); border-top: 1px solid var(--border); }
.per { max-width: 72px; :deep(.v-field__input) { font-size: 12.8px; } }
.pg { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; &:disabled { color: var(--faint); cursor: default; } &.round { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-2); align-items: center; justify-content: center; } }

/* ---------- phone ---------- */
.phone {
  .head1 { margin-top: 23px; }
  .src { min-width: 157px; }
  .head2 { margin-top: 17px; }
  .btn-primary { height: 28px; padding: 0 12px; font-size: 12.5px; letter-spacing: 1.1px; }
  .tcard { border-radius: 12px 12px 0 0; border-bottom: 0; overflow: visible; }
  .tbar { padding: 12px 12px 0 12px; border-bottom: 0; min-height: 0; gap: 10px; }
  .search { flex: 1 1 auto; }
}
.m-sort { display: flex; align-items: center; gap: 12px; padding: 8px 12px 13px; border-bottom: 1px solid var(--border); .sort-sel { flex: 0 0 174px; :deep(.v-field) { border-radius: 8px; } } }
.desc { flex: 1; background: none; border: 0; color: var(--text); font: 600 12px/1 var(--font); letter-spacing: 1.2px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 8px 0; }
.mcard { padding: 16px 12px 16px 16px; border-bottom: 1px solid var(--border); &.sel { background: var(--primary-soft); } }
.mc-head { display: flex; align-items: center; gap: 0; min-height: 24px; }
.mc-title { font-size: 16.5px; font-weight: 500; line-height: 22px; color: var(--text); }
.mc-date { margin-left: 9px; font-size: 14px; color: var(--text); line-height: 22px; }
.mc-head .ico { margin-right: 0; padding: 2px 4px; .v-icon { color: var(--text-2); } }
.mc-status { font-size: 13px; }
.mc-grid { display: grid; grid-template-columns: 63px 78px 72px 1fr; align-items: baseline; row-gap: 6px; margin-top: 10px; font-size: 14px; line-height: 20px; color: var(--text); }
.mc-grid .lbl { font-size: 11.5px; color: var(--text-2); white-space: nowrap; }
.mc-grid .span3 { grid-column: span 3; }
.m-pager { padding: 14px 4px 4px; }
.m-pg1 { display: flex; align-items: center; justify-content: space-between; font-size: 12.8px; letter-spacing: 0.4px; color: var(--text); }
.m-pg2 { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; font-weight: 600; .pgsel { max-width: 84px; } }
.per-link { background: none; border: 0; color: var(--text); font-weight: 600; cursor: pointer; padding: 0 2px; &.on { text-decoration: underline; } }
</style>
