<script setup lang="ts">
// Appearance: theme (Midnight / Graphite / Paper) and accent colour.
// Both are preferences; App.vue applies them whenever they change.
import { computed } from 'vue';
import { store } from '../../store.ts';
import { THEMES, resolveTheme, type ThemeName } from '../../theme.ts';
import { ACCENTS, DEFAULT_ACCENT, usesThemeAccent } from './accent.ts';

const themes = Object.entries(THEMES).map(([key, t]) => ({ key: key as ThemeName, ...t }));
const theme = computed({
  get: () => resolveTheme(store.state?.preferences.theme),
  set: (v: ThemeName) => { if (store.state) store.state.preferences.theme = v; },
});
const themeAccent = computed(() => THEMES[theme.value].vars['--primary']);

const accent = computed({
  get: () => (usesThemeAccent(store.state?.preferences.accent) ? DEFAULT_ACCENT : store.state!.preferences.accent!.toUpperCase()),
  set: (v: string) => {
    if (!store.state || (v !== DEFAULT_ACCENT && !/^#[0-9a-f]{6}$/i.test(v))) return;
    store.state.preferences.accent = v.toUpperCase();
  },
});
const isCustom = computed(() => accent.value !== DEFAULT_ACCENT && !ACCENTS.some((a) => a.color === accent.value));
</script>

<template>
  <div class="sec">
    <div class="sec-h">Theme</div>
    <div class="themes">
      <button v-for="t in themes" :key="t.key" class="th" :class="{ on: theme === t.key }" :aria-pressed="theme === t.key" @click="theme = t.key">
        <span class="mini" :style="{ background: t.vars['--bg'], borderColor: t.vars['--border'] }">
          <span class="m-side" :style="{ background: t.vars['--sidebar'], borderColor: t.vars['--border'] }">
            <i :style="{ background: t.vars['--nav-active-bg'] }" /><i :style="{ background: t.vars['--line-soft'] }" /><i :style="{ background: t.vars['--line-soft'] }" />
          </span>
          <span class="m-card" :style="{ background: t.vars['--surface'], borderColor: t.vars['--border'] }">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none">
              <path d="M0 34 L14 30 L26 31 L40 24 L52 26 L66 16 L78 18 L100 6 L100 40 L0 40 Z" :fill="t.chart.portfolioFill" />
              <path d="M0 34 L14 30 L26 31 L40 24 L52 26 L66 16 L78 18 L100 6" fill="none" :stroke="t.chart.portfolio" stroke-width="2.2" vector-effect="non-scaling-stroke" />
            </svg>
            <span class="m-row"><b :style="{ background: t.vars['--pos'] }" /><b :style="{ background: t.vars['--neg'] }" /><b class="acc" :style="{ background: t.vars['--primary'] }" /></span>
          </span>
        </span>
        <span class="th-text">
          <span class="th-name">{{ t.label }}<v-icon v-if="theme === t.key" size="16" class="ck">mdi-check-circle</v-icon></span>
          <span class="th-desc">{{ t.description }}</span>
        </span>
      </button>
    </div>

    <div class="sec-h mt">Accent colour</div>
    <div class="swatches">
      <button class="sw" :class="{ on: accent === DEFAULT_ACCENT }" :style="{ '--c': themeAccent }" aria-label="Theme accent" :aria-pressed="accent === DEFAULT_ACCENT" @click="accent = DEFAULT_ACCENT">
        <span class="dot"><v-icon v-if="accent === DEFAULT_ACCENT" size="18">mdi-check</v-icon></span>
        <span class="nm">Theme</span>
      </button>
      <button v-for="a in ACCENTS" :key="a.color" class="sw" :class="{ on: accent === a.color }" :style="{ '--c': a.color }" :aria-label="a.name" :aria-pressed="accent === a.color" @click="accent = a.color">
        <span class="dot"><v-icon v-if="accent === a.color" size="18">mdi-check</v-icon></span>
        <span class="nm">{{ a.name }}</span>
      </button>
      <label class="sw custom" :class="{ on: isCustom }" :style="{ '--c': isCustom ? accent : 'var(--surface-3)' }">
        <span class="dot"><v-icon size="18">mdi-eyedropper-variant</v-icon></span>
        <span class="nm">Custom</span>
        <input type="color" :value="isCustom ? accent : themeAccent" aria-label="Custom accent colour" @input="accent = ($event.target as HTMLInputElement).value" />
      </label>
    </div>
    <div class="sec-h mt">Preview</div>
    <div class="preview">
      <span class="pv-nav"><v-icon size="18">mdi-file-document-multiple</v-icon>Transactions</span>
      <span class="pv-btn">+ Add Transaction</span>
      <span class="pv-pill"><span class="on">My Input</span><span>Adjusted</span></span>
    </div>
    <div class="row mt-4">
      <div class="r-d">Theme and accent are saved with your preferences. “Theme” uses the accent that belongs to the selected theme.</div>
      <button class="btn-outline" :disabled="accent === DEFAULT_ACCENT" @click="accent = DEFAULT_ACCENT">Reset</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
@media (max-width: 599px) { .themes { grid-template-columns: 1fr; } }
.th {
  display: flex; flex-direction: column; gap: 10px; padding: 8px 8px 12px; border: 1px solid var(--border); border-radius: 14px; background: transparent;
  color: var(--text); text-align: left; cursor: pointer; font: inherit; transition: border-color 0.15s ease, background-color 0.15s ease;
  &:hover { background: var(--hover); }
  &.on { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
}
@media (max-width: 599px) { .th { flex-direction: row; align-items: center; .mini { width: 128px; flex: none; } } }
.mini { display: flex; gap: 5px; height: 76px; padding: 5px; border: 1px solid; border-radius: 9px; overflow: hidden; }
.m-side { display: flex; flex-direction: column; gap: 4px; width: 24%; padding: 5px 4px; border: 1px solid; border-radius: 5px; i { display: block; height: 6px; border-radius: 3px; } }
.m-card { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding: 6px; border: 1px solid; border-radius: 5px; svg { width: 100%; height: 38px; display: block; } }
.m-row { display: flex; gap: 4px; b { display: block; width: 14px; height: 5px; border-radius: 3px; } .acc { margin-left: auto; width: 20px; } }
.th-text { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; }
.th-name { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; .ck { color: var(--primary); } }
.th-desc { font-size: 12px; line-height: 16px; color: var(--muted); }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
.sw { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px 8px; border: 1px solid var(--border); border-radius: 12px; background: transparent; color: var(--text-2); cursor: pointer; font: 12px var(--font); &:hover { background: var(--hover); } &.on { border-color: var(--c); color: var(--text); } }
.dot { width: 30px; height: 30px; border-radius: 50%; background: var(--c); display: flex; align-items: center; justify-content: center; .v-icon { color: #fff; } }
.custom .dot .v-icon { color: var(--text); }
.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.preview { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }
.pv-nav { display: inline-flex; align-items: center; gap: 10px; height: 40px; padding: 0 14px; border-radius: 10px; background: var(--nav-active-bg); color: var(--nav-active-fg); font-weight: 600; font-size: 14px; .v-icon { color: var(--nav-active-fg); } }
.pv-btn { display: inline-flex; align-items: center; height: 36px; padding: 0 16px; border-radius: 10px; background: var(--primary); color: var(--primary-fg); font-weight: 600; font-size: 13.5px; }
.pv-pill { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--pill-bg); box-shadow: inset 0 0 0 1px var(--line-soft); font-size: 12.5px; span { padding: 4px 12px; border-radius: 999px; color: var(--muted); } .on { background: var(--pill-active); color: var(--text); font-weight: 600; } }
.btn-outline:disabled { opacity: 0.4; cursor: default; }
</style>
