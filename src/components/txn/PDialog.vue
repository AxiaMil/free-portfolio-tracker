<script setup lang="ts">
// Dialog shell in the app's style (dark card, title row with close button, text-button footer).
import { useDisplay } from 'vuetify';

withDefaults(defineProps<{ title: string; step?: string; maxWidth?: number | string; fullscreenMobile?: boolean; persistent?: boolean }>(), { maxWidth: 520 });
const model = defineModel<boolean>({ default: false });
const { mdAndUp } = useDisplay();
</script>

<template>
  <v-dialog v-model="model" :max-width="maxWidth" :fullscreen="fullscreenMobile && !mdAndUp" :persistent="persistent" scrollable>
    <v-card class="pdlg" :class="{ full: fullscreenMobile && !mdAndUp }">
      <div class="pd-head">
        <div class="pd-titles">
          <div v-if="step" class="pd-step">{{ step }}</div>
          <div class="pd-title">{{ title }}</div>
        </div>
        <slot name="head-extra" />
        <button class="pd-x" aria-label="Close" @click="model = false"><v-icon>mdi-close</v-icon></button>
      </div>
      <v-card-text class="pd-body"><slot /></v-card-text>
      <div v-if="$slots.actions" class="pd-foot"><slot name="actions" /></div>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.pdlg { background: var(--surface-2) !important; border-radius: 12px !important; color: var(--text); }
// full screen on phones: the header clear of the status bar, the buttons clear of the home bar
.pdlg.full { border-radius: 0 !important; padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); }
.pd-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px 14px 24px; border-bottom: 1px solid var(--border); }
.pd-titles { flex: 1; min-width: 0; }
.pd-step { color: var(--primary-text); font-weight: 700; font-size: 12px; letter-spacing: 0.6px; text-transform: uppercase; }
.pd-title { font-size: 19px; font-weight: 600; line-height: 26px; }
.pd-x { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; padding: 4px; border-radius: 50%; &:hover { background: var(--line-soft); } }
.pd-body { padding: 18px 24px !important; font-size: 14px; line-height: 21px; color: var(--text); }
.pd-foot { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
.pd-foot :deep(.tbtn) { background: none; border: 0; color: var(--text-2); font: 700 14px/1 var(--font); letter-spacing: 1.1px; cursor: pointer; padding: 10px 12px; border-radius: 8px; &:hover { background: var(--hover); } &:disabled { opacity: 0.4; cursor: default; } }
.pd-foot :deep(.tbtn.primary) { color: var(--primary-text); }
.pd-foot :deep(.tbtn.danger) { color: var(--neg); }
</style>
