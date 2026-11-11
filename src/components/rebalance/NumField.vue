<script setup lang="ts">
// Outlined number input ("Target Allocation  33.17  %"). Keeps what you type while focused,
// emits each valid number as you go, and emits null when left empty (= back to the default).
import { computed, ref } from 'vue';

const props = defineProps<{ modelValue: number; label: string; prefix?: string; suffix?: string; decimals?: number; min?: number }>();
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

const focused = ref(false);
const draft = ref('');

function fmt(v: number): string {
  if (!isFinite(v)) return '';
  return props.decimals == null ? String(+v.toFixed(6)) : v.toFixed(props.decimals);
}
const shown = computed(() => (focused.value ? draft.value : fmt(props.modelValue)));

function parse(s: string): number | null {
  const t = s.replace(/[,\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}

function onFocus() {
  draft.value = fmt(props.modelValue);
  focused.value = true;
}
function onInput(s: string) {
  draft.value = s ?? '';
  const n = parse(draft.value);
  if (n != null) emit('update:modelValue', props.min != null ? Math.max(props.min, n) : n);
}
function onBlur() {
  if (!draft.value.trim()) emit('update:modelValue', null);
  focused.value = false;
}
</script>

<template>
  <v-text-field
    class="num-field"
    :model-value="shown"
    :label="label"
    :prefix="prefix"
    :suffix="suffix"
    variant="outlined"
    density="compact"
    hide-details
    inputmode="decimal"
    autocomplete="off"
    @update:model-value="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown.enter="($event.target as HTMLInputElement).blur()"
  />
</template>

<style scoped lang="scss">
.num-field {
  :deep(.v-field) { border-radius: 10px; font-size: 16px; --v-field-padding-start: 14px; --v-field-padding-end: 14px; }
  :deep(.v-field__outline) { --v-field-border-opacity: 0.55; color: var(--text-2); }
  :deep(.v-field--focused .v-field__outline) { color: var(--primary); --v-field-border-opacity: 1; }
  :deep(input) { font-size: 16px; color: var(--text); min-width: 0; }
  :deep(.v-field-label) { color: var(--text-2); opacity: 1; }
  :deep(.v-field-label--floating) { font-size: 12.5px; }
  :deep(.v-text-field__prefix), :deep(.v-text-field__suffix) { color: var(--text-2); opacity: 1; font-size: 16px; }
  :deep(.v-text-field__suffix) { margin-left: auto; padding-left: 6px; }
}
</style>
