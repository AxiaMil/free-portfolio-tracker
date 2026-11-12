<script setup lang="ts">
// Portfolio Settings: a card per portfolio + create / rename / switch / delete.
import { computed, reactive, ref, watch } from 'vue';
import { activePortfolio, newPortfolio, refreshMarket, store, toast } from '../../store.ts';
import type { Portfolio } from '../../engine/types.ts';
import PDialog from '../txn/PDialog.vue';
import ConfirmDialog from '../txn/ConfirmDialog.vue';
import { CURRENCIES } from '../txn/fmt.ts';
import PortfolioCard from './PortfolioCard.vue';

const props = defineProps<{ expandActive?: boolean }>();
const portfolios = computed(() => store.state?.portfolios ?? []);
const expanded = reactive<Record<string, boolean>>({});
watch(() => [props.expandActive, activePortfolio.value?.id] as const, ([e, id]) => { if (e && id) expanded[id] = true; }, { immediate: true });

function activate(p: Portfolio) {
  if (!store.state) return;
  store.state.activePortfolioId = p.id;
  refreshMarket(false);
  toast(`Switched to ${p.name}`);
}

// create
const createOpen = ref(false);
const form = reactive({ name: '', currency: 'USD', switchTo: true });
const createErr = ref('');
function openCreate() {
  form.name = `Portfolio ${portfolios.value.length + 1}`;
  form.currency = activePortfolio.value?.currency ?? 'USD';
  form.switchTo = true;
  createErr.value = '';
  createOpen.value = true;
}
function create() {
  if (!store.state) return;
  const name = form.name.trim();
  if (!name) { createErr.value = 'Enter a name'; return; }
  const p = newPortfolio(name, form.currency);
  store.state.portfolios.push(p);
  if (form.switchTo) { store.state.activePortfolioId = p.id; refreshMarket(false); }
  expanded[p.id] = true;
  toast(`${name} created`);
  createOpen.value = false;
}

// rename
const renameFor = ref<Portfolio | null>(null);
const renameVal = ref('');
const renameOpen = computed({ get: () => !!renameFor.value, set: (v: boolean) => { if (!v) renameFor.value = null; } });
function openRename(p: Portfolio) { renameFor.value = p; renameVal.value = p.name; }
function saveRename() {
  const v = renameVal.value.trim();
  if (!v || !renameFor.value) return;
  renameFor.value.name = v;
  renameFor.value = null;
  toast('Portfolio renamed');
}

// delete
const delFor = ref<Portfolio | null>(null);
const delOpen = computed({ get: () => !!delFor.value, set: (v: boolean) => { if (!v) delFor.value = null; } });
function doDelete() {
  const p = delFor.value;
  if (!p || !store.state || store.state.portfolios.length <= 1) return;
  const wasActive = store.state.activePortfolioId === p.id;
  store.state.portfolios = store.state.portfolios.filter((x) => x.id !== p.id);
  if (wasActive) { store.state.activePortfolioId = store.state.portfolios[0].id; refreshMarket(false); }
  toast(`${p.name} deleted`);
  delFor.value = null;
}
</script>

<template>
  <div class="ps">
    <PortfolioCard
      v-for="p in portfolios"
      :key="p.id"
      v-model:expanded="expanded[p.id]"
      :p="p"
      :active="p.id === activePortfolio?.id"
      :can-delete="portfolios.length > 1"
      :show-active="portfolios.length > 1"
      @rename="openRename(p)"
      @delete="delFor = p"
      @activate="activate(p)"
    />
    <button class="create" data-test="create-portfolio" @click="openCreate">+ Create Portfolio</button>

    <PDialog v-model="createOpen" title="Create Portfolio" :max-width="460">
      <div class="grid">
        <v-text-field v-model="form.name" label="Name" autofocus @keydown.enter="create" />
        <v-select v-model="form.currency" :items="CURRENCIES" label="Currency" />
      </div>
      <v-checkbox v-model="form.switchTo" color="primary" density="compact" hide-details label="Switch to the new portfolio" class="mt-2" />
      <div v-if="createErr" class="err">{{ createErr }}</div>
      <template #actions>
        <v-spacer />
        <button class="tbtn" @click="createOpen = false">Cancel</button>
        <button class="tbtn primary" data-test="do-create" @click="create">Create</button>
      </template>
    </PDialog>

    <PDialog v-model="renameOpen" title="Rename portfolio" :max-width="420">
      <v-text-field v-model="renameVal" label="Name" autofocus @keydown.enter="saveRename" />
      <template #actions>
        <v-spacer />
        <button class="tbtn" @click="renameFor = null">Cancel</button>
        <button class="tbtn primary" :disabled="!renameVal.trim()" @click="saveRename">Save</button>
      </template>
    </PDialog>

    <ConfirmDialog v-model="delOpen" :title="`Delete ${delFor?.name}?`" confirm-text="Delete" @confirm="doDelete">
      <p class="mt-0">Its {{ delFor?.transactions.length }} transactions, {{ delFor?.customAssets.length }} custom assets, goal plan and rebalance targets will be removed.</p>
      <p class="mb-0">Earlier versions stay in Settings → Data & Backup → Automatic snapshots.</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped lang="scss">
.ps { display: flex; flex-direction: column; gap: 10px; align-items: stretch; }
.create { align-self: flex-start; height: 28px; margin-top: 11px; padding: 0 13px; border: 1px solid var(--text-2); border-radius: 8px; background: transparent; color: var(--text); font: 600 12.5px/1 var(--font); letter-spacing: 1.2px; cursor: pointer; &:hover { background: var(--hover); } }
.grid { display: grid; grid-template-columns: 1fr 140px; gap: 12px; }
.err { color: var(--neg); font-size: 13px; margin-top: 8px; }
</style>
