<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Time series chart with zoom buttons, date range readout and a navigator strip.
import { computed, ref, watch } from 'vue';
import VChart from 'vue-echarts';
import { useDisplay } from 'vuetify';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../charts.ts';
import { addMonths, addYears, toDate } from '../engine/util.ts';

export interface TSeries {
  name: string;
  data: Array<[string, number | null]>;
  color: string;
  kind?: 'line' | 'area' | 'step-area' | 'bar';
  width?: number;
  fill?: string;
  z?: number;
  dashed?: boolean;
  smooth?: boolean;
  /** fill under the line fading from this colour to transparent */
  gradient?: string;
}
export interface TMarker { date: string; value: number; label: string; color?: string; tooltip?: string }

const props = withDefaults(defineProps<{
  series: TSeries[];
  zooms?: string[];
  zoomLabel?: string;
  height?: number;
  showYAxis?: boolean;
  yFormatter?: (v: number) => string;
  valueFormatter?: (v: number, seriesName: string) => string;
  markers?: TMarker[];
  showRange?: boolean;
  initialZoom?: string;
  navigator?: boolean;
  yMin?: number | 'dataMin';
  yMax?: number;
  hideZoom?: boolean;
  legendBelow?: boolean;
  /** date range to show while the series has no data yet (e.g. yesterday → today) */
  emptyRange?: [string, string];
}>(), { zooms: () => ['1m', '3m', '6m', 'Ytd', '1y', '3y', '5y', 'All'], zoomLabel: 'Zoom', height: 430, showYAxis: false, showRange: true, navigator: true, hideZoom: false });

const emit = defineEmits<{ (e: 'range', v: [string, string]): void }>();
const { mdAndUp } = useDisplay();
const chart = ref();
defineExpose({ chart });

const ms = (d: string) => toDate(d).getTime();
const allDates = computed(() => {
  let min = '';
  let max = '';
  for (const s of props.series) for (const [d, v] of s.data) {
    if (v == null) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return { min, max };
});

const zoom = ref(props.initialZoom ?? props.zooms[props.zooms.length - 1]);
const range = ref<[string, string]>(['', '']);
const shownRange = computed(() => (range.value[0] ? range.value : props.emptyRange ?? null));

function zoomStart(z: string, end: string): string {
  const k = z.toLowerCase();
  if (k === 'all') return allDates.value.min;
  if (k === 'ytd') return `${end.slice(0, 4)}-01-01`;
  const n = parseInt(k, 10) || 1;
  if (k.endsWith('w')) return new Date(ms(end) - n * 7 * 86400000).toISOString().slice(0, 10);
  if (k.endsWith('m')) return addMonths(end, -n);
  if (k.endsWith('y')) return addYears(end, -n);
  return allDates.value.min;
}

function zoomDisabled(z: string): boolean {
  const { min, max } = allDates.value;
  if (!min) return true;
  const k = z.toLowerCase();
  if (k === 'all' || k === 'ytd' || k.endsWith('m') || k.endsWith('w')) return false;
  return zoomStart(z, max) < addMonths(min, -3);
}

function applyZoom(z: string) {
  zoom.value = z;
  const { min, max } = allDates.value;
  if (!min) return;
  const s = zoomStart(z, max) < min ? min : zoomStart(z, max);
  range.value = [s, max];
  emit('range', range.value);
}

watch(() => allDates.value.max + allDates.value.min, () => applyZoom(zoom.value), { immediate: true });

function onDataZoom() {
  const inst = chart.value?.chart ?? chart.value;
  const opt = inst?.getOption?.();
  const dz = opt?.dataZoom?.[0];
  if (dz?.startValue != null && dz?.endValue != null) {
    const s = new Date(dz.startValue).toISOString().slice(0, 10);
    const e = new Date(dz.endValue).toISOString().slice(0, 10);
    range.value = [s, e];
    emit('range', range.value);
  }
}

const option = computed(() => {
  const series: any[] = props.series.map((s) => {
    const base: any = {
      name: s.name,
      type: s.kind === 'bar' ? 'bar' : 'line',
      data: s.data.map(([d, v]) => [ms(d), v]),
      showSymbol: false,
      symbol: 'none',
      z: s.z ?? 2,
      smooth: s.smooth ?? false,
      lineStyle: { color: s.color, width: s.width ?? 2, type: s.dashed ? 'dashed' : 'solid' },
      itemStyle: { color: s.color },
      emphasis: { disabled: true },
      connectNulls: false,
    };
    if (s.kind === 'area' || s.kind === 'step-area') base.areaStyle = { color: s.fill ?? s.color, opacity: 1 };
    if (s.gradient) base.areaStyle = { opacity: 1, color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: s.gradient }, { offset: 1, color: alpha(s.gradient, 0) }] } };
    if (s.kind === 'step-area') base.step = 'end';
    return base;
  });
  if (props.markers?.length) {
    series.push({
      name: '__markers',
      type: 'scatter',
      data: props.markers.map((m) => ({ value: [ms(m.date), m.value], label: m.label, tip: m.tooltip })),
      symbol: 'pin',
      symbolSize: 34,
      symbolOffset: [0, -14],
      itemStyle: { color: palette.flag },
      label: { show: true, formatter: (p: any) => p.data.label, color: '#fff', fontWeight: 700, fontSize: 11, fontFamily: FONT, offset: [0, -14] },
      z: 10,
      tooltip: { trigger: 'item', formatter: (p: any) => p.data.tip ?? p.data.label },
    });
  }
  const [s, e] = range.value;
  const mobile = !mdAndUp.value;
  return {
    animation: false,
    textStyle: { fontFamily: FONT },
    grid: { left: props.showYAxis ? 58 : 2, right: 4, top: 14, bottom: props.navigator ? (mobile ? 56 : 112) : 30 },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: palette.axis, type: 'dashed' } },
      formatter: (items: any[]) => {
        const rows = items.filter((i) => i.seriesName !== '__markers' && i.value?.[1] != null);
        if (!rows.length) return '';
        const d = new Date(rows[0].value[0]).toISOString().slice(0, 10);
        return `<div style="margin-bottom:4px;color:${palette.axis}">${d}</div>` + rows.map((i) => `<div style="display:flex;gap:14px;justify-content:space-between"><span>${i.marker}${i.seriesName}</span><b>${props.valueFormatter ? props.valueFormatter(i.value[1], i.seriesName) : i.value[1].toFixed(2)}</b></div>`).join('');
      },
    },
    xAxis: {
      type: 'time',
      splitNumber: mobile ? 3 : 8,
      axisLine: { lineStyle: { color: palette.axisLine, width: 1 } },
      axisTick: { show: true, lineStyle: { color: palette.axisLine }, length: 5 },
      axisLabel: { color: AXIS_COLOR, fontSize: mobile ? 12 : 12.8, hideOverlap: true, margin: 12, alignMaxLabel: 'right', formatter: { year: '{MMM} {yyyy}', month: '{MMM} {yyyy}', day: '{MMM} {d}' } },
      splitLine: { show: false },
      min: allDates.value.min ? ms(allDates.value.min) : undefined,
      max: allDates.value.max ? ms(allDates.value.max) : undefined,
    },
    yAxis: {
      type: 'value',
      show: props.showYAxis,
      scale: props.yMin == null,
      min: props.yMin,
      max: props.yMax,
      axisLabel: { color: AXIS_COLOR, fontSize: 12, formatter: props.yFormatter },
      splitLine: { show: props.showYAxis, lineStyle: { color: GRID_COLOR } },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, startValue: s ? ms(s) : undefined, endValue: e ? ms(e) : undefined, zoomOnMouseWheel: false, moveOnMouseWheel: false , moveOnMouseMove: !mobile, preventDefaultMouseMove: !mobile },
      props.navigator
        ? {
            type: 'slider',
            xAxisIndex: 0,
            startValue: s ? ms(s) : undefined,
            endValue: e ? ms(e) : undefined,
            height: mobile ? 10 : 42,
            bottom: mobile ? 6 : 20,
            showDataShadow: !mobile,
            showDetail: false,
            brushSelect: false,
            borderColor: 'transparent',
            backgroundColor: palette.navigatorBg,
            fillerColor: mobile ? alpha(palette.navigatorData, 0.6) : palette.navigatorFill,
            dataBackground: { lineStyle: { color: palette.navigatorData, width: 1 }, areaStyle: { color: palette.navigatorDataFill } },
            selectedDataBackground: { lineStyle: { color: palette.handle, width: 1 }, areaStyle: { color: palette.navigatorFill } },
            handleSize: mobile ? '0%' : '70%',
            handleStyle: { color: palette.surface, borderColor: palette.handle, borderWidth: 1.5 },
            moveHandleSize: mobile ? 0 : 6,
            moveHandleStyle: { color: palette.navigatorData },
            labelFormatter: '',
            textStyle: { color: AXIS_COLOR },
          }
        : null,
    ].filter(Boolean),
    series,
  };
});
</script>

<template>
  <div class="tc">
    <div v-if="!hideZoom" class="tc-head">
      <div class="zoom-row">
        <span class="mr-2">{{ zoomLabel }}</span>
        <button v-for="z in zooms" :key="z" class="z" :class="{ active: zoom === z }" :disabled="zoomDisabled(z)" @click="applyZoom(z)">{{ z }}</button>
      </div>
      <div v-if="showRange && mdAndUp && shownRange" class="range">{{ shownRange[0] }} <span class="mx-3">→</span> {{ shownRange[1] }}</div>
    </div>
    <slot v-if="!legendBelow" name="legend" />
    <div class="tc-chart" :style="{ height: height + 'px' }">
      <v-chart ref="chart" :option="option" autoresize @datazoom="onDataZoom" />
    </div>
    <slot v-if="legendBelow" name="legend" />
  </div>
</template>

<style scoped lang="scss">
.tc-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.tc-head { min-height: 26px; }
.range { color: var(--text); font-size: 13px; padding-right: 16px; }
.tc-chart { position: relative; width: 100%; }
</style>
