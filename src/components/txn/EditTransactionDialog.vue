<script setup lang="ts">
// Edit one transaction of the active portfolio in place (updateTransaction), with the price-range warning if any.
import { computed, reactive, ref, watch } from 'vue';
import { activePortfolio, fetchSearch, marketView, result, toast, updateTransaction } from '../../store.ts';
import { ASSET_ACTIONS, CASH_ACTIONS, POPULAR_ACTIONS, type Action } from '../../engine/types.ts';
import { CURRENCIES, fmtPrice } from './fmt.ts';
import PDialog from './PDialog.vue';

const model = defineModel<string | null>({ default: null });
const emit = defineEmits<{ (e: 'delete', id: string): void }>();

const ALL_ACTIONS: Action[] = [...new Set([...POPULAR_ACTIONS, ...ASSET_ACTIONS, ...CASH_ACTIONS])];
const isCash = (a: Action) => CASH_ACTIONS.includes(a);
const groupOf = (a: Action) => (POPULAR_ACTIONS.includes(a) ? 'Popular' : CASH_ACTIONS.includes(a) ? 'Cash' : 'Asset');

const form = reactive({ date: '', action: 'Buy' as Action, symbol: '', shares: '', price: '', currency: 'Market', commission: '0', note: '' });
const error = ref('');
const searchItems = ref<Array<{ symbol: string; name: string; exchange: string }>>([]);
const searching = ref(false);

const txn = computed(() => activePortfolio.value?.transactions.find((t) => t.id === model.value) ?? null);
const open = computed({ get: () => !!model.value, set: (v: boolean) => { if (!v) model.value = null; } });
const warning = computed(() => result.value?.warnings.find((w) => w.id === model.value && w.kind === 'price') ?? null);
const oversold = computed(() => result.value?.warnings.find((w) => w.id === model.value && w.kind === 'oversold') ?? null);

watch(model, () => {
  const t = txn.value;
  if (!t) return;
  form.date = t.date;
  form.action = t.action;
  form.symbol = t.symbol === 'CASH' ? '' : t.symbol;
  form.shares = String(t.shares);
  form.price = String(t.price);
  form.currency = t.currency || 'Market';
  form.commission = String(t.commission ?? 0);
  form.note = t.note ?? '';
  error.value = '';
  searchItems.value = [];
}, { immediate: true });

const customItems = computed(() => (activePortfolio.value?.customAssets ?? []).map((c) => ({ symbol: c.symbol, name: c.name, exchange: 'Custom asset' })));
const tickerItems = computed(() => {
  const seen = new Set<string>();
  return [...searchItems.value, ...customItems.value].filter((x) => (seen.has(x.symbol) ? false : (seen.add(x.symbol), true)));
});

let timer: ReturnType<typeof setTimeout> | null = null;
function onSearch(q: string | null) {
  if (timer) clearTimeout(timer);
  if (!q || q === form.symbol && searchItems.value.length) return;
  timer = setTimeout(async () => {
    searching.value = true;
    searchItems.value = await fetchSearch(q).catch(() => []);
    searching.value = false;
  }, 220);
}

function setAction(a: Action) {
  form.action = a;
  if (isCash(a)) {
    form.symbol = '';
    if (form.currency === 'Market') form.currency = activePortfolio.value?.currency ?? 'USD';
    if (!form.price) form.price = '1';
  }
}

/** the day's close for the ticker, in the same (split-unadjusted) terms as the trade */
const closePrice = computed(() => {
  if (!warning.value) return null;
  return marketView.value.tradedCloseAt(warning.value.symbol, warning.value.date);
});

function validate(): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return 'Enter a valid date';
  if (!isCash(form.action) && !form.symbol.trim()) return 'Ticker is required';
  if (!(Number(form.shares) > 0)) return isCash(form.action) ? 'Amount must be greater than 0' : 'Shares must be greater than 0';
  if (form.price === '' || !(Number(form.price) >= 0)) return 'Price is required';
  if (form.commission !== '' && !(Number(form.commission) >= 0)) return 'Commission must be 0 or more';
  return null;
}

function save() {
  const t = txn.value;
  if (!t) return;
  const e = validate();
  if (e) { error.value = e; return; }
  updateTransaction(t.id, {
    date: form.date,
    action: form.action,
    symbol: isCash(form.action) ? 'CASH' : String(form.symbol).trim().toUpperCase(),
    price: Number(form.price),
    currency: form.currency,
    shares: Number(form.shares),
    commission: Number(form.commission) || 0,
    note: form.note,
  });
  toast('Transaction updated');
  model.value = null;
}
</script>

<template>
  <PDialog v-model="open" title="Edit Transaction" :step="activePortfolio?.name" :max-width="640" fullscreen-mobile>
    <div v-if="warning" class="warn">
      <v-icon size="18" class="mr-2">mdi-alert-circle</v-icon>
      <div class="flex-1">
        <div>Price {{ fmtPrice(txn?.price) }} is outside the day's low–high range ({{ fmtPrice(warning.low) }} – {{ fmtPrice(warning.high) }}) for {{ warning.symbol }} on {{ warning.date }}.</div>
        <button v-if="closePrice != null" class="link" @click="form.price = String(+closePrice.toFixed(4))">Use the close price {{ fmtPrice(+closePrice.toFixed(4)) }}</button>
      </div>
    </div>
    <div v-if="oversold" class="warn">
      <v-icon size="18" class="mr-2">mdi-alert-circle</v-icon>
      <div class="flex-1">{{ oversold.message }}</div>
    </div>
    <div class="grid">
      <v-text-field v-model="form.date" type="date" label="Date" />
      <v-select :model-value="form.action" :items="ALL_ACTIONS" label="Action" @update:model-value="setAction">
        <template #item="{ props, item }">
          <v-list-item v-bind="props"><template #append><span class="grp">{{ groupOf(item.raw) }}</span></template></v-list-item>
        </template>
      </v-select>
      <v-combobox
        v-model="form.symbol"
        class="span2"
        :items="tickerItems"
        item-title="symbol"
        item-value="symbol"
        :return-object="false"
        label="Ticker"
        placeholder="Search ticker, name, ISIN"
        :disabled="isCash(form.action)"
        :loading="searching"
        no-filter
        @update:search="onSearch"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props" :title="item.raw.symbol" :subtitle="`${item.raw.name} · ${item.raw.exchange}`" />
        </template>
      </v-combobox>
      <v-text-field v-model="form.shares" type="number" :label="isCash(form.action) ? 'Amount' : 'Shares'" min="0" />
      <v-text-field v-model="form.price" type="number" label="Price" min="0" />
      <v-select v-model="form.currency" :items="['Market', ...CURRENCIES]" label="Currency" />
      <v-text-field v-model="form.commission" type="number" label="Commission" min="0" />
      <v-text-field v-model="form.note" class="span2" label="Note (optional)" />
    </div>
    <div class="hint muted">Currency "Market" uses the instrument's trading currency. Commission is in the transaction currency.</div>
    <div v-if="error" class="err">{{ error }}</div>
    <template #actions>
      <button class="tbtn danger" @click="txn && emit('delete', txn.id)"><v-icon size="18" class="mr-1">mdi-delete</v-icon>Delete</button>
      <v-spacer />
      <button class="tbtn" @click="model = null">Cancel</button>
      <button class="tbtn primary" data-test="save-txn" @click="save">Save</button>
    </template>
  </PDialog>
</template>

<style scoped lang="scss">
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; }
.span2 { grid-column: span 2; }
.grp { font-size: 11px; color: var(--muted); }
.warn { display: flex; align-items: flex-start; gap: 2px; padding: 10px 12px; margin-bottom: 18px; border: 1px solid rgba(244, 183, 64, 0.55); border-radius: 10px; background: rgba(244, 183, 64, 0.08); color: var(--warn); font-size: 13px; line-height: 19px; .v-icon { color: var(--warn); margin-top: 1px; } }
.flex-1 { flex: 1; }
.link { background: none; border: 0; padding: 0; margin-top: 4px; color: var(--primary-text); font-weight: 600; cursor: pointer; font-size: 13px; }
.hint { font-size: 12px; margin-top: 12px; }
.err { color: var(--neg); font-size: 13px; margin-top: 8px; }
@media (max-width: 599px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
</style>
