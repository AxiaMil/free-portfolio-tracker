<script setup lang="ts">
// "Your Portfolio Rebalancing Results": key figures, current vs target donuts and the buy / sell list.
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { hidden, money, num, price, signClass } from '../../format.ts';
import AllocDonut from '../alloc/AllocDonut.vue';
import ShareButton from '../ShareButton.vue';
import HelpTip from '../HelpTip.vue';
import type { RRow } from './useRebalance.ts';

const props = defineProps<{
  rows: RRow[];
  totals: { current: number; target: number; sumPct: number; sumOk: boolean; positions: number; buy: number; sell: number };
}>();
const { mdAndUp } = useDisplay();

const pct2 = (r: number) => `${num(r * 100, 2)}%`;

const currentItems = computed(() => props.rows.map((r) => ({ name: r.kind === 'cash' ? r.name : r.symbol, value: r.current, color: r.color })));
const targetItems = computed(() => props.rows.map((r) => ({ name: r.kind === 'cash' ? r.name : r.symbol, value: r.targetValue, color: r.color })));

function unitsText(r: RRow): string {
  if (r.kind === 'cash' || Math.abs(r.delta) < 0.005) return '';
  if (r.units == null) return 'no price yet';
  if (hidden()) return `${r.delta > 0 ? 'Buy' : 'Sell'} ≈ •••• units`;
  const u = Math.abs(r.units);
  const n = u >= 100 ? num(u, 0) : u >= 1 ? num(u, 2) : num(u, 4);
  return `${r.delta > 0 ? 'Buy' : 'Sell'} ≈ ${n} @ ${price(r.lastLocal)} ${r.currency}`;
}

const net = computed(() => props.totals.target - props.totals.current);
const SUM_HELP = 'Targets should add up to 100% of the current value. Above 100% means the plan needs new money, below 100% leaves money unallocated.';
const POS_HELP = 'Assets with a target above zero (cash not counted).';

function csv(): Array<Array<string | number>> {
  return [
    ['Asset', 'Name', 'Current Value', 'Current Allocation', 'Target Value', 'Target Allocation', 'Reallocated Value', 'Units to trade', 'Last Price', 'Currency'],
    ...props.rows.map((r) => [
      r.kind === 'cash' ? 'CASH' : r.symbol, r.name, r.current.toFixed(2), (r.currentPct * 100).toFixed(2) + '%', r.targetValue.toFixed(2),
      (r.targetPct * 100).toFixed(2) + '%', r.delta.toFixed(2), r.units == null ? '' : r.units.toFixed(4), r.lastLocal ?? '', r.currency,
    ]),
  ];
}
</script>

<template>
  <section class="results">
    <div class="res-head">
      <h2 class="r-title">Your Portfolio Rebalancing Results</h2>
      <v-spacer />
      <ShareButton icon :csv="csv" filename="rebalance" label="Export as CSV" />
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="k-lbl">Number of Positions <HelpTip :text="POS_HELP" :size="15" icon="mdi-information" /></div>
        <div class="k-val">{{ totals.positions }}</div>
      </div>
      <div class="kpi">
        <div class="k-lbl">Current Value</div>
        <div class="k-val">{{ money(totals.current, { decimals: 'auto' }) }}</div>
      </div>
      <div class="kpi">
        <div class="k-lbl">Sum Target Allocation <HelpTip :text="SUM_HELP" :size="15" icon="mdi-information" /></div>
        <div class="k-val" :class="{ warn: !totals.sumOk }">
          {{ pct2(totals.sumPct) }}
          <v-icon v-if="!totals.sumOk" size="20" class="warn-ic">mdi-alert-circle</v-icon>
        </div>
        <div v-if="!totals.sumOk" class="k-note">{{ money(net, { sign: true }) }} vs current value</div>
      </div>
    </div>

    <div class="donuts">
      <div class="d-col">
        <div class="d-cap">Current Allocation</div>
        <AllocDonut :items="currentItems" :height="mdAndUp ? 380 : 250" :font-size="mdAndUp ? 12 : 10" :max-radius="mdAndUp ? 140 : 86" :label-max-width="mdAndUp ? 150 : 100" />
      </div>
      <div class="d-col">
        <div class="d-cap">Target Allocation</div>
        <AllocDonut :items="targetItems" :height="mdAndUp ? 380 : 250" :font-size="mdAndUp ? 12 : 10" :max-radius="mdAndUp ? 140 : 86" :label-max-width="mdAndUp ? 150 : 100" empty-text="Set a target to see it here" />
      </div>
    </div>

    <div class="flows">
      <span>To buy <b :class="{ pos: totals.buy >= 0.005 }">{{ money(totals.buy) }}</b></span>
      <span>To sell <b :class="{ neg: totals.sell >= 0.005 }">{{ money(totals.sell) }}</b></span>
      <span>Cash after trades <b>{{ money(rows[0]?.targetValue ?? 0) }}</b></span>
    </div>

    <!-- desktop table -->
    <div v-if="mdAndUp" class="card tcard">
      <table class="p-table">
        <thead>
          <tr>
            <th>Asset Name</th>
            <th class="r">Current Value</th>
            <th class="r">Current Allocation</th>
            <th class="r">Target Value</th>
            <th class="r">Target Allocation</th>
            <th class="r">Reallocated Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td class="asset">
              <span class="dot" :style="{ background: r.color }" />
              <span class="an">
                <b>{{ r.kind === 'cash' ? r.name : r.symbol }}</b>
                <span v-if="r.kind !== 'cash'" class="nm" :title="r.name">{{ r.name }}</span>
              </span>
            </td>
            <td class="r">{{ money(r.current) }}</td>
            <td class="r">{{ pct2(r.currentPct) }}</td>
            <td class="r">{{ money(r.targetValue) }}</td>
            <td class="r">{{ pct2(r.targetPct) }}</td>
            <td class="r">
              <div :class="signClass(Math.abs(r.delta) < 0.005 ? 0 : r.delta)">{{ Math.abs(r.delta) < 0.005 ? money(0) : money(r.delta, { sign: true }) }}</div>
              <div v-if="unitsText(r)" class="units">{{ unitsText(r) }}</div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td><b>Total</b></td>
            <td class="r"><b>{{ money(totals.current) }}</b></td>
            <td class="r"><b>100.00%</b></td>
            <td class="r"><b>{{ money(totals.target) }}</b></td>
            <td class="r" :class="{ neg: !totals.sumOk }"><b>{{ pct2(totals.sumPct) }}</b></td>
            <td class="r" :class="signClass(Math.abs(net) < 0.005 ? 0 : net)"><b>{{ money(Math.abs(net) < 0.005 ? 0 : net, { sign: true }) }}</b></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- phone cards -->
    <div v-else class="m-list">
      <div v-for="r in rows" :key="r.key" class="m-card">
        <div class="m-top">
          <span class="dot" :style="{ background: r.color }" />
          <div class="m-id">
            <b>{{ r.kind === 'cash' ? r.name : r.symbol }}</b>
            <span v-if="r.kind !== 'cash'" class="nm" :title="r.name">{{ r.name }}</span>
          </div>
          <div class="m-delta">
            <div :class="signClass(Math.abs(r.delta) < 0.005 ? 0 : r.delta)">{{ Math.abs(r.delta) < 0.005 ? money(0) : money(r.delta, { sign: true }) }}</div>
            <div v-if="unitsText(r)" class="units">{{ unitsText(r) }}</div>
          </div>
        </div>
        <div class="m-grid">
          <span class="lbl">Value</span><span>{{ money(r.current) }}</span><v-icon size="14" class="to">mdi-arrow-right</v-icon><span>{{ money(r.targetValue) }}</span>
          <span class="lbl">Allocation</span><span>{{ pct2(r.currentPct) }}</span><v-icon size="14" class="to">mdi-arrow-right</v-icon><span>{{ pct2(r.targetPct) }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.results { margin-top: 56px; }
.res-head { display: flex; align-items: center; gap: 12px; }
.r-title { font-size: 20px; line-height: 28px; font-weight: 700; color: var(--text); margin: 0; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 30px; }
.kpi { text-align: center; min-width: 0; }
.k-lbl { font-size: 14px; line-height: 20px; color: var(--text); display: inline-flex; align-items: center; gap: 10px; }
.k-lbl :deep(.help-tip) { color: var(--text); }
.k-val { font-size: 22px; line-height: 30px; font-weight: 500; color: var(--text); margin-top: 2px; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 6px; }
.k-val.warn { color: var(--neg); }
.warn-ic { color: var(--neg); }
.k-note { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.donuts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 30px; }
.d-col { min-width: 0; }
.d-cap { text-align: center; font-size: 14px; font-weight: 600; color: var(--text-2); letter-spacing: 0.3px; }
.flows { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 32px; margin: 18px 0 24px; font-size: 14px; color: var(--text-2); b { margin-left: 6px; color: var(--text); font-weight: 600; } b.pos { color: var(--pos); } b.neg { color: var(--neg); } }
.tcard { overflow-x: auto; }
.p-table th.r, .p-table td.r { text-align: right; padding-right: 16px; }
.p-table td { height: 52px; }
.asset { display: flex; align-items: center; gap: 10px; min-width: 220px; }
.an { display: flex; flex-direction: column; line-height: 18px; min-width: 0; }
.nm { font-size: 11.5px; line-height: 15px; color: var(--muted); max-width: 220px; white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.dot { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.units { font-size: 11.5px; line-height: 15px; color: var(--muted); }
tfoot td { border-top: 1px solid var(--border); height: 48px; }

@media (max-width: 959px) {
  .results { margin-top: 44px; }
  .kpis { grid-template-columns: 1fr 1fr; row-gap: 28px; margin-top: 26px; }
  .kpi:last-child { grid-column: span 2; }
  .donuts { grid-template-columns: 1fr; gap: 8px; margin-top: 28px; }
  .flows { justify-content: flex-start; gap: 6px 18px; font-size: 13px; }
  .m-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; background: var(--surface); }
  .m-top { display: flex; align-items: flex-start; gap: 10px; }
  .m-top .dot { margin-top: 5px; }
  .m-id { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 20px; .nm { max-width: 150px; } }
  .m-delta { text-align: right; font-size: 15px; font-weight: 600; .units { font-weight: 400; } }
  .m-grid {
    display: grid; grid-template-columns: 84px auto 22px auto; justify-content: start; align-items: center; row-gap: 2px;
    margin: 8px 0 0 20px; font-size: 13.5px; line-height: 20px;
    .lbl { font-size: 12px; color: var(--text-2); }
    .to { color: var(--muted); justify-self: center; }
  }
}
</style>
