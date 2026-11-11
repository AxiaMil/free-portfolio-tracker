<script setup lang="ts">
defineProps<{ text: string; size?: number; icon?: string }>();
</script>

<template>
  <v-tooltip :text="text" max-width="340">
    <template #activator="{ props }">
      <v-icon v-bind="props" :size="size ?? 18" class="help-tip" aria-label="More info">{{ icon ?? 'mdi-help-circle-outline' }}</v-icon>
    </template>
  </v-tooltip>
</template>

<style scoped>
.help-tip { color: var(--muted); cursor: help; vertical-align: middle; }
</style>
