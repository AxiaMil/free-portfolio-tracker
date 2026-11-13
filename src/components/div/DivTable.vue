<script setup lang="ts">
// Dividend tables: ticker filter, Upcoming | Historical | Position, and on desktop a ticker x month
// pivot (with Total row) or a per-payout list; on phones, payout / position cards with paging.
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { openAddTransaction, result } from '../../store.ts';
import { historicalWindow, pivotByMonth, positionRows, upcomingWindow, type DivEvent, type DivLabel } from '../../engine/dividends.ts';
import { hidden, money, num, pct } from '../../format.ts';
import PillToggle from '../PillToggle.vue';
import ShareButton from '../ShareButton.vue';
import PayDateDialog from './PayDateDialog.vue';
import { sourceName, sourceTag } from './payoutSources.ts';

const props = defineProps<{ events: DivEvent[] }>();
const { mdAndUp } = useDisplay();

type View = 'Upcoming' | 'Historical' | 'Position';
const VIEWS = ['Upcoming', 'Historical', 'Position'] as const;
const GROUPS = ['Ticker', 'Transaction'] as const;
const view = ref<View>('Upcoming');
const group = ref<'Ticker' | 'Transaction'>('Ticker');
const ticker = ref<string | null>(null);
const page = ref(1);
const perPhone = ref<'10' | '20' | '50'>('10');
const per = computed(() => (mdAndUp.value ? 25 : Number(perPhone.value)));

const today = computed(() => result.value?.today ?? '');
const tickers = computed(() => [...new Set(props.events.map((e) => e.symbol))].sort());
const filtered = computed(() => (ticker.value ? props.events.filter((e) => e.symbol === ticker.value) : props.events));
const win = computed(() => (view.value === 'Historical' ? historicalWindow(filtered.value, today.value) : upcomingWindow(filtered.value, today.value)));
const pivot = computed(() => pivotByMonth(win.value.events, win.value.months));
/** Upcoming: the next 12 months; Historical: every payout received, newest first */
const txRows = computed(() => (view.value === 'Historical' ? filtered.value.filter((e) => !e.upcoming).slice().reverse() : win.value.events));
const posRows = computed(() => {
  const r = result.value;
  if (!r) return [];
  const rows = positionRows(props.events, r);
  return ticker.value ? rows.filter((x) => x.symbol === ticker.value) : rows;
});

const showList = computed(() => !mdAndUp.value || group.value === 'Transaction' || view.value === 'Position');
const listLen = computed(() => (view.value === 'Position' ? posRows.value.length : txRows.value.length));
const pages = computed(() => Math.max(1, Math.ceil(listLen.value / per.value)));
watch([view, group, ticker, per], () => (page.value = 1));
watch(pages, (n) => { if (page.value > n) page.value = n; });
const from = computed(() => (listLen.value ? (page.value - 1) * per.value + 1 : 0));
const to = computed(() => Math.min(listLen.value, page.value * per.value));
const pagedTx = computed(() => txRows.value.slice(from.value ? from.value - 1 : 0, to.value));
const pagedPos = computed(() => posRows.value.slice(from.value ? from.value - 1 : 0, to.value));

const dm = (v: number) => money(v, { decimals: Math.abs(v) >= 100 ? 0 : 2 });
const plain = (v: number | null | undefined) => (hidden() ? '••••' : num(v ?? null, 2));
const labelClass = (l: DivLabel) => (l === 'Confirmed' ? 'conf' : l === 'Paid' ? 'recv' : l === 'To be paid' ? 'due' : 'est');
const LABEL_HELP: Record<DivLabel, string> = {
  Paid: 'Paid into your cash on its payment date.',
  'To be paid': 'Past its ex-dividend date, so it counts in your value and gains; it reaches your cash on its payment date.',
  Confirmed: 'Announced by the company: the ex-dividend date is ahead.',
  Estimated: 'Projected from last year\'s payout of the same period, adjusted for the latest dividend growth.',
};
/** the pay date as shown: the date, or a note when the company's isn't published here */
const payText = (e: DivEvent) => (e.payKnown ? e.payDate : e.status === 'estimated' ? `~${e.payDate}` : 'Not published');
const payTip = (e: DivEvent) => (e.payKnown ? `Payment date from ${sourceName(e.paySource)}` : e.status === 'estimated' ? 'Estimated from the usual time between ex-date and payment' : 'The payment date isn\'t published here yet');
/** automatic dividends past their ex-date: you can type or correct the payment date */
const canEdit = (e: DivEvent) => !e.manual && (e.status === 'received' || e.status === 'toBePaid');
const editing = ref<DivEvent | null>(null);
const editOpen = ref(false);
function editPay(e: DivEvent) {
  if (!canEdit(e)) return;
  editing.value = e;
  editOpen.value = true;
}

function addDividend(symbol: string) {
  openAddTransaction({ action: 'Dividend', symbol, date: today.value });
}
function showTransactions(symbol: string) {
  ticker.value = symbol;
  group.value = 'Transaction';
}

function csv(): Array<Array<string | number>> {
  if (view.value === 'Position') {
    return [['Ticker', 'Shares', 'Market Value', 'Div per Share (12M)', 'Projected Income (12M)', 'Yield', 'Yield on Cost', 'Received (TTM)', 'Next Ex-Date', 'Next Pay Date'],
      ...posRows.value.map((r) => [r.symbol, r.shares, r.marketValue.toFixed(2), r.annualPerShare.toFixed(4), r.projected.toFixed(2), (r.yield * 100).toFixed(2) + '%', (r.yieldOnCost * 100).toFixed(2) + '%', r.receivedTTM.toFixed(2), r.nextEx ?? '', r.nextPay ?? ''])];
  }
  if (group.value === 'Transaction') {
    return [['Ticker', 'Ex-Date', 'Pay Date', 'Pay Date Source', 'Status', 'Div per Share', 'Shares', 'Amount'], ...txRows.value.map((e) => [e.symbol, e.exDate, e.payKnown ? e.payDate : '', e.payKnown ? sourceName(e.paySource) : '', e.label, e.perShareBase.toFixed(4), e.shares, e.amountBase.toFixed(2)])];
  }
  const ms = win.value.months;
  return [['Ticker', ...ms, 'Total'], ...pivot.value.rows.map((r) => [r.symbol, ...ms.map((m) => (r.cells[m] ?? 0).toFixed(2)), r.total.toFixed(2)]), ['Total', ...ms.map((m) => (pivot.value.totals[m] ?? 0).toFixed(2)), pivot.value.total.toFixed(2)]];
}
</script>

<template>
  <div class="dt">
    <v-select v-model="ticker" :items="tickers" label="Ticker" clearable variant="outlined" density="compact" hide-details menu-icon="mdi-menu-down" class="ticker-sel" />
    <div class="toggles">
      <PillToggle v-model="view" :options="VIEWS" />
      <div v-if="mdAndUp" class="row2">
        <PillToggle v-if="view !== 'Position'" v-model="group" :options="GROUPS" />
        <span v-else />
        <ShareButton icon :csv="csv" :filename="`dividends-${view.toLowerCase()}`" label="Export CSV" />
      </div>
    </div>

    <!-- ---------- desktop ---------- -->
    <template v-if="mdAndUp">
      <div class="card tcard">
        <div class="scroll">
          <table v-if="view !== 'Position' && group === 'Ticker'" class="p-table piv">
            <thead>
              <tr>
                <th class="tk">Ticker</th>
                <th v-for="m in win.months" :key="m" class="num">{{ m }}</th>
                <th class="num">Total</th>
                <th class="menu-col" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pivot.rows" :key="row.symbol">
                <td class="tk">{{ row.symbol }}</td>
                <td v-for="m in win.months" :key="m" class="num">{{ row.cells[m] ? dm(row.cells[m]) : '' }}</td>
                <td class="num strong">{{ dm(row.total) }}</td>
                <td class="menu-col">
                  <v-menu location="bottom end">
                    <template #activator="{ props: a }"><button v-bind="a" class="dots" :aria-label="`Actions for ${row.symbol}`"><v-icon size="20">mdi-dots-vertical</v-icon></button></template>
                    <v-list density="compact" class="menu-list">
                      <v-list-item prepend-icon="mdi-plus" title="Add Dividend Transaction" @click="addDividend(row.symbol)" />
                      <v-list-item prepend-icon="mdi-format-list-bulleted" title="Show Payouts" @click="showTransactions(row.symbol)" />
                    </v-list>
                  </v-menu>
                </td>
              </tr>
              <tr v-if="pivot.rows.length" class="total-row">
                <td class="tk">Total</td>
                <td v-for="m in win.months" :key="m" class="num">{{ pivot.totals[m] ? dm(pivot.totals[m]) : '' }}</td>
                <td class="num">{{ dm(pivot.total) }}</td>
                <td class="menu-col" />
              </tr>
              <tr v-else><td :colspan="win.months.length + 3" class="empty">No dividends in this period</td></tr>
            </tbody>
          </table>

          <table v-else-if="view !== 'Position'" class="p-table tx">
            <thead>
              <tr><th>Ticker</th><th>Ex-Date</th><th>Pay Date</th><th>Status</th><th class="num">Div per Share</th><th class="num">Shares</th><th class="num">Div Amount</th></tr>
            </thead>
            <tbody>
              <tr v-for="e in pagedTx" :key="e.key">
                <td class="tk">{{ e.symbol }}</td>
                <td>{{ e.exDate }}</td>
                <td>
                  <v-tooltip :text="payTip(e)" max-width="300">
                    <template #activator="{ props: a }">
                      <button v-if="canEdit(e)" v-bind="a" class="pay" :class="{ unk: !e.payKnown }" :aria-label="`Payment date of ${e.symbol} ex ${e.exDate}`" @click="editPay(e)">
                        {{ payText(e) }}<span v-if="e.payKnown && sourceTag(e.paySource)" class="src">{{ sourceTag(e.paySource) }}</span><v-icon size="14" class="ed">mdi-pencil</v-icon>
                      </button>
                      <span v-else v-bind="a" class="pay" :class="{ unk: !e.payKnown }">{{ payText(e) }}<span v-if="e.payKnown && sourceTag(e.paySource)" class="src">{{ sourceTag(e.paySource) }}</span></span>
                    </template>
                  </v-tooltip>
                </td>
                <td>
                  <v-tooltip :text="LABEL_HELP[e.label]" max-width="300"><template #activator="{ props: a }"><span v-bind="a" class="st" :class="labelClass(e.label)">{{ e.label }}</span></template></v-tooltip>
                </td>
                <td class="num">{{ money(e.perShareBase, { decimals: e.perShareBase < 0.1 ? 4 : 2 }) }}</td>
                <td class="num">{{ plain(e.shares) }}</td>
                <td class="num strong">{{ money(e.amountBase) }}</td>
              </tr>
              <tr v-if="!txRows.length"><td colspan="7" class="empty">No dividends in this period</td></tr>
            </tbody>
          </table>

          <table v-else class="p-table posn">
            <thead>
              <tr>
                <th>Ticker</th><th class="num">Shares</th><th class="num">Market Value</th><th class="num">Div / Share (12M)</th><th class="num">Projected (12M)</th>
                <th class="num">Yield</th><th class="num">Yield on Cost</th><th class="num">Received (TTM)</th><th>Next Ex-Date</th><th>Next Pay Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pagedPos" :key="r.symbol">
                <td class="tk">{{ r.symbol }}</td>
                <td class="num">{{ plain(r.shares) }}</td>
                <td class="num">{{ money(r.marketValue, { decimals: 'auto' }) }}</td>
                <td class="num">{{ money(r.annualPerShare) }}</td>
                <td class="num strong">{{ money(r.projected) }}</td>
                <td class="num">{{ pct(r.yield, { sign: false }) }}</td>
                <td class="num">{{ pct(r.yieldOnCost, { sign: false }) }}</td>
                <td class="num">{{ money(r.receivedTTM) }}</td>
                <td>{{ r.nextEx ?? '-' }}</td>
                <td :class="{ unk: r.nextEx && !r.nextPay }">{{ r.nextPay ?? (r.nextEx ? 'Not published' : '-') }}</td>
              </tr>
              <tr v-if="!posRows.length"><td colspan="10" class="empty">No dividend-paying holdings</td></tr>
            </tbody>
          </table>
        </div>
        <div v-if="showList && pages > 1" class="pager desk">
          <span>{{ from }}-{{ to }} of {{ listLen }}</span>
          <button class="pg" :disabled="page <= 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
          <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
        </div>
      </div>
    </template>

    <!-- ---------- phone ---------- -->
    <template v-else>
      <div class="cards">
        <template v-if="view !== 'Position'">
          <div v-for="e in pagedTx" :key="e.key" class="dcard">
            <div class="dc-h">
              <span class="sym">{{ e.symbol }}</span>
              <span class="st" :class="labelClass(e.label)">{{ e.label }}</span>
            </div>
            <div class="dc-r"><span>Ex-Date</span><span>{{ e.exDate }}</span></div>
            <div class="dc-r">
              <span>Pay Date</span>
              <span>
                <button v-if="canEdit(e)" class="pay" :class="{ unk: !e.payKnown }" :aria-label="`Payment date of ${e.symbol} ex ${e.exDate}`" @click="editPay(e)">
                  {{ payText(e) }}<span v-if="e.payKnown && sourceTag(e.paySource)" class="src">{{ sourceTag(e.paySource) }}</span><v-icon size="14" class="ed">mdi-pencil</v-icon>
                </button>
                <span v-else class="pay" :class="{ unk: !e.payKnown }">{{ payText(e) }}<span v-if="e.payKnown && sourceTag(e.paySource)" class="src">{{ sourceTag(e.paySource) }}</span></span>
              </span>
            </div>
            <div class="dc-r"><span>Div Amount</span><span>{{ plain(e.amountBase) }}</span></div>
            <div class="dc-r"><span>Shares</span><span>{{ plain(e.shares) }}</span></div>
            <div class="dc-r"><span>Div per Share</span><span>{{ hidden() ? '••••' : num(e.perShareBase, e.perShareBase < 0.1 ? 4 : 2) }}</span></div>
          </div>
        </template>
        <template v-else>
          <div v-for="r in pagedPos" :key="r.symbol" class="dcard">
            <div class="dc-h"><span class="sym">{{ r.symbol }}</span><span class="date">{{ r.nextPay ? `next paid ${r.nextPay}` : r.nextEx ? `next ex ${r.nextEx}` : '' }}</span></div>
            <div class="dc-r"><span>Projected (12M)</span><span>{{ plain(r.projected) }}</span></div>
            <div class="dc-r"><span>Shares</span><span>{{ plain(r.shares) }}</span></div>
            <div class="dc-r"><span>Yield</span><span>{{ pct(r.yield, { sign: false }) }}</span></div>
            <div class="dc-r"><span>Yield on Cost</span><span>{{ pct(r.yieldOnCost, { sign: false }) }}</span></div>
            <div class="dc-r"><span>Received (TTM)</span><span>{{ plain(r.receivedTTM) }}</span></div>
          </div>
        </template>
        <div v-if="!listLen" class="empty">{{ view === 'Position' ? 'No dividend-paying holdings' : 'No dividends in this period' }}</div>
      </div>
      <div class="pager">
        <button class="pg" :disabled="page <= 1" aria-label="Previous page" @click="page--"><v-icon>mdi-chevron-left</v-icon></button>
        <span>{{ from }}-{{ to }} of {{ listLen }} results</span>
        <button class="pg" :disabled="page >= pages" aria-label="Next page" @click="page++"><v-icon>mdi-chevron-right</v-icon></button>
      </div>
      <div class="per">
        <span>Items per page</span>
        <PillToggle v-model="perPhone" :options="['10', '20', '50'] as const" size="sm" />
      </div>
    </template>
    <PayDateDialog v-model="editOpen" :event="editing" />
  </div>
</template>

<style scoped lang="scss">
.ticker-sel { max-width: 500px; }
.ticker-sel :deep(.v-field) { border-radius: 8px; }
.toggles { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.row2 { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.tcard { margin-top: 16px; overflow: hidden; }
.scroll { overflow-x: auto; }
.p-table th { color: var(--text); font-size: 12px; height: 40px; }
.p-table td { height: 36px; font-size: 14px; }
.p-table th.num, .p-table td.num { text-align: right; padding-right: 10px; }
.piv th.num, .piv td.num { min-width: 0; padding-left: 2px; padding-right: 8px; }
.piv td.num { font-size: 13px; }
.piv th { font-size: 11.5px; }
.tk { font-weight: 500; padding-left: 16px !important; }
.strong { font-weight: 600; }
.menu-col { width: 40px; padding: 0 8px 0 0 !important; text-align: right; }
.dots { background: none; border: 0; color: var(--text-2); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; &:hover { background: var(--line-soft); color: var(--text); } }
.total-row td { font-weight: 600; border-top: 1px solid var(--border); background: var(--hover); }
.empty { text-align: center; color: var(--muted); padding: 22px 0 !important; }
.st { font-size: 13px; }
.st.conf { color: var(--pos); }
.st.recv { color: var(--text-2); }
.st.est { color: var(--text); }
.st.due { color: var(--warn); }
.pay { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; }
button.pay { cursor: pointer; border-radius: 6px; .ed { color: var(--muted); } &:hover { text-decoration: underline; .ed { color: var(--text); } } }
.unk, .pay.unk { color: var(--muted); }
.src { font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 6px; background: var(--line-soft); color: var(--text-2); }
.pager { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 14px; font-size: 14px; color: var(--text); }
.pager.desk { justify-content: flex-end; gap: 6px; padding: 6px 12px; margin: 0; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-2); span { margin-right: 8px; } }
.pg { background: none; border: 0; color: var(--text); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; &:disabled { color: var(--faint); cursor: default; } &:hover:not(:disabled) { background: var(--line-soft); } }
.menu-list :deep(.v-list-item-title) { font-size: 14px; }
.cards { margin-top: 12px; display: flex; flex-direction: column; gap: 9px; }
.dcard { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); padding: 17px 16px 14px; }
.dc-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 9px; flex-wrap: wrap; }
.sym { font-size: 16px; font-weight: 500; color: var(--text); }
.date { font-size: 14px; color: var(--text); }
.dc-h .st { font-size: 14px; }
.dc-r { display: grid; grid-template-columns: 146px 1fr; padding-left: 16px; font-size: 12.5px; line-height: 26px; color: var(--text-2); span:last-child { color: var(--text); font-size: 14px; } }
.per { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; font-size: 12.5px; color: var(--text-2); }
@media (max-width: 959px) {
  .ticker-sel { max-width: none; }
  .toggles { margin-top: 14px; }
}
</style>
