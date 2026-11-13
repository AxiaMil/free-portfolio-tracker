<script setup lang="ts">
// Lists the engine's transaction warnings (a trade price outside the day's low-high range, or a sale of more shares
// than were held) with a jump to edit.
import { computed } from 'vue';
import { activePortfolio, result } from '../../store.ts';
import { fmtPrice, fmtShares } from './fmt.ts';
import PDialog from './PDialog.vue';

const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'edit', id: string): void }>();

const items = computed(() => {
  const txns = new Map((activePortfolio.value?.transactions ?? []).map((t) => [t.id, t]));
  return (result.value?.warnings ?? [])
    .map((w) => ({ ...w, txn: txns.get(w.id) }))
    .sort((a, b) => b.date.localeCompare(a.date));
});
</script>

<template>
  <PDialog v-model="model" :title="`${items.length} warning${items.length === 1 ? '' : 's'}`" :max-width="680" fullscreen-mobile>
    <p class="intro">These transactions are counted, but something in them doesn't match the market data: a trading price outside the day's low and high range, or a sale of more shares than you held. Check for a typo, a wrong date, a price from before a stock split, or a missing buy.</p>
    <div v-for="w in items" :key="w.id + w.kind" class="w-row">
      <v-icon size="20" class="w-ic">mdi-alert-circle</v-icon>
      <div class="w-main">
        <div class="w-title"><b>{{ w.txn?.action ?? 'Trade' }} {{ w.symbol }}</b><span class="w-date">{{ w.date }}</span></div>
        <div v-if="w.kind === 'oversold'" class="w-sub">{{ w.txn?.action === 'Transfer out' ? 'Transferred out' : 'Sold' }} <b>{{ fmtShares(w.txn?.shares) }}</b> shares · held {{ fmtShares(w.low) }} then</div>
        <div v-else class="w-sub">Your price <b>{{ fmtPrice(w.txn?.price) }}</b> · day range {{ fmtPrice(w.low) }} – {{ fmtPrice(w.high) }}</div>
      </div>
      <button class="outline-btn sm" @click="emit('edit', w.id)"><v-icon size="16">mdi-pencil</v-icon>Edit</button>
    </div>
    <div v-if="!items.length" class="muted">No warnings. All trade prices are within their day's range, and no sale is of more shares than you held.</div>
    <template #actions><v-spacer /><button class="tbtn primary" @click="model = false">Done</button></template>
  </PDialog>
</template>

<style scoped lang="scss">
.intro { margin: 0 0 12px; color: var(--text-2); font-size: 13px; }
.w-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); &:last-of-type { border-bottom: 0; } }
.w-ic { color: var(--warn); }
.w-main { flex: 1; min-width: 0; }
.w-title { font-size: 15px; color: var(--text); b { font-weight: 600; } }
.w-date { margin-left: 8px; font-size: 13px; color: var(--text-2); }
.w-sub { font-size: 12.5px; color: var(--text-2); margin-top: 2px; b { color: var(--text); font-weight: 500; } }
</style>
