// Design tokens and theme presets. CSS reads the custom properties; charts read `palette` (canvas can't use CSS vars).
import { reactive } from 'vue';

export type ThemeName = 'midnight' | 'graphite' | 'paper';
export const DEFAULT_THEME: ThemeName = 'graphite';

interface ThemeDef {
  label: string;
  description: string;
  dark: boolean;
  vars: Record<string, string>;
  chart: ChartPalette;
}

export interface ChartPalette {
  text: string;
  axis: string;
  axisLine: string;
  grid: string;
  portfolio: string;
  portfolioFill: string;
  bench: string;
  deposits: string;
  depositsFill: string;
  pos: string;
  neg: string;
  posFill: string;
  negFill: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  navigatorBg: string;
  navigatorFill: string;
  navigatorData: string;
  navigatorDataFill: string;
  handle: string;
  /** buy/sell markers on the value chart */
  flag: string;
  surface: string;
  series: string[];
  sector: string[];
}

const DARK_SERIES = ['#8B7BFF', '#4CC9F0', '#3DD68C', '#F5B544', '#FF7AA8', '#7DD3FC', '#C084FC', '#FB923C', '#2DD4BF', '#E879F9', '#A3E635', '#F472B6', '#60A5FA', '#FBBF24', '#34D399', '#F87171', '#A78BFA', '#38BDF8'];
const LIGHT_SERIES = ['#2F4FD8', '#0E9AA7', '#15803D', '#C2410C', '#BE185D', '#7C3AED', '#B45309', '#0369A1', '#4D7C0F', '#9D174D', '#1D4ED8', '#047857', '#A16207', '#6D28D9', '#0F766E', '#B91C1C', '#4338CA', '#065F46'];

export const THEMES: Record<ThemeName, ThemeDef> = {
  midnight: {
    label: 'Midnight',
    description: 'Deep navy surfaces with a violet accent',
    dark: true,
    vars: {
      '--bg': '#0B0D12', '--sidebar': '#0D1016', '--surface': '#12151C', '--surface-2': '#181C25', '--surface-3': '#222735',
      '--border': '#1E2330', '--border-strong': '#2C3242', '--line-soft': 'rgba(255, 255, 255, 0.06)',
      '--text': '#E9ECF2', '--text-2': '#A8AFBD', '--muted': '#7B8394', '--faint': '#4A5162',
      '--primary': '#7C5CFF', '--primary-fg': '#FFFFFF', '--primary-soft': 'rgba(124, 92, 255, 0.14)', '--primary-text': '#B4A3FF',
      '--nav-active-bg': 'rgba(124, 92, 255, 0.14)', '--nav-active-fg': '#C3B5FF',
      '--pos': '#3DD68C', '--neg': '#FF6B6B', '--pos-soft': 'rgba(61, 214, 140, 0.12)', '--neg-soft': 'rgba(255, 107, 107, 0.12)', '--warn': '#F5B544',
      '--pill-bg': '#151922', '--pill-active': '#272D3B', '--hover': 'rgba(255, 255, 255, 0.04)',
      '--shadow': '0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 10px 30px rgba(0, 0, 0, 0.25)',
      '--glow': 'radial-gradient(1200px 380px at 60% -120px, rgba(124, 92, 255, 0.12), transparent 70%)',
      '--font-display': "'Geist Variable', 'Geist', system-ui, sans-serif",
      '--heat-pos': '61, 214, 140', '--heat-neg': '255, 107, 107',
      '--tooltip-bg': '#262C3A', '--tooltip-fg': '#E9ECF2', '--scrim': 'rgba(5, 6, 10, 0.6)',
    },
    chart: {
      text: '#E9ECF2', axis: '#7B8394', axisLine: '#2C3242', grid: 'rgba(255, 255, 255, 0.05)',
      portfolio: '#A693FF', portfolioFill: 'rgba(124, 92, 255, 0.22)', bench: '#7B8394', deposits: '#3A4152', depositsFill: 'rgba(255, 255, 255, 0.045)',
      pos: '#3DD68C', neg: '#FF6B6B', posFill: 'rgba(61, 214, 140, 0.85)', negFill: 'rgba(255, 107, 107, 0.85)',
      tooltipBg: '#181C25', tooltipBorder: '#2C3242', tooltipText: '#E9ECF2',
      navigatorBg: 'rgba(255, 255, 255, 0.03)', navigatorFill: 'rgba(124, 92, 255, 0.14)', navigatorData: '#4A5162', navigatorDataFill: 'rgba(124, 92, 255, 0.10)', handle: '#C3B5FF', flag: '#5B8DEF',
      surface: '#12151C', series: DARK_SERIES,
      sector: ['#4C6FFF', '#8B7BFF', '#4CC9F0', '#2DD4BF', '#7DD3FC', '#A5B4FC', '#38BDF8', '#818CF8', '#5EEAD4', '#C7D2FE', '#3B82F6'],
    },
  },
  graphite: {
    label: 'Graphite',
    description: 'Neutral charcoal with a blue accent',
    dark: true,
    vars: {
      '--bg': '#0F1011', '--sidebar': '#121314', '--surface': '#17181A', '--surface-2': '#1D1E21', '--surface-3': '#28292D',
      '--border': '#232427', '--border-strong': '#333539', '--line-soft': 'rgba(255, 255, 255, 0.06)',
      '--text': '#EDEDEC', '--text-2': '#B2B2AE', '--muted': '#85857F', '--faint': '#55554F',
      '--primary': '#4C8DFF', '--primary-fg': '#FFFFFF', '--primary-soft': 'rgba(76, 141, 255, 0.14)', '--primary-text': '#8DB6FF',
      '--nav-active-bg': 'rgba(76, 141, 255, 0.12)', '--nav-active-fg': '#9CC0FF',
      '--pos': '#34D399', '--neg': '#F87171', '--pos-soft': 'rgba(52, 211, 153, 0.12)', '--neg-soft': 'rgba(248, 113, 113, 0.12)', '--warn': '#FBBF24',
      '--pill-bg': '#1A1B1D', '--pill-active': '#2C2E32', '--hover': 'rgba(255, 255, 255, 0.04)',
      '--shadow': '0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 10px 30px rgba(0, 0, 0, 0.3)',
      '--glow': 'none',
      '--font-display': "'Geist Variable', 'Geist', system-ui, sans-serif",
      '--heat-pos': '52, 211, 153', '--heat-neg': '248, 113, 113',
      '--tooltip-bg': '#2C2E32', '--tooltip-fg': '#EDEDEC', '--scrim': 'rgba(6, 6, 7, 0.6)',
    },
    chart: {
      text: '#EDEDEC', axis: '#85857F', axisLine: '#333539', grid: 'rgba(255, 255, 255, 0.05)',
      portfolio: '#F2F2F0', portfolioFill: 'rgba(242, 242, 240, 0.10)', bench: '#7FA9F5', deposits: '#3A3B3F', depositsFill: 'rgba(255, 255, 255, 0.05)',
      pos: '#34D399', neg: '#F87171', posFill: 'rgba(52, 211, 153, 0.85)', negFill: 'rgba(248, 113, 113, 0.85)',
      tooltipBg: '#1D1E21', tooltipBorder: '#333539', tooltipText: '#EDEDEC',
      navigatorBg: 'rgba(255, 255, 255, 0.03)', navigatorFill: 'rgba(76, 141, 255, 0.14)', navigatorData: '#55554F', navigatorDataFill: 'rgba(255, 255, 255, 0.06)', handle: '#9CC0FF', flag: '#4C8DFF',
      surface: '#17181A', series: DARK_SERIES,
      sector: ['#4C8DFF', '#7FA9F5', '#A8C5F8', '#5B6B85', '#8796B0', '#C9D6EA', '#3E5C8F', '#6E8FC9', '#9FB0C8', '#DCE4F0', '#2F4A75'],
    },
  },
  paper: {
    label: 'Paper',
    description: 'Warm light pages with an ink-blue accent',
    dark: false,
    vars: {
      '--bg': '#F5F3EE', '--sidebar': '#EFECE5', '--surface': '#FFFFFF', '--surface-2': '#F8F6F1', '--surface-3': '#ECE8DF',
      '--border': '#E6E1D6', '--border-strong': '#D2CBBD', '--line-soft': 'rgba(26, 24, 20, 0.07)',
      '--text': '#1A1814', '--text-2': '#4D4840', '--muted': '#7A7468', '--faint': '#B3AC9F',
      '--primary': '#2F4FD8', '--primary-fg': '#FFFFFF', '--primary-soft': 'rgba(47, 79, 216, 0.10)', '--primary-text': '#2F4FD8',
      '--nav-active-bg': 'rgba(47, 79, 216, 0.09)', '--nav-active-fg': '#2F4FD8',
      '--pos': '#15803D', '--neg': '#C0392B', '--pos-soft': 'rgba(21, 128, 61, 0.10)', '--neg-soft': 'rgba(192, 57, 43, 0.10)', '--warn': '#B7791F',
      '--pill-bg': '#ECE8DF', '--pill-active': '#FFFFFF', '--hover': 'rgba(26, 24, 20, 0.035)',
      '--shadow': '0 1px 2px rgba(26, 24, 20, 0.05), 0 8px 24px rgba(26, 24, 20, 0.05)',
      '--glow': 'none',
      '--font-display': "'Charter', 'Iowan Old Style', 'Georgia', serif",
      '--heat-pos': '21, 128, 61', '--heat-neg': '192, 57, 43',
      '--tooltip-bg': '#1A1814', '--tooltip-fg': '#F5F3EE', '--scrim': 'rgba(26, 24, 20, 0.35)',
    },
    chart: {
      text: '#1A1814', axis: '#7A7468', axisLine: '#D2CBBD', grid: 'rgba(26, 24, 20, 0.07)',
      portfolio: '#1A1814', portfolioFill: 'rgba(47, 79, 216, 0.10)', bench: '#9A9385', deposits: '#D2CBBD', depositsFill: 'rgba(26, 24, 20, 0.05)',
      pos: '#15803D', neg: '#C0392B', posFill: 'rgba(21, 128, 61, 0.8)', negFill: 'rgba(192, 57, 43, 0.8)',
      tooltipBg: '#FFFFFF', tooltipBorder: '#E6E1D6', tooltipText: '#1A1814',
      navigatorBg: 'rgba(26, 24, 20, 0.03)', navigatorFill: 'rgba(47, 79, 216, 0.10)', navigatorData: '#B3AC9F', navigatorDataFill: 'rgba(26, 24, 20, 0.06)', handle: '#2F4FD8', flag: '#2F4FD8',
      surface: '#FFFFFF', series: LIGHT_SERIES,
      sector: ['#2F4FD8', '#5B74E0', '#8A9CE9', '#B7C3F2', '#1E3A8A', '#3B5BDB', '#6B7FD7', '#A5B4FC', '#26368F', '#C7D2FE', '#4C63C9'],
    },
  },
};

/** live chart colours for the current theme (ECharts options read these) */
export const palette = reactive<ChartPalette & { name: ThemeName; dark: boolean }>({ name: DEFAULT_THEME, dark: true, ...THEMES[DEFAULT_THEME].chart });

export function resolveTheme(name: string | null | undefined): ThemeName {
  return name && name in THEMES ? (name as ThemeName) : DEFAULT_THEME;
}

/** applies a theme's CSS variables to <html>; returns the definition */
export function applyThemeVars(name: ThemeName): ThemeDef {
  const t = THEMES[name];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  root.dataset.theme = name;
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  Object.assign(palette, t.chart, { name, dark: t.dark });
  return t;
}

/** the same colour with a new opacity; accepts #rgb, #rrggbb and rgb()/rgba() */
export function alpha(color: string, a: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return c;
  const [r, g, b] = m[1].split(',').map((x) => x.trim());
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
