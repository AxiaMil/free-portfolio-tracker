// Applies the saved look: theme (colours, fonts, chart palette, Vuetify light/dark) and the optional accent override.
import vuetify from './plugins/vuetify.ts';
import { applyThemeVars, resolveTheme, type ThemeName } from './theme.ts';
import { syncChartTheme } from './charts.ts';
import { applyAccent } from './components/settings/accent.ts';

export function applyAppearance(theme: string | null | undefined, accent: string | null | undefined): ThemeName {
  const name = resolveTheme(theme);
  const def = applyThemeVars(name);
  syncChartTheme();
  const vt = vuetify.theme.themes.value[def.dark ? 'trackerDark' : 'trackerLight'];
  const v = def.vars;
  if (vt) {
    Object.assign(vt.colors, {
      background: v['--bg'], surface: v['--surface-2'], 'on-surface': v['--text'], 'on-background': v['--text'],
      success: v['--pos'], error: v['--neg'], warning: v['--warn'], secondary: v['--pill-active'],
      ...(def.dark ? { 'surface-variant': v['--surface-3'], 'on-surface-variant': v['--text'] } : {}),
    });
  }
  vuetify.theme.change(def.dark ? 'trackerDark' : 'trackerLight');
  applyAccent(accent, def.vars, def.dark);
  return name;
}
