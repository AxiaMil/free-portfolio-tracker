<script setup lang="ts">
// Headline trade statistics: lots, win rate, win rate vs the benchmark and total trade gain.
import type { TradeStats } from '../../engine/trades.ts';
import { moneyCompact, pct, signClass } from '../../format.ts';
import HelpTip from '../HelpTip.vue';

defineProps<{ stats: TradeStats; benchLabel: string }>();
// with no lots the rate reads 0.00%, not "-"
const rate = (r: number | null, lots: number) => pct(lots ? r : 0, { sign: false });
</script>

<template>
  <div class="kpis">
    <div class="kpi">
      <div class="k-lbl">LOTS</div>
      <div class="k-val">{{ stats.lots }}</div>
      <div class="k-sub">{{ stats.closed }} closed</div>
    </div>
    <div class="kpi">
      <div class="k-lbl">WIN RATE <HelpTip icon="mdi-information" :size="15" text="Share of lots with a positive total gain (price and currency change, dividends and realized gains, after fees)." /></div>
      <div class="k-val">{{ rate(stats.winRate, stats.lots) }}</div>
      <div class="k-sub">{{ stats.wins }}W / {{ stats.losses }}L</div>
    </div>
    <div class="kpi">
      <div class="k-lbl">WIN RATE VS {{ benchLabel.toUpperCase() }} <HelpTip icon="mdi-information" :size="15" :text="`Share of lots whose money-weighted return beat ${benchLabel} over the same holding period (both measured in your portfolio currency).`" /></div>
      <div class="k-val">{{ rate(stats.benchWinRate, stats.lots) }}</div>
      <div class="k-sub">{{ stats.benchWins }}W / {{ stats.benchLosses }}L</div>
    </div>
    <div class="kpi">
      <div class="k-lbl">TOTAL TRADE GAIN</div>
      <div class="k-val" :class="signClass(stats.totalGain)">
        {{ moneyCompact(stats.totalGain, { sign: true }) }}
        <HelpTip icon="mdi-information" :size="19" text="Sum of the total gain of the lots shown: market value of open shares plus sale proceeds and dividends, minus cost basis and fees." />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; }
.kpi { min-width: 0; }
.k-lbl { font-size: 14px; line-height: 20px; letter-spacing: 0.4px; color: var(--text-2); white-space: nowrap; :deep(.help-tip) { color: var(--text-2); margin: -3px 0 0 3px; } }
.k-val { font-size: 22px; font-weight: 500; line-height: 30px; margin-top: 2px; color: var(--text); white-space: nowrap; :deep(.help-tip) { margin: -4px 0 0 4px; } }
.k-val.pos :deep(.help-tip) { color: var(--pos); }
.k-val.neg :deep(.help-tip) { color: var(--neg); }
.k-sub { font-size: 14px; line-height: 20px; margin-top: 1px; color: var(--text-2); letter-spacing: 0.3px; }
@media (max-width: 959px) {
  .kpis { grid-template-columns: repeat(2, 1fr); row-gap: 24px; }
  .k-lbl { font-size: 13.5px; }
  .k-val { font-size: 23px; margin-top: 0; }
  .k-sub { margin-top: 0; }
}
</style>
