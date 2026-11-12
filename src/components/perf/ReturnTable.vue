<script setup lang="ts">
// "Total Return vs Benchmarks": portfolio and every benchmark over 1M .. All, best value per column outlined.
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { activePortfolio, benchName, result, store } from '../../store.ts';
import { bestPerColumn, returnTable, TABLE_PERIODS, type ReturnKind } from '../../engine/perf.ts';
import { pct, signClass } from '../../format.ts';
import PillToggle from '../PillToggle.vue';
import HelpTip from '../HelpTip.vue';
import ShareButton from '../ShareButton.vue';
import BenchmarkEditor from './BenchmarkEditor.vue';

const { mdAndUp } = useDisplay();
const kind = ref<ReturnKind>('Total Return');
const editing = ref(false);

const rows = computed(() => {
  const r = result.value;
  const p = activePortfolio.value;
  if (!r || !p) return [];
  const benches = (p.benchmarks ?? []).map((s) => ({ symbol: s, name: benchName(s) }));
  return returnTable(r.series, r.today, r.inception, store.method, benches, kind.value);
});
const best = computed(() => bestPerColumn(rows.value));

function csv() {
  const head = ['Benchmark', ...TABLE_PERIODS.map((p) => p.label), 'Annualized'];
  return [head, ...rows.value.map((r) => [r.name, ...r.cells.map((v) => pct(v)), pct(r.annualized)])];
}

const TITLE_HELP = 'Your portfolio\'s return over each period next to what the same deposits would have earned in each benchmark. The best value in every column is outlined. "-" means the portfolio is younger than the period.';
const KIND_HELP = 'MWR (money-weighted, XIRR) counts the size and timing of your deposits. TWR (time-weighted) measures the investments only. SR (simple return) = gain / invested capital.';
</script>

<template>
  <section class="rt">
    <div class="head">
      <h2 class="section-title title">
        Total Return vs Benchmarks
        <button class="icon-btn" aria-label="Edit benchmarks" @click="editing = true"><v-icon size="16">mdi-pencil</v-icon></button>
        <HelpTip :text="TITLE_HELP" :size="18" />
      </h2>
      <div class="ctrls">
        <v-menu location="bottom end">
          <template #activator="{ props }">
            <button v-bind="props" class="outline-btn kind-btn">{{ kind }}</button>
          </template>
          <v-list density="compact">
            <v-list-item v-for="k in (['Total Return', 'Annualized'] as const)" :key="k" :active="kind === k" @click="kind = k">{{ k }}</v-list-item>
          </v-list>
        </v-menu>
        <span class="vdiv d1" />
        <span class="help"><HelpTip :text="KIND_HELP" :size="18" /></span>
        <PillToggle v-model="store.method" class="method" :options="['MWR', 'TWR', 'SR'] as const" />
        <span class="vdiv d2" />
        <ShareButton class="share" :csv="csv" filename="total-return-vs-benchmarks" />
      </div>
    </div>

    <div class="card tcard">
      <div class="scroll hide-scroll">
        <table class="p-table rtable">
          <thead>
            <tr>
              <th>Benchmark</th>
              <th v-for="p in TABLE_PERIODS" :key="p.key">{{ p.label }}</th>
              <th>Annualized</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, ri) in rows" :key="r.id">
              <td class="name">{{ r.name }}</td>
              <td v-for="(v, ci) in r.cells" :key="ci">
                <span v-if="v == null" class="dash">-</span>
                <span v-else :class="[signClass(v), { chip: best[ci] === ri && rows.length > 1 }]">{{ pct(v) }}</span>
              </td>
              <td>
                <span v-if="r.annualized == null" class="dash">-</span>
                <span v-else :class="[signClass(r.annualized), { chip: best[TABLE_PERIODS.length] === ri && rows.length > 1 }]">{{ pct(r.annualized) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <BenchmarkEditor v-model="editing" />
  </section>
</template>

<style scoped lang="scss">
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.title { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; }
.icon-btn { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; margin-left: 12px; &:hover { color: var(--text); } }
.ctrls { display: flex; align-items: center; gap: 10px; }
.vdiv { width: 1px; height: 36px; background: var(--border); }
.help { display: inline-flex; }
.outline-btn { height: 28px; padding: 0 14px; border-radius: 8px; border-color: var(--border-strong); font-size: 13.5px; letter-spacing: 1.1px; }
.kind-btn { min-width: 112px; justify-content: center; }
.tcard { margin-top: 14px; overflow: hidden; }
.scroll { overflow-x: auto; }
.rtable {
  th { height: 55px; padding: 4px 4px 4px 14px; font-size: 11.5px; color: var(--text-2); }
  td { height: 52px; padding: 4px 4px 4px 14px; font-size: 14px; }
  td.name { font-size: 15px; color: var(--text); }
  tbody tr:hover td { background: transparent; }
}
.dash { color: var(--text); }
.chip { display: inline-flex; align-items: center; height: 25px; padding: 0 8px; border: 1px solid var(--faint); border-radius: 8px; font-weight: 600; margin-right: -17px; }

@media (max-width: 959px) {
  .head { flex-direction: column; align-items: flex-start; gap: 6px; }
  .title { gap: 8px; }
  .icon-btn { margin-left: 8px; }
  .ctrls { flex-wrap: wrap; gap: 8px; padding-left: 10px; }
  .method { order: 1; }
  .help { order: 2; }
  .d1 { order: 3; }
  .kind-btn { order: 4; }
  .d2 { order: 5; }
  .share { order: 6; }
  .vdiv { height: 34px; }
  .outline-btn { height: 30px; }
  .tcard { margin-top: 18px; }
  .rtable { th, td { min-width: 84px; } th:first-child, td:first-child { min-width: 82px; } }
}
</style>
