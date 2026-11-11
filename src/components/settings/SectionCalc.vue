<script setup lang="ts">
// Calculation Methods: cost basis for realised gains (FIFO or Average).
import { computed } from 'vue';
import { store, result } from '../../store.ts';
import { money, signClass } from '../../format.ts';

const METHODS = [
  { key: 'FIFO' as const, title: 'FIFO (First In, First Out)', desc: 'A sale closes your oldest lots first. Realized gain = sale proceeds minus the cost of those oldest shares.' },
  { key: 'Average' as const, title: 'Average cost', desc: 'Every sale uses the average cost of all shares you hold at that moment, spread across your open lots.' },
];
const method = computed(() => store.state?.preferences.costMethod ?? 'FIFO');
function set(k: 'FIFO' | 'Average') {
  if (store.state) store.state.preferences.costMethod = k;
}
const realized = computed(() => result.value?.pnl.realized ?? 0);
</script>

<template>
  <div class="sec">
    <div class="sec-h">Cost basis method</div>
    <div class="opts">
      <button v-for="m in METHODS" :key="m.key" class="opt" :class="{ on: method === m.key }" :aria-pressed="method === m.key" @click="set(m.key)">
        <v-icon size="20" class="radio">{{ method === m.key ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}</v-icon>
        <span><span class="o-t">{{ m.title }}</span><span class="o-d">{{ m.desc }}</span></span>
      </button>
    </div>
    <div class="note">
      Realized gain with {{ method === 'FIFO' ? 'FIFO' : 'average cost' }}: <b :class="signClass(realized)">{{ money(realized, { sign: true }) }}</b>.
      The method changes realized vs. unrealized gains and the Trade Analysis lots; total return is the same either way.
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.opts { display: flex; flex-direction: column; gap: 8px; }
.opt { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: transparent; color: var(--text); text-align: left; cursor: pointer; font-family: var(--font); &:hover { background: var(--hover); } &.on { border-color: var(--primary); background: var(--primary-soft); .radio { color: var(--primary); } } }
.radio { color: var(--muted); margin-top: 1px; }
.o-t { display: block; font-size: 15px; font-weight: 500; }
.o-d { display: block; font-size: 13px; line-height: 19px; color: var(--text-2); margin-top: 3px; }
.note { margin-top: 14px; font-size: 13px; line-height: 19px; color: var(--text-2); b { font-weight: 600; } }
</style>
