<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { useDisplay } from 'vuetify';
import { useRoute } from 'vue-router';
import { NAV, TOOLS, MANAGE } from './router.ts';
import { store, refreshMarket, openAddTransaction } from './store.ts';
import AddTransactionDialog from './components/AddTransactionDialog.vue';
import HelpDialog from './components/HelpDialog.vue';
import AppLogo from './components/AppLogo.vue';
import { applyAppearance } from './appearance.ts';
import { DEFAULT_THEME } from './theme.ts';
import { useHideOnScroll } from './composables/useHideOnScroll.ts';

const { mdAndUp } = useDisplay();
const route = useRoute();
const rail = ref(false);
const toolsOpen = ref(true);
const manageOpen = ref(true);

const MOBILE_TABS = [
  { icon: 'mdi-home', to: '/portfolio' },
  { icon: 'mdi-chart-areaspline-variant', to: '/performance' },
  { icon: 'mdi-chart-donut', to: '/allocation' },
  { icon: 'mdi-cash', to: '/dividend' },
  { icon: 'mdi-file-document-multiple', to: '/transactions' },
  { icon: 'mdi-menu', to: '/menu' },
];

// phone: the bottom navigation, + and refresh slide away while scrolling down
const phone = computed(() => !mdAndUp.value);
const barsHidden = useHideOnScroll(phone, () => route.path);
// settings pages (Menu → a section) have nothing to add or refresh, and the buttons would sit on their text
const showFabs = computed(() => !/^\/menu\/./.test(route.path));

const isActive = (to: string) => (to === '/allocation' ? route.path === '/allocation' : route.path === to || route.path.startsWith(to + '/'));

async function onRefresh() {
  await refreshMarket(true);
}
const reload = () => location.reload();
watch(() => route.path, () => { store.helpOpen = false; });
// apply the saved theme + accent on startup and whenever they change; pages remount so charts pick up new colours
const themeName = ref<string>(DEFAULT_THEME);
watchEffect(() => { themeName.value = applyAppearance(store.state?.preferences.theme, store.state?.preferences.accent); });
</script>

<template>
  <v-app>
    <!-- desktop sidebar -->
    <v-navigation-drawer v-if="mdAndUp" permanent :rail="rail" :width="215" rail-width="64" class="sidebar">
      <div class="brand" :class="{ rail }">
        <router-link v-if="!rail" to="/portfolio" class="brand-link" aria-label="Home">
          <AppLogo />
          <span class="brand-name">PORTFOLIO</span>
        </router-link>
        <v-tooltip :text="rail ? 'Expand menu' : 'Collapse menu'" location="right">
          <template #activator="{ props }">
            <button v-bind="props" class="collapse" :aria-label="rail ? 'Expand menu' : 'Collapse menu'" @click="rail = !rail">
              <AppLogo v-if="rail" />
              <v-icon size="18">{{ rail ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left' }}</v-icon>
            </button>
          </template>
        </v-tooltip>
      </div>
      <nav class="nav">
        <router-link v-for="n in NAV" :key="n.to" :to="n.to" class="nav-item" :class="{ active: isActive(n.to) }">
          <v-icon size="20">{{ n.icon }}</v-icon><span v-if="!rail">{{ n.title }}</span>
        </router-link>
        <button class="nav-group" @click="toolsOpen = !toolsOpen">
          <span v-if="!rail">TOOLS</span><v-icon size="16">{{ toolsOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
        </button>
        <template v-if="toolsOpen">
          <router-link v-for="n in TOOLS" :key="n.to" :to="n.to" class="nav-item" :class="{ active: isActive(n.to) }">
            <v-icon size="20">{{ n.icon }}</v-icon><span v-if="!rail">{{ n.title }}</span>
          </router-link>
        </template>
        <button class="nav-group" @click="manageOpen = !manageOpen">
          <span v-if="!rail">MANAGE</span><v-icon size="16">{{ manageOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
        </button>
        <template v-if="manageOpen">
          <router-link v-for="n in MANAGE" :key="n.to" :to="n.to" class="nav-item" :class="{ active: isActive(n.to) }">
            <v-icon size="20">{{ n.icon }}</v-icon><span v-if="!rail">{{ n.title }}</span>
          </router-link>
        </template>
      </nav>
      <template #append>
        <div class="help-row">
          <button class="nav-item" @click="store.helpOpen = true"><v-icon size="20">mdi-help-circle-outline</v-icon><span v-if="!rail">Help</span></button>
        </div>
      </template>
    </v-navigation-drawer>

    <!-- desktop: floating actions, top right -->
    <div v-if="mdAndUp" class="topbar">
      <v-tooltip text="Add transaction"><template #activator="{ props }"><button v-bind="props" class="round-btn" aria-label="Add transaction" @click="openAddTransaction()"><v-icon size="20">mdi-plus</v-icon></button></template></v-tooltip>
      <v-tooltip :text="store.offline ? 'Offline: showing cached prices. Click to retry' : 'Refresh prices'"><template #activator="{ props }">
        <button v-bind="props" class="round-btn" :class="{ spinning: store.refreshing, offline: store.offline }" aria-label="Refresh prices" @click="onRefresh"><v-icon size="20">mdi-refresh</v-icon></button>
      </template></v-tooltip>
      <v-tooltip text="Help"><template #activator="{ props }"><button v-bind="props" class="round-btn" aria-label="Help" @click="store.helpOpen = true"><v-icon size="20">mdi-help</v-icon></button></template></v-tooltip>
    </div>

    <!-- phone: no top bar; refresh and add float above the bottom navigation -->
    <div v-else-if="showFabs" class="fabs" :class="{ away: barsHidden }" :inert="barsHidden || undefined">
      <button class="fab mini" :class="{ spinning: store.refreshing, offline: store.offline }" :aria-label="store.offline ? 'Offline: showing cached prices. Tap to retry' : 'Refresh prices'" data-test="fab-refresh" @click="onRefresh"><v-icon size="20">mdi-refresh</v-icon></button>
      <button class="fab main" aria-label="Add transaction" data-test="fab-add" @click="openAddTransaction()"><v-icon size="26">mdi-plus</v-icon></button>
    </div>

    <v-main :class="{ 'with-sidebar': mdAndUp }">
      <div v-if="store.loading" class="loading">
        <v-progress-circular indeterminate color="primary" size="44" />
        <div class="muted mt-4">Your performance is being updated</div>
        <!-- only the first open on a device downloads every price history; later opens start from the cache -->
        <div v-if="store.progress.total > 1" class="muted tnum load-count" aria-live="polite">Loading prices: {{ Math.min(store.progress.done, store.progress.total) }} of {{ store.progress.total }}</div>
      </div>
      <div v-else-if="store.error" class="loading fail" role="alert">
        <div class="fail-t">Your portfolio couldn't be loaded</div>
        <div class="muted fail-d">Nothing was changed or saved over it. ({{ store.error }})</div>
        <button class="outline-btn" @click="reload">Try again</button>
      </div>
      <router-view v-else v-slot="{ Component }">
        <component :is="Component" :key="route.path.startsWith('/menu') ? 'menu' : themeName" />
      </router-view>
    </v-main>

    <!-- mobile bottom navigation -->
    <nav v-if="!mdAndUp" class="bottom-nav" :class="{ away: barsHidden }" :inert="barsHidden || undefined">
      <router-link v-for="t in MOBILE_TABS" :key="t.to" :to="t.to" class="bn-item" :class="{ active: isActive(t.to) }">
        <v-icon size="22">{{ t.icon }}</v-icon>
      </router-link>
    </nav>

    <AddTransactionDialog />
    <HelpDialog v-model="store.helpOpen" />
    <v-snackbar v-model="store.snackbar.show" :class="{ 'snack-up': !mdAndUp && !barsHidden }" :color="store.snackbar.color || undefined" timeout="2600" location="bottom">{{ store.snackbar.text }}</v-snackbar>
  </v-app>
</template>

<style scoped lang="scss">
.sidebar :deep(.v-navigation-drawer__content) { display: flex; flex-direction: column; }
// brand row: the logo sits centred over the nav icons (12px nav padding + 14px item padding + 10px half icon = 36px)
.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 12px 0 22px;
  .brand-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text); }
  .brand-name { font-weight: 800; font-size: 17px; letter-spacing: 0.6px; line-height: 22px; }
  .collapse {
    position: relative;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 0;
    background: none;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    &:hover { background: var(--hover); color: var(--text); }
  }
  // collapsed: just the logo; hovering it reveals the expand chevrons
  &.rail {
    padding: 0;
    justify-content: center;
    .collapse {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      .app-logo, .v-icon { transition: opacity 0.15s ease; }
      .v-icon { position: absolute; inset: 0; margin: auto; opacity: 0; }
      &:hover .app-logo { opacity: 0; }
      &:hover .v-icon { opacity: 1; }
    }
  }
}
.sidebar.v-navigation-drawer--rail {
  .nav-item { justify-content: center; padding: 0; }
  .nav-group { justify-content: center; padding: 14px 0 4px; }
}
.nav { display: flex; flex-direction: column; gap: 2px; padding: 0 12px; }
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 10px 14px;
  border-radius: 10px;
  color: var(--text-2);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  background: none;
  border: 0;
  width: 100%;
  cursor: pointer;
  .v-icon { color: var(--text-2); }
  &:hover { background: var(--hover); color: var(--text); }
  &.active { background: var(--nav-active-bg); color: var(--nav-active-fg); font-weight: 600; .v-icon { color: var(--nav-active-fg); } }
}
.nav-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 6px;
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.66px;
  line-height: 16px;
  cursor: pointer;
  .v-icon { color: var(--muted); }
}
.help-row { border-top: 1px solid var(--border); padding: 8px 12px 12px; }
.topbar {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 1005;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px 0 0;
  pointer-events: none;
  > * { pointer-events: auto; }
}
.round-btn.spinning .v-icon, .fab.spinning .v-icon { animation: spin 0.9s linear infinite; }
.round-btn.offline, .fab.offline { border-color: var(--warn); color: var(--warn); }
@keyframes spin { to { transform: rotate(360deg); } }
// phone chrome hides while scrolling down: an iOS-drawer curve, transform only, under 300ms
$ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
.bottom-nav, .fabs { transition: transform 240ms $ease-drawer, opacity 240ms $ease-drawer; }
.bottom-nav.away { transform: translateY(100%); }
// the buttons sit 72px above the screen edge (nav + gap), so move them their own height plus that
.fabs.away { transform: translateY(calc(100% + 72px + env(safe-area-inset-bottom))); }
@media (prefers-reduced-motion: reduce) {
  // no sliding: they simply fade out and back in
  .bottom-nav, .fabs { transition: opacity 150ms ease; }
  .bottom-nav.away, .fabs.away { transform: none; opacity: 0; pointer-events: none; }
}
// phone: refresh (small) stacked over add (large), right side, just above the bottom navigation
.fabs {
  position: fixed;
  right: 16px;
  bottom: calc(56px + 16px + env(safe-area-inset-bottom));
  z-index: 1006;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease, filter 0.15s ease;
  &:active { transform: scale(0.94); }
  .v-icon { color: inherit; }
  &.main { width: 56px; height: 56px; border: 0; background: var(--primary); color: var(--primary-fg); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35), 0 4px 14px var(--primary-soft); }
  &.mini { width: 44px; height: 44px; border: 1px solid var(--border-strong); background: color-mix(in srgb, var(--surface-2) 92%, transparent); color: var(--text-2); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
}
.snack-up :deep(.v-snackbar__wrapper) { margin-bottom: calc(68px + env(safe-area-inset-bottom)); }
.loading { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.load-count { margin-top: 4px; font-size: 12.5px; }
.fail { gap: 10px; padding: 0 24px; text-align: center; }
.fail-t { font-size: 17px; font-weight: 600; }
.fail-d { max-width: 420px; font-size: 13.5px; line-height: 20px; margin-bottom: 6px; }
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1006;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  height: 56px;
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
  .bn-item {
    text-decoration: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    .v-icon { color: var(--text); }
    .v-icon { transition: color 0.15s ease; }
    &.active { background: var(--nav-active-bg); .v-icon { color: var(--primary); } }
  }
}
:deep(.v-main) { padding-top: 0; }
.v-main:not(.with-sidebar) { padding-top: env(safe-area-inset-top) !important; }
</style>
