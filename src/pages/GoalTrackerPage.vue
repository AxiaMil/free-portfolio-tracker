<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Goal Tracker: progress of the portfolio against a savings plan (daily-compounded return plus
// scheduled contributions), with chart, month grid and an inline plan editor.
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { activePortfolio, result, store, toast } from '../store.ts';
import type { GoalPlan } from '../engine/types.ts';
import { goalAt, planIsValid, simulateGoal } from '../engine/goal.ts';
import { addDays, addMonths } from '../engine/util.ts';
import { ccySymbol, hidden, money, num } from '../format.ts';
import PillToggle from '../components/PillToggle.vue';
import TimeChart, { type TSeries } from '../components/TimeChart.vue';
import GoalPlanForm from '../components/goal/GoalPlanForm.vue';
import GoalTable from '../components/goal/GoalTable.vue';

const { mdAndUp } = useDisplay();
type Period = 'All' | 'This month' | 'This year';
const period = ref<Period>('All');
const editing = ref(false);

const plan = computed<GoalPlan | null>(() => activePortfolio.value?.goal ?? null);
const valid = computed(() => planIsValid(plan.value));
const sim = computed(() => (valid.value ? simulateGoal(plan.value!) : []));
const sym = computed(() => ccySymbol(store.base));
const big = (v: number | null | undefined) => (v == null ? '-' : hidden() ? '••••••' : num(v, 0));

const current = computed(() => result.value?.value ?? 0);
const target = computed(() => {
  const s = sim.value;
  if (!s.length) return null;
  const last = s[s.length - 1];
  if (period.value === 'All') return { date: last.date, value: last.goal };
  const today = store.today;
  const d = period.value === 'This month' ? addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1) : `${today.slice(0, 4)}-12-31`;
  const pt = goalAt(s, d);
  return pt ? { date: pt.date, value: pt.goal } : null;
});
const progress = computed(() => (target.value && target.value.value > 0 ? current.value / target.value.value : 0));
const progressText = computed(() => `${(progress.value * 100).toFixed(1)}%`);
const goalCaption = computed(() => {
  if (!target.value) return period.value === 'All' ? '' : 'Plan not started yet';
  return period.value === 'All' ? `by ${target.value.date}` : `target for ${target.value.date}`;
});

const series = computed<TSeries[]>(() => {
  const r = result.value;
  if (!r) return [];
  const out: TSeries[] = [];
  const s = sim.value;
  if (s.length) {
    const dep: Array<[string, number]> = [];
    let lastDep = NaN;
    for (const p of s) if (p.deposits !== lastDep) { dep.push([p.date, p.deposits]); lastDep = p.deposits; }
    dep.push([s[s.length - 1].date, lastDep]);
    out.push({ name: 'Planned Deposits', data: dep, color: palette.deposits, kind: 'step-area', fill: palette.depositsFill, width: 1, z: 1 });
    out.push({ name: 'Goal', data: s.map((p) => [p.date, p.goal] as [string, number]), color: palette.pos, width: 1.6, z: 2 });
  }
  out.push({ name: 'Portfolio', data: r.series.map((p) => [p.date, p.value] as [string, number]), color: palette.portfolio, width: 2.4, z: 3, gradient: palette.portfolioFill });
  return out;
});
const legend = [
  { n: 'Portfolio', c: palette.portfolio, t: 'line' },
  { n: 'Goal', c: palette.pos, t: 'thin' },
  { n: 'Planned Deposits', c: palette.deposits, t: 'box' },
];

function savePlan(p: GoalPlan) {
  const port = activePortfolio.value;
  if (!port) return;
  port.goal = { ...p };
  editing.value = false;
  toast('Plan saved');
}
</script>

<template>
  <div class="page goal-page">
    <template v-if="result">
      <!-- ---------- plan editor ---------- -->
      <GoalPlanForm v-if="editing" :plan="plan" @save="savePlan" @cancel="editing = false" />

      <!-- ---------- empty state ---------- -->
      <div v-else-if="!valid" class="card empty">
        <v-icon size="44" class="flag">mdi-flag-checkered</v-icon>
        <h2 class="e-title">Set a goal for your portfolio</h2>
        <p class="e-text">Pick a starting point, an expected annual return and how much you plan to add. You will see the target path next to your real portfolio, month by month.</p>
        <button class="save-btn" @click="editing = true">Create your plan</button>
      </div>

      <!-- ---------- headline ---------- -->
      <template v-else>
        <div class="bar">
          <PillToggle v-model="period" :options="['All', 'This month', 'This year'] as const" />
          <button class="outline-btn sm edit" @click="editing = true">Edit Plan</button>
        </div>
        <div class="kpis">
          <div class="kpi cur">
            <div class="kl">Current Value</div>
            <div class="kv"><span class="ccy">{{ sym }}</span>{{ big(current) }}</div>
          </div>
          <div class="kpi prog">
            <div class="kl">Progress</div>
            <v-tooltip :text="`${money(current)} of ${target ? money(target.value) : '-'}`" location="top">
              <template #activator="{ props: a }">
                <div v-bind="a" class="pbar" role="progressbar" :aria-valuenow="Math.round(progress * 1000) / 10" aria-valuemin="0" aria-valuemax="100">
                  <div class="fill" :style="{ width: Math.min(100, Math.max(0, progress * 100)) + '%' }" />
                  <span class="ptxt">{{ target ? progressText : '-' }}</span>
                </div>
              </template>
            </v-tooltip>
            <div class="towards">{{ mdAndUp ? 'Towards Your Dream Goal' : 'towards your Dream Goal' }}</div>
          </div>
          <div class="kpi goal">
            <div class="kl">My Goal</div>
            <div class="kv"><span class="ccy">{{ sym }}</span>{{ big(target?.value) }}</div>
            <div class="kc">{{ goalCaption }}</div>
          </div>
        </div>
      </template>

      <!-- ---------- chart + grid ---------- -->
      <template v-if="valid">
        <div class="chart-wrap" :class="{ editing }">
          <TimeChart :series="series" :height="mdAndUp ? 456 : 211" :y-min="0" :show-range="false" :legend-below="!mdAndUp" :value-formatter="(v: number) => money(v)">
            <template #legend>
              <div class="legend" :class="{ below: !mdAndUp }">
                <span v-for="l in legend" :key="l.n" class="li"><i :class="l.t" :style="{ background: l.c }" />{{ l.n }}</span>
              </div>
            </template>
          </TimeChart>
        </div>
        <div class="table-wrap"><GoalTable :plan="plan!" :sim="sim" /></div>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 15px; }
.edit { height: 28px; font-size: 13px; letter-spacing: 1px; padding: 0 12px; border-radius: 8px; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 28px; text-align: center; }
.kl { font-size: 14px; line-height: 21px; color: var(--text); }
.kv { font-size: 24px; line-height: 36px; font-weight: 500; color: var(--text); margin-top: 3px; white-space: nowrap; }
.kv .ccy { margin-right: 7px; }
.kpi { position: relative; }
.kc { position: absolute; left: 0; right: 0; top: 62px; font-size: 12px; color: var(--muted); }
.prog { display: flex; flex-direction: column; align-items: center; }
.pbar { position: relative; width: 180px; height: 20px; border-radius: 3px; background: var(--border-strong); overflow: hidden; margin-top: 6px; cursor: default; }
.fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--pos); border-radius: 3px 0 0 3px; }
.ptxt { position: relative; z-index: 1; display: block; text-align: left; padding-left: 10px; font-size: 13px; line-height: 20px; color: var(--text); }
.towards { font-size: 16px; line-height: 24px; margin-top: 10px; color: var(--text); }
.chart-wrap { margin-top: 44px; :deep(.tc) { position: relative; } }
.chart-wrap.editing { margin-top: 26px; }
.legend { position: absolute; top: 0; right: 0; height: 26px; display: flex; align-items: center; gap: 14px; font-size: 13px; color: var(--text); }
.legend.below { position: static; height: auto; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 12px; }
.li { display: inline-flex; align-items: center; gap: 6px; }
.li i { display: inline-block; width: 14px; height: 2.5px; border-radius: 2px; }
.li i.thin { height: 1.5px; }
.li i.box { height: 5px; border-radius: 1px; }
.table-wrap { margin-top: 14px; }
.empty { margin-top: 40px; padding: 48px 24px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.flag { color: var(--primary-text); }
.e-title { font-size: 20px; font-weight: 600; margin: 14px 0 6px; }
.e-text { color: var(--text-2); max-width: 520px; font-size: 14px; line-height: 21px; margin-bottom: 20px; }
.save-btn { background: var(--primary); color: var(--primary-fg); border: 0; border-radius: 10px; height: 36px; padding: 0 18px; font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; }
@media (max-width: 959px) {
  .bar { margin-top: 22px; }
  .kpis { grid-template-columns: 1fr 1fr; margin-top: 39px; row-gap: 0; }
  .kv { margin-top: -1px; }
  .kc { top: 54px; }
  .cur { grid-column: 1; grid-row: 1; }
  .goal { grid-column: 2; grid-row: 1; }
  .prog { grid-column: 1 / span 2; grid-row: 2; margin-top: 40px; }
  .pbar { width: 200px; margin-top: 1px; }
  .chart-wrap { margin-top: 38px; }
  .legend.below { margin-top: 7px; gap: 0; line-height: 19px; }
  .table-wrap { margin-top: 30px; }
}
</style>
