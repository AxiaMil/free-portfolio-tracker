<script setup lang="ts">
// Goal vs actual grid: one row per year, Jan..Dec columns, each cell = plan (top) / portfolio (bottom).
import { computed, ref } from 'vue';
import { result } from '../../store.ts';
import type { GoalPlan } from '../../engine/types.ts';
import { goalMonthly, type GoalMetric, type GoalPoint } from '../../engine/goal.ts';
import { money, pct } from '../../format.ts';
import PillToggle from '../PillToggle.vue';
import HelpTip from '../HelpTip.vue';
import ShareButton from '../ShareButton.vue';

const props = defineProps<{ plan: GoalPlan; sim: GoalPoint[] }>();
const METRICS = ['Value', 'Contribution', 'Gross Contribution', 'Return', 'Cum. Return'] as const;
const metric = ref<GoalMetric>('Value');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HELP = 'Top: your plan. Bottom: your portfolio. Value = month-end value. Contribution = money added in the month (plan: scheduled contribution; portfolio: net deposits). Gross Contribution = starting value plus everything added since the plan started. Return = investment return in the month (portfolio: time-weighted). Cum. Return = investment return since the plan started.';

const grid = computed(() => {
  const r = result.value;
  if (!r) return { years: [] as number[], cells: new Map() };
  return goalMonthly(props.plan, props.sim, r.series, r.today);
});
const isPct = computed(() => metric.value === 'Return' || metric.value === 'Cum. Return');
const fmt = (v: number | undefined | null) => (v == null ? '' : isPct.value ? pct(v) : money(v, { decimals: 0 }));

function cell(y: number, mi: number) {
  const c = grid.value.cells.get(`${y}-${String(mi + 1).padStart(2, '0')}`);
  if (!c) return null;
  const g = c.goal ? c.goal[metric.value] : null;
  const a = c.actual ? c.actual[metric.value] ?? null : null;
  let cls = '';
  if (g != null && a != null && metric.value !== 'Contribution') cls = a >= g - 1e-9 ? 'ahead' : 'behind';
  return { g, a, cls };
}

function csv() {
  const rows: Array<Array<string | number>> = [['Year', 'Row', ...MONTHS]];
  for (const y of grid.value.years) {
    rows.push([y, `Goal ${metric.value}`, ...MONTHS.map((_, i) => { const c = cell(y, i); return c?.g != null ? c.g.toFixed(isPct.value ? 6 : 2) : ''; })]);
    rows.push([y, `Actual ${metric.value}`, ...MONTHS.map((_, i) => { const c = cell(y, i); return c?.a != null ? c.a.toFixed(isPct.value ? 6 : 2) : ''; })]);
  }
  return rows;
}
</script>

<template>
  <div class="gt">
    <div class="ctl">
      <div class="d-flex align-center ga-2 tg"><PillToggle v-model="metric" :options="METRICS" /><HelpTip :text="HELP" /></div>
      <div class="d-flex align-center ga-4">
        <div class="legend"><span class="li"><i class="g" />Goal</span><span class="li"><i class="a" />Actual</span></div>
        <ShareButton icon :csv="csv" filename="goal-tracker" />
      </div>
    </div>
    <div class="card tcard">
      <div class="scroll">
        <table class="p-table">
          <thead>
            <tr><th class="yr">Year</th><th v-for="m in MONTHS" :key="m" class="num">{{ m }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="y in grid.years" :key="y">
              <td class="yr">{{ y }}</td>
              <td v-for="(m, i) in MONTHS" :key="m" class="num">
                <template v-if="cell(y, i)">
                  <div class="gv">{{ fmt(cell(y, i)!.g) }}</div>
                  <div class="av" :class="cell(y, i)!.cls">{{ fmt(cell(y, i)!.a) }}</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ctl { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.tg { min-width: 0; max-width: 100%; }
.legend { display: flex; gap: 14px; font-size: 13px; color: var(--text); }
.li { display: inline-flex; align-items: center; gap: 6px; }
.li i { width: 14px; height: 2.5px; border-radius: 2px; display: inline-block; }
.li i.g { background: var(--pos); }
.li i.a { background: var(--text); }
.tcard { margin-top: 16px; overflow: hidden; }
.scroll { overflow-x: auto; }
.p-table th.num, .p-table td.num { text-align: right; padding-right: 10px; }
.p-table td { height: 52px; vertical-align: middle; }
.p-table th { color: var(--text); font-size: 12px; }
.yr { position: sticky; left: 0; background: var(--bg); z-index: 1; padding-left: 16px !important; font-weight: 500; min-width: 64px; }
.num { min-width: 82px; }
.gv { color: var(--pos); font-size: 12.5px; line-height: 18px; min-height: 18px; }
.av { color: var(--text); font-size: 12.5px; line-height: 18px; min-height: 18px; }
.av.ahead { color: var(--pos); }
.av.behind { color: var(--neg); }
@media (max-width: 959px) {
  .ctl { flex-direction: column; align-items: stretch; }
  .ctl > div:last-child { justify-content: space-between; }
  .num { min-width: 78px; }
}
</style>
