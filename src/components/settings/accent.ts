// Accent colour: applies preferences.accent to the Vuetify theme + the CSS variables the app uses.
// App.vue applies it (via appearance.ts) on startup and whenever the preference changes.
import vuetify from '../../plugins/vuetify.ts';

export const ACCENTS = [
  { name: 'Violet', color: '#7C5CFF' },
  { name: 'Indigo', color: '#5B6CFF' },
  { name: 'Blue', color: '#2F80ED' },
  { name: 'Teal', color: '#14B8A6' },
  { name: 'Green', color: '#22A55B' },
  { name: 'Amber', color: '#F59E0B' },
  { name: 'Orange', color: '#F97316' },
  { name: 'Pink', color: '#EC4899' },
  { name: 'Rose', color: '#E11D48' },
];
/** '' (or the old default below) means: use the theme's own accent */
export const DEFAULT_ACCENT = '';
const LEGACY_DEFAULT = '#7C4DFF';

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
/** mix colour a towards b by t (0..1) */
function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

const toRgba = (c: [number, number, number], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

export function accentShades(color: string, dark = true) {
  const c = hexToRgb(color) ?? hexToRgb(LEGACY_DEFAULT)!;
  return {
    primary: toHex(...c),
    soft: toRgba(c, dark ? 0.14 : 0.1),
    navBg: toRgba(c, dark ? 0.14 : 0.09),
    navFg: dark ? mix(c, [255, 255, 255], 0.42) : toHex(...c),
    text: dark ? mix(c, [255, 255, 255], 0.35) : toHex(...c),
  };
}

/** true when the user hasn't picked their own accent (the theme's accent is used) */
export const usesThemeAccent = (color: string | null | undefined) => !color || !hexToRgb(color) || color.toUpperCase() === LEGACY_DEFAULT;

/** applies the accent on top of the current theme (call after applyThemeVars) */
export function applyAccent(color: string | null | undefined, themeVars?: Record<string, string>, dark = true) {
  const root = document.documentElement.style;
  const vars = themeVars ?? {};
  const s = usesThemeAccent(color)
    ? { primary: vars['--primary'], soft: vars['--primary-soft'], navBg: vars['--nav-active-bg'], navFg: vars['--nav-active-fg'], text: vars['--primary-text'] }
    : accentShades(color!, dark);
  if (s.primary) root.setProperty('--primary', s.primary);
  if (s.soft) root.setProperty('--primary-soft', s.soft);
  if (s.navBg) root.setProperty('--nav-active-bg', s.navBg);
  if (s.navFg) root.setProperty('--nav-active-fg', s.navFg);
  if (s.text) root.setProperty('--primary-text', s.text);
  for (const name of ['trackerDark', 'trackerLight']) {
    const t = vuetify.theme.themes.value[name];
    if (t && s.primary) t.colors.primary = s.primary;
  }
}
