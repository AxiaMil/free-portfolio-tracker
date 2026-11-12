<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Donut for the Dividends page: like the shared DonutChart, but slivers under ~1% get no callout
// label (they stay visible and in the tooltip), which keeps the left side readable.
import { computed, ref } from 'vue';
import VChart from 'vue-echarts/csp';
import { FONT, PALETTE, tooltipBase } from '../../charts.ts';
import { money } from '../../format.ts';

const props = defineProps<{ items: Array<{ name: string; value: number }>; palette?: string[]; height?: number; compact?: boolean }>();
const chart = ref();
defineExpose({ chart });

const option = computed(() => {
  const total = props.items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const data = props.items.filter((x) => x.value > 0).map((x) => ({ name: x.name, value: x.value }));
  return {
    color: props.palette ?? PALETTE,
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => `${p.name}<br/><b>${money(p.value)}</b> (${((p.value / total) * 100).toFixed(2)}%)` },
    series: [
      {
        type: 'pie',
        radius: props.compact ? ['34%', '66%'] : ['36%', '72%'],
        center: ['50%', '52%'],
        startAngle: 90,
        avoidLabelOverlap: true,
        minShowLabelAngle: 3.9,
        itemStyle: { borderWidth: 0 },
        label: {
          color: palette.text,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: props.compact ? 10 : 12.5,
          formatter: (p: any) => `${p.name}: ${((p.value / total) * 100).toFixed(1)}%`,
        },
        labelLine: { length: props.compact ? 6 : 10, length2: props.compact ? 10 : 14, lineStyle: { width: 1 } },
        labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
        emphasis: { scale: true, scaleSize: 4 },
        data,
      },
    ],
  };
});
</script>

<template>
  <div class="donut" :style="{ height: (height ?? 440) + 'px' }">
    <v-chart ref="chart" :option="option" autoresize />
  </div>
</template>

<style scoped>
.donut { position: relative; width: 100%; }
</style>
