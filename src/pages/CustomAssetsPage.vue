<script setup lang="ts">
// Custom Assets: track anything without market data. Assets live in activePortfolio.customAssets and are priced
// from their manual price points by the engine's MarketView (last price carried forward).
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRoute, useRouter } from 'vue-router';
import { activePortfolio, deleteTransactions, openAddTransaction, result, store, toast } from '../store.ts';
import type { CustomAsset } from '../engine/types.ts';
import { ccySymbol, money, pct, signClass } from '../format.ts';
import { fmtPrice, fmtShares } from '../components/txn/fmt.ts';
import PDialog from '../components/txn/PDialog.vue';
import ConfirmDialog from '../components/txn/ConfirmDialog.vue';
import CustomAssetDialog from '../components/custom/CustomAssetDialog.vue';
import PriceHistory from '../components/custom/PriceHistory.vue';
import { lastPrice, upsertPrice } from '../components/custom/options.ts';

const { mdAndUp } = useDisplay();
const route = useRoute();
const router = useRouter();

const assets = computed<CustomAsset[]>(() => activePortfolio.value?.customAssets ?? []);
const holding = (sym: string) => result.value?.holdings.find((h) => h.symbol === sym) ?? null;
const txCount = (sym: string) => (activePortfolio.value?.transactions ?? []).filter((t) => t.symbol.toUpperCase() === sym).length;
const totalValue = computed(() => assets.value.reduce((s, a) => s + (holding(a.symbol)?.marketValue ?? 0), 0));

// selected asset (kept in the URL so it can be linked: /custom-assets?asset=HOME)
const selectedSym = ref<string | null>(typeof route.query.asset === 'string' ? route.query.asset : null);
watch(() => route.query.asset, (a) => { if (typeof a === 'string') selectedSym.value = a; });
watch(assets, (list) => {
  if (!list.length) selectedSym.value = null;
  else if (mdAndUp.value && !list.some((a) => a.symbol === selectedSym.value)) selectedSym.value = list[0].symbol;
}, { immediate: true, deep: false });
const selected = computed(() => assets.value.find((a) => a.symbol === selectedSym.value) ?? null);
function select(sym: string) {
  selectedSym.value = !mdAndUp.value && selectedSym.value === sym ? null : sym;
  router.replace({ query: { ...route.query, asset: selectedSym.value ?? undefined } });
}

// create / edit
const assetDlg = ref(false);
const editing = ref<CustomAsset | null>(null);
function openCreate() { editing.value = null; assetDlg.value = true; }
function openEdit(a: CustomAsset) { editing.value = a; assetDlg.value = true; }
const justCreated = ref<string | null>(null);
function onSaved(sym: string, created: boolean) {
  selectedSym.value = sym;
  router.replace({ query: { ...route.query, asset: sym } });
  if (created) justCreated.value = sym;
}

// quick price update
const priceDlg = ref(false);
const priceFor = ref<CustomAsset | null>(null);
const priceForm = ref({ date: '', price: '' });
const priceErr = ref('');
function openPrice(a: CustomAsset) {
  priceFor.value = a;
  const lp = lastPrice(a);
  priceForm.value = { date: store.today, price: lp ? String(lp[1]) : '' };
  priceErr.value = '';
  priceDlg.value = true;
}
function savePrice() {
  const a = priceFor.value;
  const p = Number(priceForm.value.price);
  if (!a) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(priceForm.value.date)) { priceErr.value = 'Enter a valid date'; return; }
  if (!(p > 0)) { priceErr.value = 'Enter a price greater than 0'; return; }
  upsertPrice(a, priceForm.value.date, p);
  toast(`${a.symbol} price updated to ${fmtPrice(p)} on ${priceForm.value.date}`);
  priceDlg.value = false;
}

// add transactions
function addTxn(a: CustomAsset) {
  const lp = lastPrice(a);
  openAddTransaction({ symbol: a.symbol, action: 'Buy', currency: 'Market', price: lp ? lp[1] : undefined, date: store.today });
  if (justCreated.value === a.symbol) justCreated.value = null;
}

// delete
const delFor = ref<CustomAsset | null>(null);
const delTxns = ref(true);
const delOpen = computed({ get: () => !!delFor.value, set: (v: boolean) => { if (!v) delFor.value = null; } });
function askDelete(a: CustomAsset) { delFor.value = a; delTxns.value = true; }
function doDelete() {
  const a = delFor.value;
  const p = activePortfolio.value;
  if (!a || !p) return;
  const n = txCount(a.symbol);
  if (delTxns.value && n) deleteTransactions(p.transactions.filter((t) => t.symbol.toUpperCase() === a.symbol).map((t) => t.id));
  p.customAssets = p.customAssets.filter((c) => c !== a);
  toast(`${a.symbol} deleted${delTxns.value && n ? ` with ${n} transaction${n > 1 ? 's' : ''}` : ''}`);
  delFor.value = null;
}

const lastOf = (a: CustomAsset) => lastPrice(a);
const daysOld = (a: CustomAsset) => {
  const lp = lastPrice(a);
  return lp ? Math.round((Date.parse(store.today) - Date.parse(lp[0])) / 86400000) : null;
};
</script>

<template>
  <div class="page ca" :class="{ phone: !mdAndUp }">
    <div class="ca-head">
      <h1 class="ttl">Custom Assets</h1>
      <button v-if="assets.length" class="btn-primary" data-test="add-asset" @click="openCreate">+ Add Custom Asset</button>
    </div>

    <!-- ============ empty state ============ -->
    <div v-if="!assets.length" class="empty">
      <div class="hero">
        <div class="hero-ic"><v-icon size="30">mdi-card-text</v-icon></div>
        <h2 class="hero-t">Custom Asset Manager</h2>
        <div class="hero-s">Track Any Asset, Anywhere</div>
        <p class="hero-p">Property, private funds, fixed deposits, bonds, collectibles, or any holding without a market ticker. Give it a price and it counts towards your portfolio value, allocation and returns.</p>
      </div>
      <div class="steps">
        <div class="step">
          <div class="step-n">1</div>
          <div class="step-t">Add Custom Asset</div>
          <div class="step-d">Give it a name, a ticker of your choice and its currency.</div>
          <button class="btn-primary mt-auto" data-test="add-asset" @click="openCreate">+ Add Custom Asset</button>
        </div>
        <div class="step">
          <div class="step-n">2</div>
          <div class="step-t">Add Transactions</div>
          <div class="step-d">Record your buys and sells for the asset, just like for a listed stock.</div>
        </div>
        <div class="step">
          <div class="step-n">3</div>
          <div class="step-t">Update Price</div>
          <div class="step-d">Enter a new price whenever its value changes. The latest price is used until you add the next one.</div>
        </div>
      </div>
    </div>

    <!-- ============ with assets ============ -->
    <template v-else>
      <div class="sub">
        <span>{{ assets.length }} asset{{ assets.length === 1 ? '' : 's' }}</span>
        <span class="dot">·</span>
        <span>Total value <b>{{ money(totalValue) }}</b></span>
      </div>

      <!-- desktop table -->
      <div v-if="mdAndUp" class="tcard">
        <table class="p-table atable">
          <thead>
            <tr><th>Ticker</th><th>Assets Type</th><th>Currency</th><th>Last Price</th><th>Price Date</th><th>Shares</th><th>Market Value</th><th>Unr. Gain</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="a in assets" :key="a.symbol" :class="{ sel: a.symbol === selectedSym }" @click="select(a.symbol)">
              <td class="tick"><b>{{ a.symbol }}</b><span class="name">{{ a.name }}</span></td>
              <td>{{ a.assetType || 'Others' }}</td>
              <td>{{ a.currency }}</td>
              <td>{{ fmtPrice(lastOf(a)?.[1]) }}</td>
              <td>
                {{ lastOf(a)?.[0] ?? '-' }}
                <v-tooltip v-if="(daysOld(a) ?? 0) > 31" :text="`Last price is ${daysOld(a)} days old`"><template #activator="{ props }"><v-icon v-bind="props" size="14" class="stale">mdi-clock-alert-outline</v-icon></template></v-tooltip>
              </td>
              <td>{{ holding(a.symbol) ? fmtShares(holding(a.symbol)!.shares) : '-' }}</td>
              <td>{{ holding(a.symbol) ? money(holding(a.symbol)!.marketValue) : '-' }}</td>
              <td :class="signClass(holding(a.symbol)?.unrealized)">{{ holding(a.symbol) ? money(holding(a.symbol)!.unrealized, { sign: true }) : '-' }}</td>
              <td class="acts" @click.stop>
                <button class="mini-btn" data-test="update-price" @click="openPrice(a)">Update Price</button>
                <v-tooltip text="Add transaction"><template #activator="{ props }"><button v-bind="props" class="ico" :aria-label="`Add transaction for ${a.symbol}`" @click="addTxn(a)"><v-icon size="20">mdi-plus-circle-outline</v-icon></button></template></v-tooltip>
                <v-tooltip text="Edit asset"><template #activator="{ props }"><button v-bind="props" class="ico" :aria-label="`Edit ${a.symbol}`" @click="openEdit(a)"><v-icon size="20">mdi-pencil</v-icon></button></template></v-tooltip>
                <v-tooltip text="Delete asset"><template #activator="{ props }"><button v-bind="props" class="ico" :aria-label="`Delete ${a.symbol}`" @click="askDelete(a)"><v-icon size="20">mdi-delete</v-icon></button></template></v-tooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- phone cards -->
      <template v-else>
        <div v-for="a in assets" :key="a.symbol" class="acard" :class="{ open: a.symbol === selectedSym }">
          <button class="ac-top" @click="select(a.symbol)">
            <div class="ac-left">
              <div class="ac-sym">{{ a.symbol }}</div>
              <div class="ac-name">{{ a.name }}</div>
            </div>
            <div class="ac-right">
              <div class="ac-val">{{ holding(a.symbol) ? money(holding(a.symbol)!.marketValue) : '-' }}</div>
              <div class="ac-px">{{ ccySymbol(a.currency) }}{{ fmtPrice(lastOf(a)?.[1]) }} · {{ lastOf(a)?.[0] }}</div>
            </div>
            <v-icon size="20" class="ac-chev">{{ a.symbol === selectedSym ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </button>
          <div v-if="a.symbol === selectedSym" class="ac-body">
            <div class="kv">
              <span>Assets Type</span><b>{{ a.assetType || 'Others' }}</b>
              <span>Currency</span><b>{{ a.currency }}</b>
              <span>Shares</span><b>{{ holding(a.symbol) ? fmtShares(holding(a.symbol)!.shares) : '-' }}</b>
              <span>Unr. Gain</span><b :class="signClass(holding(a.symbol)?.unrealized)">{{ holding(a.symbol) ? money(holding(a.symbol)!.unrealized, { sign: true }) : '-' }}</b>
              <span>Transactions</span><b><router-link :to="{ path: '/transactions', query: { q: a.symbol } }" class="lnk">{{ txCount(a.symbol) }}</router-link></b>
            </div>
            <div class="ac-actions">
              <button class="btn-primary sm" @click="openPrice(a)">Update Price</button>
              <button class="btn-outline sm" @click="addTxn(a)">+ Transaction</button>
              <button class="ico" :aria-label="`Edit ${a.symbol}`" @click="openEdit(a)"><v-icon size="20">mdi-pencil</v-icon></button>
              <button class="ico" :aria-label="`Delete ${a.symbol}`" @click="askDelete(a)"><v-icon size="20">mdi-delete</v-icon></button>
            </div>
            <PriceHistory :asset="a" compact />
          </div>
        </div>
      </template>

      <!-- desktop detail -->
      <div v-if="mdAndUp && selected" class="detail card">
        <div class="d-head">
          <div>
            <div class="d-sym">{{ selected.symbol }} <span class="d-name">{{ selected.name }}</span></div>
            <div class="chips">
              <span class="chip">{{ selected.currency }}</span>
              <span class="chip">{{ selected.assetType || 'Others' }}</span>
              <span v-if="selected.sector" class="chip">{{ selected.sector }}</span>
              <span v-if="selected.country" class="chip">{{ selected.country }}</span>
            </div>
          </div>
          <v-spacer />
          <button class="btn-primary" @click="openPrice(selected)">Update Price</button>
          <button class="btn-outline" @click="addTxn(selected)">+ Add Transaction</button>
          <button class="outline-btn icon" :aria-label="`Edit ${selected.symbol}`" @click="openEdit(selected)"><v-icon size="20">mdi-pencil</v-icon></button>
        </div>
        <div v-if="!txCount(selected.symbol)" class="next">
          <v-icon size="18" class="mr-2">mdi-lightbulb-on-outline</v-icon>
          <span><b>Next: add transactions.</b> {{ selected.symbol }} is not in your holdings until you record a buy (or a transfer in).</span>
          <v-spacer />
          <button class="lnk" @click="addTxn(selected)">Add transaction</button>
        </div>
        <div class="kpis">
          <div><span>Last Price</span><b>{{ ccySymbol(selected.currency) }}{{ fmtPrice(lastOf(selected)?.[1]) }}</b><small>{{ lastOf(selected)?.[0] }}</small></div>
          <div><span>Shares</span><b>{{ holding(selected.symbol) ? fmtShares(holding(selected.symbol)!.shares) : '-' }}</b></div>
          <div><span>Market Value</span><b>{{ holding(selected.symbol) ? money(holding(selected.symbol)!.marketValue) : '-' }}</b><small v-if="holding(selected.symbol)">{{ pct(holding(selected.symbol)!.allocation, { sign: false }) }} of portfolio</small></div>
          <div><span>Unrealized Gain</span><b :class="signClass(holding(selected.symbol)?.unrealized)">{{ holding(selected.symbol) ? money(holding(selected.symbol)!.unrealized, { sign: true }) : '-' }}</b><small v-if="holding(selected.symbol)" :class="signClass(holding(selected.symbol)!.unrealizedPct)">{{ pct(holding(selected.symbol)!.unrealizedPct) }}</small></div>
          <div><span>Transactions</span><b><router-link :to="{ path: '/transactions', query: { q: selected.symbol } }" class="lnk big">{{ txCount(selected.symbol) }}</router-link></b><small>view in Transactions</small></div>
        </div>
        <div class="ph-title">Price History</div>
        <PriceHistory :asset="selected" />
      </div>
    </template>

    <CustomAssetDialog v-model="assetDlg" :asset="editing" @saved="onSaved" />

    <PDialog v-model="priceDlg" step="Step 3 of 3" :title="`Update Price${priceFor ? ' · ' + priceFor.symbol : ''}`" :max-width="440">
      <div v-if="priceFor" class="muted mb-4">Last price {{ ccySymbol(priceFor.currency) }}{{ fmtPrice(lastOf(priceFor)?.[1]) }} on {{ lastOf(priceFor)?.[0] }}. A price on the same date replaces it.</div>
      <div class="pgrid">
        <v-text-field v-model="priceForm.date" type="date" label="Date" />
        <v-text-field v-model="priceForm.price" type="number" min="0" :label="`Price (${priceFor?.currency})`" autofocus @keydown.enter="savePrice" />
      </div>
      <div v-if="priceErr" class="err">{{ priceErr }}</div>
      <template #actions>
        <v-spacer />
        <button class="tbtn" @click="priceDlg = false">Cancel</button>
        <button class="tbtn primary" data-test="save-price" @click="savePrice">Save Price</button>
      </template>
    </PDialog>

    <ConfirmDialog v-model="delOpen" :title="`Delete ${delFor?.symbol}?`" confirm-text="Delete" @confirm="doDelete">
      <p class="mt-0">{{ delFor?.name }} and its {{ delFor?.prices.length }} price point{{ delFor?.prices.length === 1 ? '' : 's' }} will be removed from {{ activePortfolio?.name }}.</p>
      <v-checkbox v-if="delFor && txCount(delFor.symbol)" v-model="delTxns" density="compact" hide-details color="primary" :label="`Also delete its ${txCount(delFor.symbol)} transaction${txCount(delFor.symbol) > 1 ? 's' : ''}`" />
      <p v-if="delFor && txCount(delFor.symbol) && !delTxns" class="warn-t">The transactions stay and {{ delFor.symbol }} will be looked up as a market ticker instead.</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped lang="scss">
.ca-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; min-height: 36px; }
.ttl { font-size: 20px; font-weight: 500; line-height: 28px; letter-spacing: 0.15px; margin: 0; color: var(--text); }
.btn-primary {
  height: 36px; padding: 0 17px; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-fg); font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; white-space: nowrap;
  &:hover { filter: brightness(1.08); }
  &.sm { height: 32px; padding: 0 12px; font-size: 12.5px; letter-spacing: 1px; }
}
.btn-outline {
  height: 36px; padding: 0 17px; border: 1px solid var(--border-strong); border-radius: 8px; background: transparent; color: var(--primary-text); font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; white-space: nowrap;
  &:hover { background: var(--primary-soft); }
  &.sm { height: 32px; padding: 0 12px; font-size: 12.5px; letter-spacing: 1px; }
}
.lnk { background: none; border: 0; padding: 0; color: var(--primary-text); font-weight: 600; cursor: pointer; text-decoration: none; &.big { font-size: 18px; } }

/* empty state */
.empty { margin-top: 28px; }
.hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 36px 20px 8px; }
.hero-ic { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--nav-active-bg); .v-icon { color: var(--primary-text); } }
.hero-t { margin: 20px 0 0; font-size: 26px; font-weight: 600; line-height: 34px; color: var(--text); }
.hero-s { margin-top: 6px; font-size: 16px; font-weight: 500; color: var(--primary-text); letter-spacing: 0.2px; }
.hero-p { max-width: 560px; margin: 14px 0 0; font-size: 14px; line-height: 22px; color: var(--text-2); }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 36px; }
.step { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-height: 196px; padding: 22px 22px 20px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg); }
.step-n { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--nav-active-bg); color: var(--primary-text); font-weight: 700; font-size: 15px; margin-bottom: 10px; }
.step-t { font-size: 17px; font-weight: 500; color: var(--text); }
.step-d { font-size: 14px; line-height: 21px; color: var(--text-2); margin-bottom: 16px; }
.mt-auto { margin-top: auto; }

/* list */
.sub { display: flex; align-items: center; gap: 8px; margin: 10px 0 16px; font-size: 14px; color: var(--text-2); b { color: var(--text); font-weight: 500; } .dot { color: var(--faint); } }
.tcard { border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; }
.atable td { height: 52px; cursor: pointer; }
.atable tr.sel td { background: var(--primary-soft); }
.tick b { display: block; font-weight: 600; line-height: 19px; }
.tick .name { display: block; font-size: 11.5px; line-height: 15px; color: var(--muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.stale { color: var(--warn); margin-left: 4px; vertical-align: -1px; }
.acts { text-align: right; padding-right: 10px !important; white-space: nowrap; cursor: default; }
.mini-btn { height: 28px; padding: 0 10px; margin-right: 6px; border: 1px solid var(--border-strong); border-radius: 7px; background: transparent; color: var(--text); font: 600 12px/1 var(--font); letter-spacing: 0.8px; cursor: pointer; &:hover { background: var(--hover); } }
.ico { background: none; border: 0; padding: 4px; cursor: pointer; color: var(--text-2); display: inline-flex; border-radius: 6px; vertical-align: middle; &:hover { background: var(--line-soft); color: var(--text); } }

/* detail */
.detail { margin-top: 16px; padding: 20px 22px 22px; }
.d-head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.d-sym { font-size: 20px; font-weight: 700; line-height: 28px; }
.d-name { font-size: 14px; font-weight: 400; color: var(--text-2); margin-left: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { font-size: 12px; padding: 2px 9px; border-radius: 999px; background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
.next { display: flex; align-items: center; gap: 4px; margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: var(--primary-soft); border: 1px solid var(--primary-soft); font-size: 13.5px; color: var(--primary-text); .v-icon { color: var(--primary-text); } b { font-weight: 600; } }
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 18px 0 20px; }
.kpis > div { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; }
.kpis span { font-size: 12px; color: var(--text-2); }
.kpis b { font-size: 18px; font-weight: 600; line-height: 26px; }
.kpis small { font-size: 12px; color: var(--muted); }
.ph-title { font-size: 16px; font-weight: 500; margin-bottom: 10px; }

/* phone */
.phone .ca-head { margin-top: 23px; }
.phone .btn-primary:not(.sm) { height: 28px; padding: 0 12px; font-size: 12.5px; letter-spacing: 1.1px; }
.acard { border: 1px solid var(--border); border-radius: 14px; margin-bottom: 10px; background: var(--surface); overflow: hidden; }
.ac-top { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 10px 12px 14px; background: none; border: 0; color: inherit; text-align: left; cursor: pointer; }
.ac-left { flex: 1; min-width: 0; }
.ac-sym { font-weight: 700; font-size: 16px; line-height: 22px; }
.ac-name { color: var(--muted); font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ac-right { text-align: right; }
.ac-val { font-size: 15px; font-weight: 500; }
.ac-px { font-size: 11.5px; color: var(--text-2); }
.ac-chev { color: var(--text-2); }
.ac-body { padding: 4px 14px 14px; border-top: 1px solid var(--border); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 10px 0; font-size: 13.5px; span { color: var(--text-2); font-size: 12.5px; } b { font-weight: 500; text-align: right; } }
.ac-actions { display: flex; align-items: center; gap: 8px; margin: 12px 0 14px; flex-wrap: wrap; }
.pgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.err { color: var(--neg); font-size: 13px; margin-top: 10px; }
.warn-t { color: var(--warn); font-size: 13px; margin: 6px 0 0; }
@media (max-width: 959px) {
  .steps { grid-template-columns: 1fr; margin-top: 24px; }
  .step { min-height: 0; }
  .hero { padding-top: 20px; }
  .hero-t { font-size: 22px; }
}
</style>
