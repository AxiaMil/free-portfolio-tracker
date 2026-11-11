// Number formatting helpers (money, percentages, allocation, shares).
import { store } from './store.ts';

const SYMBOLS: Record<string, string> = {
  SGD: 'S$', USD: '$', HKD: 'HK$', EUR: '€', GBP: '£', JPY: '¥', CNY: 'CN¥', AUD: 'A$', CAD: 'C$', MYR: 'RM', THB: '฿', INR: '₹', KRW: '₩', TWD: 'NT$', CHF: 'CHF ', NZD: 'NZ$', IDR: 'Rp', PHP: '₱',
};

export function ccySymbol(ccy: string | undefined | null): string {
  if (!ccy) return '';
  return SYMBOLS[ccy] ?? ccy + ' ';
}

function sep(s: string): string {
  const p = store.state?.preferences;
  if (!p || (p.decimalSeparator === '.' && p.thousandSeparator === ',')) return s;
  return s.replace(/[,.]/g, (c) => (c === ',' ? '\u0001' : '\u0002')).replace(/\u0001/g, p.thousandSeparator).replace(/\u0002/g, p.decimalSeparator);
}

export function num(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return '-';
  return sep(v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
}

export const hidden = () => !!store.state?.preferences.hideValues;
const MASK = '••••';

/**
 * money(1234.5) -> "S$1,234.50"; sign adds +/-; auto decimals = 0 when |v| >= 1000 (table style)
 */
export function money(v: number | null | undefined, opts: { ccy?: string; sign?: boolean; decimals?: number | 'auto'; mask?: boolean } = {}): string {
  if (v == null || !isFinite(v)) return '-';
  const c = ccySymbol(opts.ccy ?? store.base);
  if (opts.mask !== false && hidden()) return `${c}${MASK}`;
  const d = opts.decimals === 'auto' ? (Math.abs(v) >= 1000 ? 0 : 2) : opts.decimals ?? 2;
  const s = num(Math.abs(v), d);
  const isNeg = v < 0 && Math.abs(v) >= 0.5 * 10 ** -d;
  return `${isNeg ? '-' : opts.sign ? '+' : ''}${c}${s}`;
}

/** compact money: S$12.34k */
export function moneyCompact(v: number, opts: { ccy?: string; sign?: boolean } = {}): string {
  const c = ccySymbol(opts.ccy ?? store.base);
  if (hidden()) return `${c}${MASK}`;
  const a = Math.abs(v);
  const s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(2) + 'k' : a.toFixed(2);
  return `${v < 0 ? '-' : opts.sign ? '+' : ''}${c}${s}`;
}

/** axis labels: S$1k, S$-250, S$1.5k */
export function moneyAxis(v: number, ccy?: string): string {
  const c = ccySymbol(ccy ?? store.base);
  const a = Math.abs(v);
  const s = a >= 1e6 ? +(a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? +(a / 1e3).toFixed(1) + 'k' : String(+a.toFixed(0));
  return `${c}${v < 0 ? '-' : ''}${s}`;
}

/** percentage from a ratio: 0.0022 -> "+0.22%"; huge values use exponent form (+9.62e+4%) */
export function pct(r: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (r == null || !isFinite(r)) return '-';
  const v = r * 100;
  const a = Math.abs(v);
  let s: string;
  if (a >= 10000) {
    const e = Math.floor(Math.log10(a));
    s = `${(a / 10 ** e).toFixed(2)}e+${e}`;
  } else if (a >= 1000) s = num(a, 0).replace(/,/g, '');
  else s = num(a, opts.decimals ?? 2);
  const sign = v < 0 && s.replace(/[0.,e+]/g, '') !== '' ? '-' : opts.sign !== false && v >= 0 ? '+' : '';
  return `${sign}${s}%`;
}

/** allocation style: 2 decimals, tiny values keep 3 significant digits (0.0257%) */
export function alloc(r: number | null | undefined): string {
  if (r == null || !isFinite(r)) return '-';
  const v = r * 100;
  if (Math.abs(v) > 0 && Math.abs(v) < 0.1) return `${v.toPrecision(3)}%`;
  return `${num(v, 2)}%`;
}

export function shares(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '-';
  if (hidden()) return MASK;
  if (Math.abs(v - Math.round(v)) < 1e-9) return num(Math.round(v), 0);
  return num(v, 4);
}

export function price(v: number | null | undefined, d = 2): string {
  if (v == null || !isFinite(v)) return '-';
  return num(v, d);
}

export function signClass(v: number | null | undefined): string {
  if (v == null || !isFinite(v) || Math.abs(v) < 1e-9) return '';
  return v > 0 ? 'pos' : 'neg';
}

export function fmtDate(d: string | null | undefined): string {
  return d ?? '-';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(isoDate: string): string {
  return `${MONTHS[Number(isoDate.slice(5, 7)) - 1]} ${isoDate.slice(0, 4)}`;
}
export function shortDate(isoDate: string): string {
  return `${MONTHS[Number(isoDate.slice(5, 7)) - 1]} ${Number(isoDate.slice(8, 10))}, ${isoDate.slice(0, 4)}`;
}
