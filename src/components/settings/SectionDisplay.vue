<script setup lang="ts">
// Display Preferences: number format, privacy mode (hide values) and the avatar initial.
import { computed } from 'vue';
import { store, result } from '../../store.ts';
import { money } from '../../format.ts';
import type { Preferences } from '../../engine/types.ts';

const FORMATS: Array<{ t: Preferences['thousandSeparator']; d: Preferences['decimalSeparator']; sample: string; note: string }> = [
  { t: ',', d: '.', sample: '1,234,567.89', note: 'Comma thousands, dot decimals' },
  { t: '.', d: ',', sample: '1.234.567,89', note: 'Dot thousands, comma decimals' },
  { t: ' ', d: ',', sample: '1 234 567,89', note: 'Space thousands, comma decimals' },
  { t: ' ', d: '.', sample: '1 234 567.89', note: 'Space thousands, dot decimals' },
  { t: "'", d: '.', sample: "1'234'567.89", note: 'Apostrophe thousands, dot decimals' },
];
const prefs = computed(() => store.state?.preferences);
const isOn = (f: (typeof FORMATS)[number]) => prefs.value?.thousandSeparator === f.t && prefs.value?.decimalSeparator === f.d;
function setFormat(f: (typeof FORMATS)[number]) {
  if (!prefs.value) return;
  prefs.value.thousandSeparator = f.t;
  prefs.value.decimalSeparator = f.d;
}
const initial = computed({
  get: () => prefs.value?.userInitial ?? '',
  set: (v: string) => { if (prefs.value) prefs.value.userInitial = (v || '').trim().slice(0, 2).toUpperCase(); },
});
const hide = computed({ get: () => !!prefs.value?.hideValues, set: (v: boolean) => { if (prefs.value) prefs.value.hideValues = v; } });
const preview = computed(() => money(result.value?.value ?? 1234567.89));
</script>

<template>
  <div v-if="prefs" class="sec">
    <div class="sec-h">Number format</div>
    <div class="opts">
      <button v-for="f in FORMATS" :key="f.sample" class="opt" :class="{ on: isOn(f) }" :aria-pressed="isOn(f)" @click="setFormat(f)">
        <v-icon size="20" class="radio">{{ isOn(f) ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}</v-icon>
        <span class="o-main">{{ f.sample }}</span>
        <span class="o-note">{{ f.note }}</span>
      </button>
    </div>
    <div class="preview">Portfolio value shows as <b>{{ preview }}</b></div>

    <div class="sec-h mt">Privacy</div>
    <div class="row">
      <div>
        <div class="r-t">Hide values</div>
        <div class="r-d">Mask amounts and share counts everywhere (same as the eye icon next to "My Portfolio").</div>
      </div>
      <v-switch v-model="hide" color="primary" hide-details inset density="compact" aria-label="Hide values" />
    </div>

    <div class="sec-h mt">Avatar</div>
    <div class="row">
      <div class="avatar">{{ prefs.userInitial || 'A' }}</div>
      <v-text-field v-model="initial" label="Initials" maxlength="2" density="compact" hide-details class="init" />
      <div class="r-d">One or two letters shown in the round avatar.</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.opts { display: flex; flex-direction: column; gap: 6px; }
.opt { display: grid; grid-template-columns: 28px 150px 1fr; align-items: center; gap: 6px; width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--text); text-align: left; cursor: pointer; font: 15px var(--font); &:hover { background: var(--hover); } &.on { border-color: var(--primary); background: var(--primary-soft); .radio { color: var(--primary); } } }
.radio { color: var(--muted); }
.o-main { font-weight: 500; letter-spacing: 0.3px; }
.o-note { font-size: 12.5px; color: var(--text-2); }
.preview { margin-top: 10px; font-size: 13px; color: var(--text-2); b { color: var(--text); font-weight: 600; } }
.avatar { width: 40px; height: 40px; flex: none; border-radius: 50%; background: var(--nav-active-bg); color: var(--text); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; }
.init { width: 120px; flex: none; }
@media (max-width: 599px) { .opt { grid-template-columns: 28px 1fr; .o-note { grid-column: 2; } } }
</style>
