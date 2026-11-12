<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Stacked bars of received vs upcoming dividends per month / quarter / year, with a scroll bar
// and a tooltip that breaks the bar down by ticker.
import { computed, ref } from 'vue';
import VChart from 'vue-echarts/csp';
import { useDisplay } from 'vuetify';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../../charts.ts';
import type { DivBucket } from '../../engine/dividends.ts';
import { money, moneyAxis } from '../../format.ts';

const props = defineProps<{ buckets: DivBucket[]; height?: number }>();
const { mdAndUp } = useDisplay();
const chart = ref();
defineExpose({ chart });


const option = computed(() => {
  const b = props.buckets;
  const mobile = !mdAndUp.value;
  const visible = 18;
  const many = b.length > visible;
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: mobile ? 58 : 66, right: 8, top: 12, bottom: many ? 74 : 62 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: palette.grid } },
      formatter: (ps: any[]) => {
        const x = b[ps[0]?.dataIndex];
        if (!x) return '';
        const rows: string[] = [`<div style="color:${palette.axis};margin-bottom:4px">${x.key}</div>`];
        if (x.received) rows.push(`<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${palette.pos};margin-right:6px"></span>Received</span><b>${money(x.received)}</b></div>`);
        if (x.upcoming) rows.push(`<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${palette.bench};margin-right:6px"></span>Upcoming</span><b>${money(x.upcoming)}</b></div>`);
        if (x.tickers.length) {
          rows.push('<div style="margin-top:6px">Tickers:</div>');
          for (const t of x.tickers.slice(0, 14)) rows.push(`<div>- ${t.symbol} (${money(t.amount)})${x.received && x.upcoming ? `<span style="color:${palette.axis}"> ${t.upcoming ? 'upcoming' : 'received'}</span>` : ''}</div>`);
          if (x.tickers.length > 14) rows.push(`<div style="color:${palette.axis}">+${x.tickers.length - 14} more</div>`);
        }
        return rows.join('');
      },
    },
    xAxis: {
      type: 'category',
      data: b.map((x) => x.key),
      axisLabel: { color: AXIS_COLOR, rotate: 45, fontSize: mobile ? 11.5 : 12.5, interval: mobile ? 1 : 0, margin: 10 },
      axisLine: { lineStyle: { color: palette.axisLine } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitNumber: 3,
      axisLabel: { color: AXIS_COLOR, fontSize: 12.5, formatter: (v: number) => moneyAxis(v) },
      splitLine: { lineStyle: { color: GRID_COLOR } },
    },
    dataZoom: [
      { type: 'inside', startValue: many ? b.length - visible : 0, endValue: b.length - 1, zoomOnMouseWheel: false, moveOnMouseWheel: true , moveOnMouseMove: !mobile, preventDefaultMouseMove: !mobile },
      { type: 'slider', show: many, height: 8, bottom: 4, startValue: many ? b.length - visible : 0, endValue: b.length - 1, showDetail: false, showDataShadow: false, brushSelect: false, borderColor: 'transparent', backgroundColor: palette.navigatorBg, fillerColor: palette.navigatorData, handleSize: 0, moveHandleSize: 0 },
    ],
    series: [
      { name: 'Received', type: 'bar', stack: 'div', barMaxWidth: 26, barCategoryGap: '35%', data: b.map((x) => x.received || null), itemStyle: { color: palette.pos } },
      { name: 'Upcoming', type: 'bar', stack: 'div', barMaxWidth: 26, data: b.map((x) => x.upcoming || null), itemStyle: { color: palette.bench } },
    ],
  };
});
</script>

<template>
  <div class="dbc" :style="{ height: (height ?? 320) + 'px' }">
    <v-chart ref="chart" :option="option" autoresize />
  </div>
</template>

<style scoped>
.dbc { position: relative; width: 100%; }
</style>
