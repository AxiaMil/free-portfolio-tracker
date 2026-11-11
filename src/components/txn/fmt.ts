// Formatting + small helpers shared by the Transactions, Custom Assets and Settings pages.
import { hidden, num } from '../../format.ts';

/** decimals needed to show v exactly, clamped to [min, max] */
function decimalsFor(v: number, min: number, max: number): number {
  const a = Math.abs(v);
  for (let d = min; d < max; d++) {
    const s = a * 10 ** d;
    if (Math.abs(Math.round(s) - s) < 1e-6 * Math.max(1, s)) return d;
  }
  return max;
}

/** trade price: at least 2 decimals, up to 6 when the input has them (538.00, 0.10, 0.12345) */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '-';
  return num(v, decimalsFor(v, 2, 6));
}

/** shares as typed: 5, 0.5, 12.3456 */
export function fmtShares(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '-';
  if (hidden()) return '••••';
  return num(v, decimalsFor(v, 0, 6));
}

/** plain 2-decimal number (commission, amounts in base currency); masked in privacy mode when `mask` */
export function fmt2(v: number | null | undefined, mask = false): string {
  if (v == null || !isFinite(v)) return '-';
  if (mask && hidden()) return '••••';
  return num(v, 2);
}

export function downloadText(text: string, filename: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',');
}

export const CURRENCIES = ['USD', 'SGD', 'HKD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'MYR', 'THB', 'INR', 'KRW', 'TWD', 'CHF', 'NZD', 'IDR', 'PHP', 'SEK', 'DKK', 'NOK'];
