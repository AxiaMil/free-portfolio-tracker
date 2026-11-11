<script setup lang="ts">
// Settings (/menu, /menu/:section). Desktop: account cards (sections open in a dialog), portfolio settings, all reports.
// Phone: the menu list; /menu/<section> opens that section as its own screen.
import { computed, nextTick, onMounted, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRoute, useRouter } from 'vue-router';
import { store } from '../store.ts';
import { num } from '../format.ts';
import PDialog from '../components/txn/PDialog.vue';
import SectionDisplay from '../components/settings/SectionDisplay.vue';
import SectionCalc from '../components/settings/SectionCalc.vue';
import SectionAppearance from '../components/settings/SectionAppearance.vue';
import SectionData from '../components/settings/SectionData.vue';
import PortfolioSettings from '../components/settings/PortfolioSettings.vue';
import { REPORTS, SECTIONS, sectionKey, type SectionKey } from '../components/settings/reports.ts';

const { mdAndUp } = useDisplay();
const route = useRoute();
const router = useRouter();

const section = computed<SectionKey | null>(() => sectionKey(route.params.section));
const COMPONENTS = { display: SectionDisplay, calculation: SectionCalc, appearance: SectionAppearance, data: SectionData } as const;
const TITLES: Record<SectionKey, string> = { portfolio: 'Portfolio Settings', display: 'Display Preferences', calculation: 'Calculation Methods', appearance: 'Appearance', data: 'Data & Backup' };

// desktop: account sections open in a dialog over the page; closing it goes back to /menu
const dialogOpen = computed({
  get: () => mdAndUp.value && !!section.value && section.value !== 'portfolio',
  set: (v: boolean) => { if (!v) router.push('/menu'); },
});

const formatSample = computed(() => num(1234567.89, 2));
function cardDesc(key: SectionKey, desc: string): string {
  if (key === 'display') return `${desc} (${formatSample.value})`;
  return desc;
}

const stats = computed(() => {
  const ps = store.state?.portfolios ?? [];
  const n = ps.reduce((s, p) => s + p.transactions.length, 0);
  return `${ps.length} portfolio${ps.length === 1 ? '' : 's'} · ${n} transaction${n === 1 ? '' : 's'}`;
});

const PHONE_ITEMS: Array<{ key: SectionKey; title: string; icon: string }> = [
  { key: 'portfolio', title: 'Portfolio Settings', icon: 'mdi-cog' },
  { key: 'display', title: 'Display Preferences', icon: 'mdi-tune-variant' },
  { key: 'calculation', title: 'Calculation Methods', icon: 'mdi-calculator' },
  { key: 'appearance', title: 'Appearance', icon: 'mdi-palette-outline' },
  { key: 'data', title: 'Data & Backup', icon: 'mdi-database-outline' },
];

async function scrollToPortfolio() {
  if (!mdAndUp.value || section.value !== 'portfolio') return;
  await nextTick();
  document.getElementById('portfolio-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
watch(section, scrollToPortfolio);
onMounted(() => {
  scrollToPortfolio();
});
</script>

<template>
  <!-- ================= desktop ================= -->
  <div v-if="mdAndUp" class="page menu">
    <h2 class="h">Account Settings</h2>
    <div class="grid3">
      <router-link v-for="s in SECTIONS" :key="s.key" :to="`/menu/${s.key}`" class="scard" :data-test="`section-${s.key}`">
        <div class="sc-t"><v-icon size="23" class="sc-ic">{{ s.icon }}</v-icon><span>{{ s.title }}</span><v-icon size="20" class="chev">mdi-chevron-right</v-icon></div>
        <div class="sc-d">{{ cardDesc(s.key, s.desc) }}</div>
      </router-link>
    </div>

    <h2 id="portfolio-settings" class="h mt">Portfolio Settings</h2>
    <div class="grid1"><PortfolioSettings :expand-active="section === 'portfolio'" /></div>

    <h2 class="h mt">All Reports</h2>
    <div class="grid3">
      <router-link v-for="r in REPORTS" :key="r.to" :to="r.to" class="scard">
        <div class="sc-t"><v-icon size="23" class="sc-ic">{{ r.icon }}</v-icon><span>{{ r.title }}</span><v-icon size="20" class="chev">mdi-chevron-right</v-icon></div>
        <div class="sc-d">{{ r.desc }}</div>
      </router-link>
    </div>

    <PDialog v-model="dialogOpen" :title="section ? TITLES[section] : ''" step="Account Settings" :max-width="section === 'data' ? 640 : 560">
      <component :is="COMPONENTS[section as keyof typeof COMPONENTS]" v-if="section && section !== 'portfolio'" />
    </PDialog>
  </div>

  <!-- ================= phone: one section ================= -->
  <div v-else-if="section" class="page msec">
    <div class="ms-head">
      <button class="back" aria-label="Back to menu" @click="router.push('/menu')"><v-icon>mdi-arrow-left</v-icon></button>
      <h1 class="ms-title">{{ TITLES[section] }}</h1>
    </div>
    <PortfolioSettings v-if="section === 'portfolio'" expand-active />
    <component :is="COMPONENTS[section]" v-else />
  </div>

  <!-- ================= phone: menu ================= -->
  <div v-else class="page mmenu">
    <div class="profile">
      <div class="pav">{{ store.state?.preferences.userInitial || 'A' }}</div>
      <div class="pinfo">
        <div class="p1">Local profile</div>
        <div class="p2">{{ stats }}</div>
        <div class="p2">Saved on this computer</div>
      </div>
    </div>
    <nav class="mlist">
      <router-link v-for="it in PHONE_ITEMS" :key="it.key" :to="`/menu/${it.key}`" class="mi">
        <v-icon size="24">{{ it.icon }}</v-icon><span>{{ it.title }}</span><v-icon size="22" class="mchev">mdi-chevron-right</v-icon>
      </router-link>
    </nav>
    <div class="divider" />
    <div class="mh">All reports</div>
    <nav class="mlist">
      <router-link v-for="r in REPORTS" :key="r.to" :to="r.to" class="ri"><v-icon size="24">{{ r.icon }}</v-icon><span>{{ r.title }}</span></router-link>
    </nav>
  </div>
</template>

<style scoped lang="scss">
/* desktop */
.page.menu { max-width: 1078px; }
.h { font-size: 20px; font-weight: 600; line-height: 28px; letter-spacing: 0.1px; color: var(--text); margin: 0; }
.h.mt { margin-top: 23px; scroll-margin-top: 80px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.grid1 { margin-top: 12px; }
.scard {
  display: block; min-height: 96px; padding: 10px 18px 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg); color: var(--text); text-decoration: none;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  &:hover { background: var(--surface); border-color: var(--border-strong); .chev { transform: translateX(2px); } }
}
.sc-t { display: flex; align-items: center; gap: 10px; height: 24px; font-size: 16.5px; font-weight: 500; color: var(--text); }
.sc-ic { color: var(--primary); }
.chev { margin-left: -6px; color: var(--text); transition: transform 0.15s ease; }
.sc-d { margin-top: 4px; font-size: 14px; line-height: 20px; letter-spacing: 0.25px; color: var(--text-2); }

/* phone menu */
.mmenu { padding-left: 36px !important; padding-right: 36px !important; }
.profile { display: flex; align-items: center; gap: 36px; margin-top: 8px; }
.pav { width: 56px; height: 56px; flex: none; border-radius: 50%; background: var(--nav-active-bg); color: var(--text); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 19px; letter-spacing: 1px; }
.pinfo { min-width: 0; }
.p1 { font-size: 16.5px; line-height: 22px; color: var(--text); }
.p2 { font-size: 12.5px; line-height: 20px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mlist { display: flex; flex-direction: column; }
.profile + .mlist { margin-top: 23px; }
.mi, .ri { display: flex; align-items: center; height: 41.5px; color: var(--text); text-decoration: none; font-size: 16px; .v-icon { color: var(--text); } }
.mi span { margin-left: 9px; flex: 1; }
.ri span { margin-left: 13px; }
.mi:active, .ri:active { opacity: 0.7; }
.mchev { margin-right: 0; }
.divider { height: 1px; background: var(--border-strong); margin: 12px 0 0; }
.mh { margin-top: 20px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 20px; color: var(--text-2); }

/* phone section */
.ms-head { display: flex; align-items: center; gap: 8px; margin: 14px 0 18px; }
.back { background: none; border: 0; color: var(--text); cursor: pointer; display: inline-flex; padding: 6px; margin-left: -6px; border-radius: 50%; }
.ms-title { font-size: 20px; font-weight: 500; line-height: 28px; margin: 0; }
</style>
