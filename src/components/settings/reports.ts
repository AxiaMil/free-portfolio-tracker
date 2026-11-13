// "All Reports" entries + the account-setting sections of the Settings page.
import { NAV, TOOLS, MANAGE } from '../../router.ts';

const DESC: Record<string, [string, string]> = {
  '/portfolio': ['Home', 'Provide overall portfolio performance and information related to your current holdings'],
  '/performance': ['Performance', 'Provide detailed portfolio performance relative to benchmarks over different periods'],
  '/allocation': ['Allocation', 'Show details in your current holdings and identify concentration risk'],
  '/dividend': ['Dividend', 'Provide dividend information of your portfolio'],
  '/risk': ['Risk', 'Measure drawdowns, volatility and risk-adjusted return'],
  '/goal-tracker': ['Goal Tracker', 'Track your progress towards your financial goal'],
  '/trade-analysis': ['Trade Analysis', 'Deep dive into each trade to identify winners, losers and the fees you paid'],
  '/transactions': ['Transactions', 'Show all related transactions in the trade log, including automatic deposits and dividends'],
  '/custom-assets': ['Custom Assets', 'Create and track non-listed investments or assets without market data'],
  '/allocation/rebalance': ['Rebalance', 'Work out the trades that bring your holdings back to a target allocation'],
};
const ORDER = ['/portfolio', '/performance', '/allocation', '/dividend', '/risk', '/goal-tracker', '/trade-analysis', '/transactions', '/custom-assets', '/allocation/rebalance'];
const ICONS = Object.fromEntries([...NAV, ...TOOLS, ...MANAGE].map((n) => [n.to, n.icon]));

export const REPORTS = ORDER.map((to) => ({ to, title: DESC[to][0], desc: DESC[to][1], icon: ICONS[to] ?? 'mdi-file-chart' }));

export type SectionKey = 'portfolio' | 'display' | 'calculation' | 'appearance' | 'dividends' | 'data';
export const SECTIONS: Array<{ key: SectionKey; title: string; icon: string; desc: string }> = [
  { key: 'data', title: 'Data & Backup', icon: 'mdi-database-outline', desc: 'Download or restore all your data, export transactions as CSV' },
  { key: 'display', title: 'Display Preferences', icon: 'mdi-tune-variant', desc: 'Change how numbers are formatted' },
  { key: 'calculation', title: 'Calculation Methods', icon: 'mdi-calculator', desc: 'Change how the app computes the end results (FIFO, Average)' },
  { key: 'appearance', title: 'Appearance', icon: 'mdi-palette-outline', desc: 'Choose the theme (Midnight, Graphite or Paper) and accent colour' },
  { key: 'dividends', title: 'Dividend Dates', icon: 'mdi-calendar-check', desc: 'Where each holding\'s dividend payment dates come from' },
];
const ALIASES: Record<string, SectionKey> = {
  portfolio: 'portfolio', portfolios: 'portfolio', 'portfolio-settings': 'portfolio',
  display: 'display', 'display-preferences': 'display', preferences: 'display',
  calculation: 'calculation', 'calculation-methods': 'calculation', calculations: 'calculation',
  appearance: 'appearance', theme: 'appearance',
  dividends: 'dividends', 'dividend-dates': 'dividends', payouts: 'dividends',
  data: 'data', backup: 'data', 'data-backup': 'data', 'data-and-backup': 'data',
};
export const sectionKey = (s: unknown): SectionKey | null => (typeof s === 'string' ? ALIASES[s.toLowerCase()] ?? null : null);
