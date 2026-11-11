<script setup lang="ts">
// Inline "Create your plan" editor: start date / value shortcuts, horizon, expected return,
// contributions with growth, and a Calculate button for the end value.
import { computed, reactive, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { result, store, toast } from '../../store.ts';
import type { GoalPlan } from '../../engine/types.ts';
import { DEFAULT_PLAN, goalEndValue, planIsValid } from '../../engine/goal.ts';
import { ccySymbol, money } from '../../format.ts';

const props = defineProps<{ plan: GoalPlan | null }>();
const emit = defineEmits<{ (e: 'save', p: GoalPlan): void; (e: 'cancel'): void }>();
const { mdAndUp } = useDisplay();

const day1 = computed(() => {
  const s = result.value?.series;
  return s?.length ? { date: s[0].date, value: s[0].value } : null;
});
const now = computed(() => ({ date: store.today, value: result.value?.value ?? 0 }));
const sym = computed(() => ccySymbol(store.base).trim());

const init = props.plan ?? DEFAULT_PLAN(store.today, now.value.value);
const d = reactive({
  startDate: init.startDate,
  years: String(init.years),
  startValue: String(init.startValue),
  annualReturn: String(init.annualReturn),
  contribution: String(init.contribution),
  contributionFreq: init.contributionFreq,
  growthRate: String(init.growthRate),
  growthFreq: init.growthFreq,
});
const dateMenu = ref(false);
const endValue = ref<number | null>(planIsValid(init) ? goalEndValue(init) : null);
const dirty = ref(false);
const touch = () => { dirty.value = true; };

const toLocalDate = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return y ? new Date(y, (m || 1) - 1, dd || 1) : new Date(); };
const fromLocalDate = (v: unknown) => { const x = v instanceof Date ? v : new Date(String(v)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
function pickDate(v: unknown) { d.startDate = fromLocalDate(v); dateMenu.value = false; touch(); }

function setDate(which: 'day1' | 'today') {
  const p = which === 'day1' ? day1.value : now.value;
  if (p) { d.startDate = p.date; touch(); }
}
function setValue(which: 'day1' | 'today') {
  const p = which === 'day1' ? day1.value : now.value;
  if (p) { d.startValue = String(Math.round(p.value * 10000) / 10000); touch(); }
}

function toPlan(): { plan: GoalPlan | null; error: string } {
  const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const plan: GoalPlan = {
    startDate: d.startDate.trim(),
    years: n(d.years),
    startValue: n(d.startValue),
    annualReturn: n(d.annualReturn),
    contribution: d.contribution.trim() === '' ? 0 : n(d.contribution),
    contributionFreq: d.contributionFreq,
    growthRate: d.growthRate.trim() === '' ? 0 : n(d.growthRate),
    growthFreq: d.growthFreq,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) || isNaN(Date.parse(plan.startDate))) return { plan: null, error: 'Enter the starting date as YYYY-MM-DD' };
  if (!(plan.years > 0 && plan.years <= 50)) return { plan: null, error: 'Time horizon must be between 1 month and 50 years' };
  if (!isFinite(plan.startValue) || plan.startValue < 0) return { plan: null, error: 'Enter a starting value' };
  if (!isFinite(plan.annualReturn) || plan.annualReturn <= -100 || plan.annualReturn > 1000) return { plan: null, error: 'Enter an expected annual return in %' };
  if (!isFinite(plan.contribution)) return { plan: null, error: 'Enter a valid contribution' };
  if (!isFinite(plan.growthRate) || plan.growthRate <= -100) return { plan: null, error: 'Enter a valid contribution growth rate' };
  return { plan: planIsValid(plan) ? plan : null, error: planIsValid(plan) ? '' : 'Please check the plan values' };
}

function calculate() {
  const { plan, error } = toPlan();
  if (!plan) return toast(error, 'error');
  endValue.value = goalEndValue(plan);
  dirty.value = false;
}
function save() {
  const { plan, error } = toPlan();
  if (!plan) return toast(error, 'error');
  emit('save', plan);
}
const FREQS = ['Monthly', 'Quarterly', 'Annually'];
</script>

<template>
  <div class="gform">
    <div class="head">
      <h1 class="ttl">Create your plan</h1>
      <div class="btns">
        <button class="outline-btn" @click="emit('cancel')">Cancel</button>
        <button class="save-btn" @click="save">Save Plan</button>
      </div>
    </div>

    <div class="row">
      <div class="lab">Starting Date:</div>
      <div class="fld">
        <v-menu v-model="dateMenu" :close-on-content-click="false" location="bottom start">
          <template #activator="{ props: a }">
            <v-text-field v-model="d.startDate" v-bind="a" label="Date" placeholder="YYYY-MM-DD" variant="outlined" density="compact" hide-details class="f-w" @update:model-value="touch" />
          </template>
          <v-date-picker :model-value="toLocalDate(d.startDate)" show-adjacent-months color="primary" @update:model-value="pickDate" />
        </v-menu>
        <div class="quick">
          <button :disabled="!day1" @click="setDate('day1')">Portfolio Day 1</button>
          <button @click="setDate('today')">Today</button>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="lab">Time Horizon:</div>
      <div class="fld"><v-text-field v-model="d.years" label="Years" type="number" min="1" variant="outlined" density="compact" hide-details class="f-s" @update:model-value="touch" /></div>
    </div>

    <div class="row">
      <div class="lab">Starting Value:</div>
      <div class="fld">
        <v-text-field v-model="d.startValue" label="Value" :prefix="sym" type="number" variant="outlined" density="compact" hide-details class="f-w" @update:model-value="touch" />
        <div class="quick">
          <button :disabled="!day1" @click="setValue('day1')">Portfolio Day 1</button>
          <button @click="setValue('today')">Today</button>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="lab">Expected Annual Return:</div>
      <div class="fld"><v-text-field v-model="d.annualReturn" label="Return" suffix="%" type="number" variant="outlined" density="compact" hide-details class="f-w" @update:model-value="touch" /></div>
    </div>

    <div class="sep" />

    <div class="row tight">
      <div class="lab">Additional Contribution:</div>
      <div class="fld inline">
        <v-text-field v-model="d.contribution" label="Value" :prefix="sym" type="number" variant="outlined" density="compact" hide-details class="f-w" @update:model-value="touch" />
        <v-select v-model="d.contributionFreq" :items="FREQS" label="Frequency" variant="outlined" density="compact" hide-details menu-icon="mdi-menu-down" class="f-w" @update:model-value="touch" />
      </div>
    </div>
    <div class="row tight">
      <div class="lab">Contribution Growth:</div>
      <div class="fld inline">
        <v-text-field v-model="d.growthRate" label="Growth rate" suffix="%" type="number" variant="outlined" density="compact" hide-details class="f-w" @update:model-value="touch" />
        <v-select v-model="d.growthFreq" :items="['Year over Year']" label="Frequency" variant="outlined" density="compact" hide-details menu-icon="mdi-menu-down" class="f-l" />
      </div>
    </div>

    <div class="sep" />

    <div class="row end">
      <div class="lab">End Value:</div>
      <div class="fld">
        <div class="endv" :class="{ stale: dirty }">{{ endValue != null ? money(endValue, { decimals: 0 }).replace(/^(\D+)/, '$1 ') : '-' }}</div>
        <div v-if="dirty" class="hint">Values changed. Press Calculate to update.</div>
        <button class="outline-btn calc" @click="calculate">Calculate</button>
      </div>
    </div>
    <p v-if="!mdAndUp" class="note">Contributions are added on the 1st of each {{ d.contributionFreq === 'Monthly' ? 'month' : d.contributionFreq === 'Quarterly' ? 'quarter' : 'year' }} and the return compounds daily.</p>
  </div>
</template>

<style scoped lang="scss">
.gform { padding-top: 6px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.ttl { font-size: 24px; font-weight: 600; line-height: 32px; margin: 0; color: var(--text); letter-spacing: 0.2px; }
.btns { display: flex; gap: 8px; }
.save-btn { background: var(--primary); color: var(--primary-fg); border: 0; border-radius: 10px; height: 36px; padding: 0 18px; white-space: nowrap; font: 600 14px/1 var(--font); letter-spacing: 1.25px; cursor: pointer; &:hover { filter: brightness(1.08); } }
.row { display: grid; grid-template-columns: 362px 1fr; align-items: start; padding: 10px 8px 12px; }
.row.tight { padding: 10px 8px 2px; }
.lab { font-size: 19px; line-height: 40px; color: var(--text); font-weight: 500; }
.fld { min-width: 0; }
.fld.inline { display: flex; gap: 2px; flex-wrap: wrap; }
.f-w { width: 150px; flex: 0 0 150px; }
.f-s { width: 90px; }
.f-l { width: 250px; flex: 0 0 250px; }
.quick { display: flex; gap: 16px; margin-top: 4px; button { background: none; border: 0; padding: 0; color: var(--text); font: 500 13px/20px var(--font); cursor: pointer; &:hover { color: var(--primary-text); } &:disabled { color: var(--muted); cursor: default; } } }
.sep { height: 1px; background: var(--border); margin: 10px 0; }
.row.end { padding-top: 14px; }
.endv { font-size: 20px; font-weight: 700; line-height: 40px; color: var(--text); &.stale { color: var(--text-2); } }
.hint { font-size: 12px; color: var(--muted); margin-top: -4px; }
.calc { margin-top: 10px; }
.note { margin-top: 12px; font-size: 12.5px; color: var(--muted); }
:deep(.v-field__input) { font-size: 15px; }
:deep(input[type='number']) { -moz-appearance: textfield; }
:deep(input[type='number']::-webkit-inner-spin-button), :deep(input[type='number']::-webkit-outer-spin-button) { -webkit-appearance: none; margin: 0; }
@media (max-width: 959px) {
  .head { margin-bottom: 6px; }
  .ttl { font-size: 18px; white-space: nowrap; }
  .btns .outline-btn, .save-btn { padding: 0 11px; letter-spacing: 0.5px; font-size: 13px; }
  .row { grid-template-columns: 1fr; padding: 8px 0 8px; gap: 4px; }
  .row.tight { padding: 8px 0 2px; }
  .lab { font-size: 16px; line-height: 26px; }
  .f-w { width: 160px; flex: 1 1 140px; }
  .f-l { flex: 1 1 200px; }
}
</style>
