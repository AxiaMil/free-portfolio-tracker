<script setup lang="ts">
// Yes/no confirmation used before anything destructive (delete, restore, ...).
import PDialog from './PDialog.vue';

withDefaults(defineProps<{ title: string; text?: string; confirmText?: string; danger?: boolean }>(), { confirmText: 'Delete', danger: true });
const model = defineModel<boolean>({ default: false });
const emit = defineEmits<{ (e: 'confirm'): void }>();

function ok() {
  emit('confirm');
  model.value = false;
}
</script>

<template>
  <PDialog v-model="model" :title="title" :max-width="460">
    <p v-if="text" class="ctext">{{ text }}</p>
    <slot />
    <template #actions>
      <v-spacer />
      <button class="tbtn" @click="model = false">Cancel</button>
      <button class="tbtn" :class="danger ? 'danger' : 'primary'" data-test="confirm" @click="ok">{{ confirmText }}</button>
    </template>
  </PDialog>
</template>

<style scoped>
.ctext { margin: 0; white-space: pre-line; }
</style>
