<script setup lang="ts" generic="T extends string">
defineProps<{ options: readonly (T | { value: T; label: string; disabled?: boolean })[]; size?: 'sm' | 'md' }>();
const model = defineModel<T>({ required: true });
const val = (o: any) => (typeof o === 'string' ? o : o.value);
const lab = (o: any) => (typeof o === 'string' ? o : o.label);
</script>

<template>
  <div class="pill-group" :class="size === 'sm' ? 'sm' : ''" role="tablist">
    <button
      v-for="o in options"
      :key="val(o)"
      type="button"
      role="tab"
      class="pill"
      :class="{ active: model === val(o) }"
      :aria-selected="model === val(o)"
      :disabled="typeof o !== 'string' && o.disabled"
      @click="model = val(o)"
    >
      <slot name="label" :option="val(o)">{{ lab(o) }}</slot>
    </button>
  </div>
</template>
