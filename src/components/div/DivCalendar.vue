<script setup lang="ts">
// Month calendar of dividend payouts: an amount chip on each pay date, today circled.
// Chips matching the selected mode (upcoming / received) are green, the others grey.
import { computed, ref, watch } from 'vue';
import type { DivEvent } from '../../engine/dividends.ts';
import { addDays, addMonths, toDate } from '../../engine/util.ts';
import { money } from '../../format.ts';

const props = defineProps<{ events: DivEvent[]; today: string; mode: 'Upcoming' | 'Historical' }>();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const cursor = ref(`${props.today.slice(0, 7)}-01`);
watch(() => props.today, (t, old) => { if (old && cursor.value === `${old.slice(0, 7)}-01`) cursor.value = `${t.slice(0, 7)}-01`; });

const title = computed(() => `${MONTHS[Number(cursor.value.slice(5, 7)) - 1]} ${cursor.value.slice(0, 4)}`);
const shift = (n: number) => { cursor.value = addMonths(cursor.value, n); };

const byDay = computed(() => {
  const map = new Map<string, DivEvent[]>();
  for (const e of props.events) {
    const list = map.get(e.payDate) ?? [];
    list.push(e);
    map.set(e.payDate, list);
  }
  return map;
});

const fmt = (v: number) => money(v, { decimals: Math.abs(v) >= 100 ? 0 : 2 });

const cells = computed(() => {
  const first = cursor.value;
  const start = addDays(first, -toDate(first).getUTCDay());
  const monthEnd = addDays(addMonths(first, 1), -1);
  const weeks = Math.ceil((toDate(monthEnd).getTime() - toDate(start).getTime()) / 86400000 / 7 + 1 / 7);
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const inMonth = d.slice(0, 7) === first.slice(0, 7);
    const evs = inMonth ? byDay.value.get(d) ?? [] : [];
    const amount = evs.reduce((s, e) => s + e.amountBase, 0);
    const upcoming = evs.some((e) => e.upcoming);
    out.push({ d, day: Number(d.slice(8, 10)), inMonth, isToday: d === props.today, evs, amount, hl: evs.length > 0 && (props.mode === 'Upcoming' ? upcoming : !upcoming) });
  }
  return out;
});
</script>

<template>
  <div class="cal">
    <div class="cal-head">
      <button class="nav" aria-label="Previous month" @click="shift(-1)"><v-icon size="26">mdi-chevron-left</v-icon></button>
      <div class="title">{{ title }}</div>
      <button class="nav" aria-label="Next month" @click="shift(1)"><v-icon size="26">mdi-chevron-right</v-icon></button>
    </div>
    <div class="grid">
      <div v-for="d in DOW" :key="d" class="dow">{{ d }}</div>
      <div v-for="c in cells" :key="c.d" class="cell" :class="{ out: !c.inMonth }">
        <span class="num" :class="{ today: c.isToday }">{{ c.day }}</span>
        <v-tooltip v-if="c.evs.length" location="top">
          <template #activator="{ props: a }">
            <span v-bind="a" class="chip" :class="{ hl: c.hl }">{{ fmt(c.amount) }}</span>
          </template>
          <div class="tip">
            <div class="tip-d">{{ c.d }}</div>
            <div v-for="e in c.evs" :key="e.key" class="tip-r"><span>{{ e.symbol }} <span class="tip-s">{{ e.label }}</span></span><b>{{ money(e.amountBase) }}</b></div>
          </div>
        </v-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cal { width: 100%; }
.cal-head { display: flex; align-items: center; justify-content: space-between; height: 40px; margin-bottom: 8px; padding: 0 4px; }
.title { font-size: 16px; font-weight: 500; color: var(--text); letter-spacing: 0.15px; }
.nav { background: none; border: 0; color: var(--text-2); width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; &:hover { background: var(--line-soft); color: var(--text); } }
.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; background: var(--bg); border: 1px solid var(--surface-2); padding-bottom: 22px; background-clip: padding-box; position: relative; }
.grid::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 22px; background: var(--surface-2); }
.dow { background: var(--surface-2); height: 28px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--text-2); }
.cell { background: var(--surface-2); height: 66px; display: flex; flex-direction: column; align-items: center; padding: 6px 3px 0; min-width: 0; }
.num { font-size: 12.5px; color: var(--text); width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; }
.num.today { background: var(--primary); color: var(--primary-fg); }
.cell.out .num { color: var(--text-2); opacity: 0.85; }
.chip { margin-top: 6px; max-width: 100%; padding: 2px 6px; border-radius: 4px; font-size: 12px; line-height: 16px; color: var(--text); background: var(--surface-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
.chip.hl { background: var(--pos); color: var(--text); }
.tip { min-width: 160px; }
.tip-d { color: var(--muted); margin-bottom: 4px; }
.tip-r { display: flex; justify-content: space-between; gap: 16px; }
.tip-s { color: var(--muted); font-size: 11px; }
@media (max-width: 959px) {
  .cal-head { padding: 0; }
  .chip { padding: 2px 4px; font-size: 11.5px; }
}
</style>
