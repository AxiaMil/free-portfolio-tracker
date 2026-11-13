<script setup lang="ts">
// "Payment date" for one automatic dividend: where its date comes from, and a date you can type when the company's
// isn't published here (or to correct it). A typed date wins over any connector's and is saved with the portfolio.
import { computed, ref, watch } from 'vue';
import { activePortfolio } from '../../store.ts';
import type { DivEvent } from '../../engine/dividends.ts';
import { money } from '../../format.ts';
import PDialog from '../txn/PDialog.vue';
import { sourceName } from './payoutSources.ts';

const props = defineProps<{ event: DivEvent | null }>();
const model = defineModel<boolean>({ default: false });

const key = computed(() => (props.event ? `${props.event.symbol}|${props.event.exDate}` : ''));
const typed = computed(() => (key.value ? activePortfolio.value?.payDates?.[key.value] ?? null : null));
const date = ref('');
watch(() => [model.value, props.event] as const, ([open]) => { if (open) date.value = typed.value ?? (props.event?.payKnown ? props.event.payDate : ''); });

const valid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(date.value) && !!props.event && date.value >= props.event.exDate);
const from = computed(() => {
  const e = props.event;
  if (!e) return '';
  if (typed.value) return 'You typed this date.';
  if (e.payKnown) return `Published by the company, from ${sourceName(e.paySource)}.`;
  return 'The company’s payment date isn’t published here yet. Until it is, this dividend counts in your value as “to be paid”, and not in your cash.';
});

function save() {
  const p = activePortfolio.value;
  if (!p || !valid.value) return;
  p.payDates = { ...(p.payDates ?? {}), [key.value]: date.value };
  model.value = false;
}
function clear() {
  const p = activePortfolio.value;
  if (!p?.payDates) return;
  const next = { ...p.payDates };
  delete next[key.value];
  p.payDates = next;
  model.value = false;
}
</script>

<template>
  <PDialog v-model="model" :title="event ? `${event.symbol} payment date` : 'Payment date'" :max-width="460">
    <div v-if="event" class="pdd">
      <div class="facts">
        <div><span>Ex-dividend date</span><b>{{ event.exDate }}</b></div>
        <div><span>Amount</span><b>{{ money(event.amountBase) }}</b></div>
      </div>
      <p class="from">{{ from }}</p>
      <v-text-field v-model="date" type="date" label="Payment date" :min="event.exDate" hide-details="auto"
        :error-messages="date && !valid ? 'On or after the ex-dividend date' : ''" data-test="pay-date" />
      <p class="note">Your cash goes up by this dividend on its payment date.</p>
    </div>
    <template #actions>
      <button v-if="typed" class="tbtn danger" @click="clear">Remove my date</button>
      <v-spacer />
      <button class="tbtn" @click="model = false">Cancel</button>
      <button class="tbtn primary" :disabled="!valid" data-test="save-pay-date" @click="save">Save</button>
    </template>
  </PDialog>
</template>

<style scoped lang="scss">
.pdd { display: flex; flex-direction: column; gap: 14px; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; div { display: flex; flex-direction: column; gap: 2px; } span { font-size: 12.5px; color: var(--text-2); } b { font-weight: 600; } }
.from { margin: 0; color: var(--text-2); }
.note { margin: 0; font-size: 12.5px; color: var(--muted); }
</style>
