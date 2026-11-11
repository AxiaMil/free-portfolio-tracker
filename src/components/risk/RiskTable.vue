<script setup lang="ts">
// Metric x period table (time-weighted, vs the main benchmark). Annualized ratios are withheld below ~6 months.
import { computed } from 'vue';
import { result } from '../../store.ts';
import { primaryBench } from '../../composables/stats.ts';
import { riskMetrics, type RiskMetrics } from '../../engine/risk.ts';
import { periodBaseDate, type PeriodKey } from '../../engine/periods.ts';
import { num, pct, signClass } from '../../format.ts';
import ShareButton from '../ShareButton.vue';

const PERIODS: PeriodKey[] = ['1W', '1M', '3M', '6M', 'YTD', '1Y', 'All'];
const DASH = '–';

const cols = computed(() => {
  const r = result.value;
  if (!r || r.series.length < 2) return PERIODS.map(() => null);
  return PERIODS.map((k) => riskMetrics(r.series, k === 'All' ? null : periodBaseDate(k, r.today), r.today, primaryBench.value));
});

type Cell = { text: string; cls: string };
const cell = (v: number | null | undefined, kind: 'ret' | 'pct' | 'ratio' | 'dd' | 'alpha'): Cell => {
  if (v == null || !isFinite(v)) return { text: DASH, cls: 'na' };
  if (kind === 'ret' || kind === 'alpha') return { text: pct(v), cls: signClass(v) };
  if (kind === 'pct') return { text: pct(v, { sign: false }), cls: '' };
  if (kind === 'dd') return { text: pct(v, { sign: false }), cls: v < 0 ? 'neg' : '' };
  return { text: num(v, 2), cls: '' };
};

const ROWS: Array<{ label: string; get: (m: RiskMetrics) => Cell }> = [
  { label: 'Return', get: (m) => cell(m.ret, 'ret') },
  { label: 'Volatility', get: (m) => cell(m.vol, 'pct') },
  { label: 'Sharpe', get: (m) => cell(m.sharpe, 'ratio') },
  { label: 'Sortino', get: (m) => cell(m.sortino, 'ratio') },
  { label: 'Max DD', get: (m) => cell(m.maxDD, 'dd') },
  { label: 'Beta', get: (m) => cell(m.beta, 'ratio') },
  { label: 'Alpha', get: (m) => cell(m.alpha, 'alpha') },
  { label: 'Calmar', get: (m) => cell(m.calmar, 'ratio') },
];

const table = computed(() => ROWS.map((row) => ({ label: row.label, cells: cols.value.map((m) => (m ? row.get(m) : { text: DASH, cls: 'na' })) })));
const anyWithheld = computed(() => cols.value.some((m) => m && !m.enough));

function csv() {
  return [['Metric', ...PERIODS], ...table.value.map((r) => [r.label, ...r.cells.map((c) => (c.text === DASH ? '' : c.text))])];
}
</script>

<template>
  <section class="rtab">
    <div class="bar"><ShareButton icon :csv="csv" filename="risk-metrics" label="Export table" /></div>
    <div class="card tcard">
      <div class="scroll hide-scroll">
        <table class="p-table mt">
          <thead>
            <tr><th>Metric</th><th v-for="p in PERIODS" :key="p" class="num">{{ p }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in table" :key="r.label">
              <td class="lbl">{{ r.label }}</td>
              <td v-for="(c, i) in r.cells" :key="i" class="num" :class="c.cls">{{ c.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <p v-if="anyWithheld" class="withheld">— Withheld: annualized measures need at least 6 months of history to be reliable.</p>
  </section>
</template>

<style scoped lang="scss">
.bar { display: flex; justify-content: flex-end; }
.bar :deep(.outline-btn.icon) { height: 28px; width: 40px; border-radius: 8px; border-color: var(--border-strong); }
.tcard { margin-top: 12px; overflow: hidden; }
.scroll { overflow-x: auto; }
.mt {
  th { height: 42px; font-size: 13px; color: var(--text-2); font-weight: 500; padding: 4px 16px; }
  td { height: 40px; font-size: 13.5px; padding: 4px 16px; }
  th.num, td.num { text-align: right; }
  td.num { font-family: var(--mono); letter-spacing: -0.2px; }
  td.lbl { font-size: 14px; color: var(--text); font-weight: 500; }
  td.na { color: var(--faint); }
  tbody tr:hover td { background: transparent; }
}
.withheld { margin: 16px 0 0; font-size: 14px; line-height: 20px; color: var(--muted); }
@media (max-width: 959px) {
  .bar :deep(.outline-btn.icon) { height: 36px; }
  .tcard { margin-top: 4px; }
  .mt {
    th { height: 40px; padding: 4px 14px; }
    td { height: 36px; padding: 4px 14px; }
    th.num, td.num { min-width: 84px; }
  }
  .withheld { font-size: 14px; line-height: 19px; }
}
</style>
