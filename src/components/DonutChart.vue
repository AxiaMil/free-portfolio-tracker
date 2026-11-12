<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Donut with callout labels such as "AAPL: 33.2%".
import { computed, ref } from 'vue';
import VChart from 'vue-echarts/csp';
import { PALETTE, FONT, tooltipBase } from '../charts.ts';
import { money } from '../format.ts';

const props = defineProps<{ items: Array<{ name: string; value: number }>; palette?: string[]; height?: number; compact?: boolean; valueFormatter?: (v: number) => string }>();
const chart = ref();
defineExpose({ chart });

const option = computed(() => {
  const total = props.items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const data = props.items.filter((x) => x.value > 0).map((x) => ({ name: x.name, value: x.value }));
  return {
    color: props.palette ?? PALETTE,
    tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => `${p.name}<br/><b>${(props.valueFormatter ?? ((v: number) => money(v)))(p.value)}</b> (${((p.value / total) * 100).toFixed(2)}%)` },
    series: [
      {
        type: 'pie',
        radius: props.compact ? ['34%', '66%'] : ['36%', '72%'],
        center: ['50%', '52%'],
        startAngle: 90,
        avoidLabelOverlap: true,
        minShowLabelAngle: 0,
        itemStyle: { borderWidth: 0 },
        label: {
          color: palette.text,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: props.compact ? 10 : 13,
          formatter: (p: any) => `${p.name}: ${((p.value / total) * 100).toFixed(1)}%`,
        },
        labelLine: { length: 8, length2: 10, lineStyle: { width: 1 } },
        labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
        data,
      },
    ],
  };
});
</script>

<template>
  <div class="donut" :style="{ height: (height ?? 520) + 'px' }">
    <v-chart ref="chart" :option="option" autoresize />
  </div>
</template>

<style scoped>
.donut { position: relative; width: 100%; }
</style>
