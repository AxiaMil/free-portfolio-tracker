<script setup lang="ts">
// App mark (same artwork as public/logo.svg), tinted with the current accent colour.
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <svg class="app-logo" viewBox="0 0 512 512" :width="size" :height="size" aria-hidden="true">
    <rect width="512" height="512" rx="128" fill="currentColor" />
    <g fill="var(--primary-fg)" fill-opacity="0.22">
      <rect x="110" y="360" width="52" height="52" rx="14" /><rect x="196" y="300" width="52" height="112" rx="14" />
      <rect x="282" y="330" width="52" height="82" rx="14" /><rect x="368" y="230" width="52" height="182" rx="14" />
    </g>
    <path d="M104 344 L196 252 L262 300 L404 160" fill="none" stroke="var(--primary-fg)" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="404" cy="160" r="32" fill="var(--primary-fg)" />
  </svg>
</template>

<style scoped>
.app-logo { color: var(--primary); flex: none; display: block; filter: drop-shadow(0 4px 10px var(--primary-soft)); }
</style>
