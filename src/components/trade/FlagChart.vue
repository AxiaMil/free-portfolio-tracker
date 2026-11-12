<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Price line with buy/sell flags (stacked when several trades share a day), zoom buttons and a navigator.
// Same look as TimeChart; separate because flags need per-flag colours, stacking offsets and trade tooltips.
import { computed, ref, watch } from 'vue';
import VChart from 'vue-echarts/csp';
import { useDisplay } from 'vuetify';
import { AXIS_COLOR, FONT, tooltipBase } from '../../charts.ts';
import { addMonths, addYears, toDate } from '../../engine/util.ts';

export interface Flag { date: string; value: number; label: string; color: string; text: string }

const props = withDefaults(defineProps<{
  name: string;
  data: Array<[string, number]>;
  flags?: Flag[];
  zooms?: string[];
  initialZoom?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}>(), { flags: () => [], zooms: () => ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL'], height: 425 });

const emit = defineEmits<{ (e: 'range', v: [string, string]): void }>();
const { mdAndUp } = useDisplay();
const chart = ref();
defineExpose({ chart });

const ms = (d: string) => toDate(d).getTime();
const bounds = computed(() => ({ min: props.data[0]?.[0] ?? '', max: props.data[props.data.length - 1]?.[0] ?? '' }));

const zoom = ref(props.initialZoom ?? props.zooms[props.zooms.length - 1]);
const range = ref<[string, string]>(['', '']);

function zoomStart(z: string, end: string): string {
  const k = z.toLowerCase();
  if (k === 'all') return bounds.value.min;
  if (k === 'ytd') return `${end.slice(0, 4)}-01-01`;
  const n = parseInt(k, 10) || 1;
  if (k.endsWith('m')) return addMonths(end, -n);
  if (k.endsWith('y')) return addYears(end, -n);
  return bounds.value.min;
}

function zoomDisabled(z: string): boolean {
  const { min, max } = bounds.value;
  if (!min) return true;
  const k = z.toLowerCase();
  if (k === 'all' || k === 'ytd' || k.endsWith('m')) return false;
  return zoomStart(z, max) < addMonths(min, -3);
}

function applyZoom(z: string) {
  zoom.value = z;
  const { min, max } = bounds.value;
  if (!min) return;
  const s = zoomStart(z, max);
  range.value = [s < min ? min : s, max];
  emit('range', range.value);
}
watch(() => bounds.value.min + bounds.value.max, () => applyZoom(zoom.value), { immediate: true });

function onDataZoom() {
  const inst = chart.value?.chart ?? chart.value;
  const dz = inst?.getOption?.()?.dataZoom?.[0];
  if (dz?.startValue != null && dz?.endValue != null) {
    range.value = [new Date(dz.startValue).toISOString().slice(0, 10), new Date(dz.endValue).toISOString().slice(0, 10)];
    emit('range', range.value);
  }
}

const flagsByDate = computed(() => {
  const m = new Map<string, Flag[]>();
  for (const f of props.flags) {
    if (!m.has(f.date)) m.set(f.date, []);
    m.get(f.date)!.push(f);
  }
  return m;
});

const option = computed(() => {
  const mobile = !mdAndUp.value;
  const R = mobile ? 8 : 8.5; // flag radius
  const STEM = mobile ? 13 : 15;
  const flagItems: any[] = [];
  const stemItems: any[] = [];
  for (const [d, list] of flagsByDate.value) {
    const x = ms(d);
    const v = list[0].value;
    stemItems.push({ value: [x, v], symbolSize: [1.2, STEM], symbolOffset: [0, -STEM / 2] });
    list.forEach((f, k) => {
      flagItems.push({
        value: [x, v], symbolOffset: [0, -(STEM + R + k * (2 * R - 2))], z: 10 + k,
        itemStyle: { color: f.color, borderColor: palette.surface, borderWidth: 1 }, label: { formatter: f.label },
      });
    });
  }
  const [s, e] = range.value;
  const fmt = props.valueFormatter ?? ((v: number) => v.toFixed(2));
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: 2, right: 4, top: 10, bottom: mobile ? 56 : 112 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: palette.axis, type: 'dashed' } },
      formatter: (items: any[]) => {
        const it = items.find((i) => i.seriesName === props.name);
        if (!it) return '';
        const d = new Date(it.value[0]).toISOString().slice(0, 10);
        const trades = flagsByDate.value.get(d) ?? [];
        return `<div style="margin-bottom:4px;color:${palette.axis}">${d}</div><div style="display:flex;gap:14px;justify-content:space-between"><span>${it.marker}${props.name}</span><b>${fmt(it.value[1])}</b></div>`
          + trades.map((t) => `<div style="margin-top:4px;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:14px;height:14px;line-height:14px;border-radius:50%;background:${t.color};color:#fff;font-size:9px;font-weight:700;text-align:center">${t.label}</span>${t.text}</div>`).join('');
      },
    },
    xAxis: {
      type: 'time',
      splitNumber: mobile ? 3 : 10,
      axisLine: { onZero: false, lineStyle: { color: palette.axisLine, width: 1 } },
      axisTick: { show: true, lineStyle: { color: palette.axisLine }, length: 5 },
      axisLabel: { color: AXIS_COLOR, fontSize: mobile ? 12 : 12.8, hideOverlap: true, margin: 12, formatter: { year: '{MMM} {yyyy}', month: '{MMM} {yyyy}', day: '{MMM} {d}' } },
      splitLine: { show: false },
      min: bounds.value.min ? ms(bounds.value.min) : undefined,
      max: bounds.value.max ? ms(bounds.value.max) : undefined,
    },
    // generous padding: room for flags on top, empty band above the axis
    yAxis: {
      type: 'value', show: false, scale: true,
      min: (v: { min: number; max: number }) => v.min - (v.max - v.min || Math.abs(v.min) * 0.05 || 1) * 0.46,
      max: (v: { min: number; max: number }) => v.max + (v.max - v.min || Math.abs(v.max) * 0.05 || 1) * 0.16,
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, startValue: s ? ms(s) : undefined, endValue: e ? ms(e) : undefined, zoomOnMouseWheel: false, moveOnMouseWheel: false , moveOnMouseMove: !mobile, preventDefaultMouseMove: !mobile },
      {
        type: 'slider', xAxisIndex: 0, startValue: s ? ms(s) : undefined, endValue: e ? ms(e) : undefined,
        height: mobile ? 10 : 42, bottom: mobile ? 6 : 20, showDataShadow: !mobile, showDetail: false, brushSelect: false, borderColor: 'transparent',
        backgroundColor: palette.navigatorBg, fillerColor: mobile ? alpha(palette.navigatorData, 0.6) : palette.navigatorFill,
        dataBackground: { lineStyle: { color: palette.navigatorData, width: 1 }, areaStyle: { color: palette.navigatorDataFill } },
        selectedDataBackground: { lineStyle: { color: palette.handle, width: 1 }, areaStyle: { color: palette.navigatorFill } },
        handleSize: mobile ? '0%' : '70%', handleStyle: { color: palette.surface, borderColor: palette.handle, borderWidth: 1.5 }, moveHandleSize: mobile ? 0 : 6,
        moveHandleStyle: { color: palette.navigatorData }, labelFormatter: '', textStyle: { color: AXIS_COLOR },
      },
    ],
    series: [
      {
        name: props.name, type: 'line', data: props.data.map(([d, v]) => [ms(d), v]), showSymbol: false, symbol: 'none', z: 2,
        lineStyle: { color: palette.portfolio, width: 2 }, itemStyle: { color: palette.portfolio }, emphasis: { disabled: true },
      },
      { name: '__stems', type: 'scatter', data: stemItems, symbol: 'rect', itemStyle: { color: palette.flag }, z: 8, silent: true, tooltip: { show: false }, emphasis: { disabled: true } },
      {
        name: '__flags', type: 'scatter', data: flagItems, symbol: 'circle', symbolSize: 2 * R, z: 10, silent: true, tooltip: { show: false }, emphasis: { disabled: true },
        label: { show: true, position: 'inside', color: '#fff', fontWeight: 700, fontSize: mobile ? 9.5 : 10, fontFamily: FONT },
      },
    ],
  };
});
</script>

<template>
  <div class="fc">
    <div class="zoom-row">
      <span class="mr-2">Zoom</span>
      <button v-for="z in zooms" :key="z" class="z" :class="{ active: zoom === z }" :disabled="zoomDisabled(z)" @click="applyZoom(z)">{{ z }}</button>
    </div>
    <div class="fc-chart" :style="{ height: height + 'px' }">
      <v-chart ref="chart" :option="option" autoresize @datazoom="onDataZoom" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.zoom-row { min-height: 26px; }
.fc-chart { position: relative; width: 100%; }
</style>
