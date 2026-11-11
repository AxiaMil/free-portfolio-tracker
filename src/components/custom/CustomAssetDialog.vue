<script setup lang="ts">
// Create or edit a custom asset: name, ticker, currency (+ first price when creating), type, sector, country.
import { computed, reactive, ref, watch } from 'vue';
import { activePortfolio, store, toast } from '../../store.ts';
import type { CustomAsset } from '../../engine/types.ts';
import PDialog from '../txn/PDialog.vue';
import { CURRENCIES } from '../txn/fmt.ts';
import { ASSET_TYPES, COUNTRIES, SECTORS, cleanTicker, renameSymbol, upsertPrice } from './options.ts';

const props = defineProps<{ asset?: CustomAsset | null }>();
const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'saved', symbol: string, created: boolean): void }>();

const form = reactive({ name: '', symbol: '', currency: 'USD', price: '', date: '', assetType: 'Others', sector: '', country: '' });
const error = ref('');
const editing = computed(() => !!props.asset);

watch(model, (open) => {
  if (!open) return;
  const a = props.asset;
  form.name = a?.name ?? '';
  form.symbol = a?.symbol ?? '';
  form.currency = a?.currency ?? activePortfolio.value?.currency ?? 'USD';
  form.price = '';
  form.date = store.today;
  form.assetType = a?.assetType || 'Others';
  form.sector = a?.sector ?? '';
  form.country = a?.country ?? '';
  error.value = '';
}, { immediate: true });

const ticker = computed(() => cleanTicker(form.symbol));
const usedBy = computed(() => (activePortfolio.value?.transactions ?? []).filter((t) => t.symbol.toUpperCase() === ticker.value).length);

function validate(): string | null {
  const p = activePortfolio.value;
  if (!p) return 'No portfolio';
  if (!form.name.trim()) return 'Name is required';
  if (!ticker.value) return 'Ticker is required';
  if (ticker.value === 'CASH') return '"CASH" is reserved for cash transactions';
  if (!/^[A-Z0-9][A-Z0-9._\-^=]*$/.test(ticker.value)) return 'Use letters, digits, ".", "-" or "_" for the ticker';
  if (p.customAssets.some((c) => c.symbol === ticker.value && c !== props.asset)) return `A custom asset ${ticker.value} already exists`;
  if (!editing.value) {
    if (form.price === '' || !(Number(form.price) > 0)) return 'Enter the current price (greater than 0)';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return 'Enter a valid price date';
  }
  return null;
}

function save() {
  const p = activePortfolio.value;
  const e = validate();
  if (e || !p) { error.value = e ?? ''; return; }
  const sym = ticker.value;
  const meta = { name: form.name.trim(), currency: form.currency, assetType: form.assetType || undefined, sector: form.sector?.trim() || undefined, country: form.country?.trim() || undefined };
  if (props.asset) {
    const a = props.asset;
    const old = a.symbol;
    Object.assign(a, meta);
    if (old !== sym) { renameSymbol(p, old, sym); a.symbol = sym; }
    toast(`${sym} updated`);
    emit('saved', sym, false);
  } else {
    const a: CustomAsset = { symbol: sym, ...meta, prices: [] };
    upsertPrice(a, form.date, Number(form.price));
    p.customAssets.push(a);
    toast(`${sym} added`);
    emit('saved', sym, true);
  }
  model.value = false;
}
</script>

<template>
  <PDialog v-model="model" :step="editing ? 'Custom asset' : 'Step 1 of 3'" :title="editing ? `Edit ${asset?.symbol}` : 'Add Custom Asset'" :max-width="600" fullscreen-mobile>
    <div class="grid">
      <v-text-field v-model="form.name" class="span2" label="Name" placeholder="e.g. My HDB flat, Private fund A, Gold bar" autofocus />
      <v-text-field v-model="form.symbol" label="Ticker" placeholder="e.g. HOME" :hint="ticker && ticker !== form.symbol ? `Saved as ${ticker}` : ''" persistent-hint />
      <v-select v-model="form.currency" :items="CURRENCIES" label="Currency" />
      <template v-if="!editing">
        <v-text-field v-model="form.price" type="number" min="0" label="Current price" :prefix="form.currency" />
        <v-text-field v-model="form.date" type="date" label="Price date" />
      </template>
      <v-select v-model="form.assetType" :items="ASSET_TYPES" label="Assets type" />
      <v-combobox v-model="form.sector" :items="SECTORS" label="Sector (optional)" />
      <v-combobox v-model="form.country" class="span2" :items="COUNTRIES" label="Country (optional)" />
    </div>
    <div v-if="usedBy && (!editing || ticker !== asset?.symbol)" class="note">
      <v-icon size="16" class="mr-1">mdi-information-outline</v-icon>{{ usedBy }} existing transaction{{ usedBy > 1 ? 's use' : ' uses' }} the ticker {{ ticker }} and will be valued with this asset's prices.
    </div>
    <div v-if="editing && ticker !== asset?.symbol && !usedBy" class="note">
      <v-icon size="16" class="mr-1">mdi-information-outline</v-icon>Transactions for {{ asset?.symbol }} will be renamed to {{ ticker }}.
    </div>
    <div v-if="error" class="err">{{ error }}</div>
    <template #actions>
      <v-spacer />
      <button class="tbtn" @click="model = false">Cancel</button>
      <button class="tbtn primary" data-test="save-asset" @click="save">{{ editing ? 'Save' : 'Add Asset' }}</button>
    </template>
  </PDialog>
</template>

<style scoped lang="scss">
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 12px; }
.span2 { grid-column: span 2; }
.note { margin-top: 14px; font-size: 13px; color: var(--text-2); }
.err { color: var(--neg); font-size: 13px; margin-top: 10px; }
@media (max-width: 599px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
</style>
