<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// "Share" menu for pages with several charts: one PNG with the charts side by side, or the numbers as CSV.
const props = defineProps<{ charts: Array<any>; csv?: () => Array<Array<string | number>>; filename: string; label?: string }>();

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function png() {
  const urls = props.charts
    .map((c) => (c?.value ?? c)?.getDataURL?.({ type: 'png', pixelRatio: 2, backgroundColor: palette.surface }) as string | undefined)
    .filter((u): u is string => !!u);
  if (!urls.length) return;
  const imgs = await Promise.all(urls.map(load));
  const canvas = document.createElement('canvas');
  canvas.width = imgs.reduce((s, i) => s + i.width, 0);
  canvas.height = Math.max(...imgs.map((i) => i.height));
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = palette.surface;
  g.fillRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  for (const i of imgs) { g.drawImage(i, x, 0); x += i.width; }
  download(canvas.toDataURL('image/png'), `${props.filename}.png`);
}

function csv() {
  if (!props.csv) return;
  const text = props.csv().map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  download(URL.createObjectURL(new Blob([text], { type: 'text/csv' })), `${props.filename}.csv`);
}
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props: act }">
      <button v-bind="act" class="outline-btn share-btn"><v-icon size="16">mdi-export-variant</v-icon>{{ label ?? 'Share' }}</button>
    </template>
    <v-list density="compact" min-width="190">
      <v-list-item prepend-icon="mdi-image-outline" @click="png">Charts as image</v-list-item>
      <v-list-item v-if="csv" prepend-icon="mdi-file-delimited-outline" @click="csv">Data as CSV</v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
.share-btn { height: 28px; padding: 0 12px; border-radius: 8px; font-size: 13px; letter-spacing: 1.1px; gap: 6px; }
</style>
