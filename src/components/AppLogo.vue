<script setup lang="ts">
// App mark: three rising bars, each in its own blue gradient (same artwork as public/logo.svg). The colours come from
// the theme (--logo-*, src/theme.ts): the original blues on the light theme, a brighter set on the dark themes so the
// darkest bar still stands out. The colours are set in CSS, never through element.style.
import { useId } from 'vue';

withDefaults(defineProps<{ size?: number }>(), { size: 26 });
const id = useId();
const BARS = [
  { x: 85, y: 256, h: 170 },
  { x: 213, y: 171, h: 255 },
  { x: 341, y: 85, h: 341 },
];
</script>

<template>
  <svg class="app-logo" viewBox="77 77 358 358" :width="size" :height="size" aria-hidden="true">
    <defs>
      <linearGradient v-for="(b, i) in BARS" :id="`${id}-${i}`" :key="i" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :class="`s${i + 1}a`" />
        <stop offset="1" :class="`s${i + 1}b`" />
      </linearGradient>
    </defs>
    <rect v-for="(b, i) in BARS" :key="i" :x="b.x" :y="b.y" width="85" :height="b.h" rx="18" :fill="`url(#${id}-${i})`" />
  </svg>
</template>

<style scoped>
.app-logo { flex: none; display: block; }
.s1a { stop-color: var(--logo-1a, #63B5F2); }
.s1b { stop-color: var(--logo-1b, #2D9CE7); }
.s2a { stop-color: var(--logo-2a, #4C8FDB); }
.s2b { stop-color: var(--logo-2b, #1F75D2); }
.s3a { stop-color: var(--logo-3a, #3B79DB); }
.s3b { stop-color: var(--logo-3b, #1A5AC5); }
</style>
