<script setup lang="ts">
import { palette, alpha } from '../theme.ts';
// Export: charts as PNG (via the ECharts instance) or tables as CSV.
const props = defineProps<{ label?: string; chart?: any; csv?: () => Array<Array<string | number>>; filename?: string; icon?: boolean }>();

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

function share() {
  const name = props.filename ?? 'portfolio';
  if (props.chart) {
    const inst = props.chart.value ?? props.chart;
    const url = inst?.getDataURL?.({ type: 'png', pixelRatio: 2, backgroundColor: palette.surface });
    if (url) return download(url, `${name}.png`);
  }
  if (props.csv) {
    const rows = props.csv();
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(URL.createObjectURL(new Blob([text], { type: 'text/csv' })), `${name}.csv`);
  }
}
</script>

<template>
  <button v-if="icon" class="outline-btn icon" :aria-label="label ?? 'Share'" @click="share"><v-icon size="20">mdi-export-variant</v-icon></button>
  <button v-else class="outline-btn" @click="share"><v-icon size="18">mdi-export-variant</v-icon>{{ label ?? 'Share' }}</button>
</template>
