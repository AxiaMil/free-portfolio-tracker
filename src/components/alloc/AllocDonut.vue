<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Donut with callout labels ("VOO: 18.9%") that sizes and shifts itself so the labels fit beside it
// (labels on the wide side push the ring over).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import VChart from 'vue-echarts/csp';
import { FONT, tooltipBase } from '../../charts.ts';
import { money } from '../../format.ts';

export interface DonutItem { name: string; value: number; color: string }

const props = withDefaults(
  defineProps<{
    items: DonutItem[];
    height: number;
    fontSize?: number;
    /** labels wider than this wrap onto two lines */
    labelMaxWidth?: number;
    maxRadius?: number;
    /** inner radius as a fraction of the outer radius */
    hole?: number;
    valueFormatter?: (v: number) => string;
    emptyText?: string;
  }>(),
  { fontSize: 13, labelMaxWidth: 150, maxRadius: 160, hole: 0.5, emptyText: 'Nothing to show' },
);

const root = ref<HTMLElement>();
const chart = ref();
defineExpose({ chart });

const width = ref(0);
let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!root.value) return;
  width.value = root.value.clientWidth;
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width; });
  ro.observe(root.value);
});
onBeforeUnmount(() => ro?.disconnect());

let ctx: CanvasRenderingContext2D | null = null;
function textWidth(s: string, fs: number): number {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return s.length * fs * 0.62;
  ctx.font = `600 ${fs}px ${FONT}`;
  return ctx.measureText(s).width;
}

const LINE1 = 8; // radial part of the label line
const LINE2 = 10; // horizontal part
const DIST = 4; // gap between the label line and its text
const BLEED = 4; // space kept between a label and the chart edge
const SAFETY = 1.05; // canvas text metrics vs. rendered labels

/** long labels break onto two lines at the word boundary that gives the narrowest block */
function wrapLabel(text: string, fs: number, max: number): { text: string; w: number; lines: number } {
  const w = textWidth(text, fs) * SAFETY;
  const words = text.split(' ');
  if (w <= max || words.length < 2) return { text, w, lines: 1 };
  let best = { text, w, lines: 1 };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const bw = Math.max(textWidth(a, fs), textWidth(b, fs)) * SAFETY;
    if (bw < best.w) best = { text: `${a}\n${b}`, w: bw, lines: 2 };
  }
  return best;
}

interface Lbl { theta: number; w: number; h: number }

/**
 * Horizontal room (from the centre) the ring plus the labels of one side need, roughly the way ECharts lays them out:
 * labels start beside their slice, are pushed apart vertically, then slide along the circle.
 */
function sideNeed(ls: Lbl[], r: number, H: number): number {
  if (!ls.length) return r;
  const R1 = r + LINE1;
  const pts = ls
    .map((l) => ({ y: -R1 * Math.cos(l.theta), y0: -R1 * Math.cos(l.theta), x: R1 * Math.abs(Math.sin(l.theta)), w: l.w, h: l.h }))
    .sort((a, b) => a.y - b.y);
  // push overlapping labels apart, keeping the stack inside the chart
  const top = -H / 2;
  if (pts[0].y - pts[0].h / 2 < top) pts[0].y = top + pts[0].h / 2;
  for (let i = 1; i < pts.length; i++) {
    const min = pts[i - 1].y + (pts[i - 1].h + pts[i].h) / 2;
    if (pts[i].y < min) pts[i].y = min;
  }
  const over = pts[pts.length - 1].y + pts[pts.length - 1].h / 2 - H / 2;
  if (over > 0) {
    pts[pts.length - 1].y -= over;
    for (let i = pts.length - 2; i >= 0; i--) {
      const max = pts[i + 1].y - (pts[i + 1].h + pts[i].h) / 2;
      if (pts[i].y > max) pts[i].y = max;
    }
  }
  // moved labels slide onto an ellipse through the farthest one of each half (ECharts' recalculateX)
  if (pts.some((p) => Math.abs(p.y - p.y0) > 0.5)) {
    for (const semi of [pts.filter((p) => p.y <= 0), pts.filter((p) => p.y > 0)]) {
      if (!semi.length) continue;
      const far = semi.reduce((a, b) => (Math.abs(b.y) >= Math.abs(a.y) ? b : a));
      const dy = Math.abs(far.y);
      const rB = far.x < R1 ? Math.sqrt((dy * dy) / (1 - (far.x * far.x) / (R1 * R1))) : R1;
      for (const p of semi) p.x = rB > 0 ? R1 * Math.sqrt(Math.max(0, 1 - (p.y * p.y) / (rB * rB))) : p.x;
    }
  }
  let need = r;
  for (const p of pts) need = Math.max(need, p.x + LINE2 + DIST + p.w + BLEED);
  return need;
}

const layout = computed(() => {
  const data = props.items.filter((x) => x.value > 0);
  const total = data.reduce((s, x) => s + x.value, 0);
  const fs = props.fontSize;
  const lh = Math.round(fs * 1.3);
  const many = data.length > 8;
  const left: Lbl[] = [];
  const right: Lbl[] = [];
  const texts = new Map<string, string>();
  let acc = 0;
  const rows = data.map((x) => {
    const share = total ? x.value / total : 0;
    const mid = acc + share / 2;
    acc += share;
    // slivers that round to 0.0% only get a label when there are few slices
    const show = !(many && share < 0.0005);
    const lab = wrapLabel(`${x.name}: ${(share * 100).toFixed(1)}%`, fs, props.labelMaxWidth);
    texts.set(x.name, lab.text);
    // start at 12 o'clock, clockwise: right half while mid < 0.5
    if (show) (mid < 0.5 ? right : left).push({ theta: mid * 2 * Math.PI, w: lab.w, h: lab.lines * lh + 2 });
    return { ...x, share, show };
  });
  const W = width.value || 500;
  const H = props.height;
  let lo = 30;
  let hi = Math.max(lo, Math.min(props.maxRadius, H / 2 - fs * 1.5));
  for (let i = 0; i < 18 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (sideNeed(left, mid, H) + sideNeed(right, mid, H) <= W) lo = mid;
    else hi = mid;
  }
  const r = lo;
  const needL = sideNeed(left, r, H);
  const needR = sideNeed(right, r, H);
  // keep the ring centred unless the labels of one side need the room
  const cx = Math.min(Math.max(W / 2, needL), Math.max(needL, W - needR));
  return { rows, total, r, cx, texts };
});

const option = computed(() => {
  const { rows, total, r, cx, texts } = layout.value;
  const fs = props.fontSize;
  const fmt = props.valueFormatter ?? ((v: number) => money(v));
  return {
    animationDuration: 500,
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: any) => `${p.marker}${p.name}<br/><b>${fmt(p.value)}</b> (${((p.value / (total || 1)) * 100).toFixed(2)}%)`,
    },
    series: [
      {
        type: 'pie',
        radius: [Math.round(r * props.hole), Math.round(r)],
        center: [Math.round(cx), Math.round(props.height / 2)],
        startAngle: 90,
        clockwise: true,
        avoidLabelOverlap: true,
        minShowLabelAngle: 0,
        percentPrecision: 1,
        itemStyle: { borderWidth: 0 },
        emphasis: { scale: true, scaleSize: 4 },
        label: {
          color: palette.text,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: fs,
          lineHeight: Math.round(fs * 1.3),
          bleedMargin: BLEED,
          distanceToLabelLine: DIST,
          formatter: (p: any) => texts.get(p.name) ?? `${p.name}: ${((p.value / (total || 1)) * 100).toFixed(1)}%`,
        },
        labelLine: { length: LINE1, length2: LINE2, lineStyle: { width: 1 } },
        labelLayout: { hideOverlap: false },
        data: rows.map((x) => ({
          name: x.name,
          value: x.value,
          itemStyle: { color: x.color },
          label: x.show ? {} : { show: false },
          labelLine: x.show ? {} : { show: false },
        })),
      },
    ],
  };
});
</script>

<template>
  <div ref="root" class="alloc-donut" :style="{ height: height + 'px' }">
    <v-chart v-if="layout.rows.length" ref="chart" :option="option" autoresize />
    <div v-else class="empty">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
.alloc-donut { position: relative; width: 100%; }
.empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 14px; }
</style>
