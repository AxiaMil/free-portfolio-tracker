// Tolerant CSV import for transactions (works with most broker-style exports).
import type { Action, Txn } from './engine/types.ts';

function splitCsv(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const ACTIONS: Record<string, Action> = {
  buy: 'Buy', b: 'Buy', purchase: 'Buy', sell: 'Sell', s: 'Sell', sale: 'Sell', deposit: 'Deposit', withdraw: 'Withdraw', withdrawal: 'Withdraw',
  'transfer in': 'Transfer in', 'transfer out': 'Transfer out', dividend: 'Dividend', div: 'Dividend', 'stock dividend': 'Stock dividend',
  fees: 'Fees', fee: 'Fees', taxes: 'Taxes', tax: 'Taxes', 'interest income': 'Interest income', interest: 'Interest income', 'interest expense': 'Interest expense',
  'other income': 'Other income', 'other expense': 'Other expense',
};

const COLS: Record<string, string[]> = {
  date: ['date', 'trade date', 'transaction date', 'time'],
  action: ['action', 'side', 'transaction type', 'type'],
  symbol: ['ticker', 'symbol', 'code', 'stock', 'instrument'],
  shares: ['shares', 'quantity', 'qty', 'units', 'amount'],
  price: ['price', 'unit price', 'price per share'],
  currency: ['currency', 'ccy'],
  commission: ['commission', 'fee', 'fees', 'commission (sgd)'],
  note: ['note', 'notes', 'memo'],
};

const pad = (n: number | string) => String(n).padStart(2, '0');
const isoOf = (y: number, mo: number, d: number): string | null => {
  const x = new Date(Date.UTC(y, mo - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
};
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T].*)?$/;

/**
 * Whether a file's numeric dates are day first (31/12/2024) or month first (12/31/2024). Any date with a first
 * number above 12 makes it day first, any with a second number above 12 month first; otherwise day first.
 */
export function dayFirstDates(dates: string[]): boolean {
  let dayFirst = false;
  let monthFirst = false;
  for (const s of dates) {
    const m = s.trim().match(NUMERIC_DATE);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  return dayFirst || !monthFirst;
}

/** a calendar date as written (never shifted by a time zone), or null */
export function normDate(s: string, dayFirst = true): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(NUMERIC_DATE);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return dayFirst ? isoOf(Number(m[3]), b, a) : isoOf(Number(m[3]), a, b);
  }
  // written out ("Nov 12, 2026", "12 November 2026"): the browser reads it as a local date; keep that date
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A number as brokers write it: "1,234.50", "1.234,50", "1 234,5", "1'234.50", "$12.30", "(5.00)", "12,5".
 * With both separators, the last one is the decimal point. A lone comma is a decimal comma unless it groups
 * thousands ("1,234" or "12,345,678"). Files separated by semicolons use decimal commas throughout.
 */
export function parseNumber(raw: string, decimalComma = false): number {
  let t = raw.trim();
  if (!t) return NaN;
  if (/^[-+]?\d+(\.\d+)?e[-+]?\d+$/i.test(t)) return Number(t); // 1.5e-4, as spreadsheets sometimes write
  const neg = /^\(.*\)$/.test(t) || /^-|-$/.test(t.replace(/[^\d.,-]/g, ''));
  t = t.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return NaN;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const grouping = /^\d{1,3}(,\d{3})+$/.test(t) && !/^0,/.test(t);
    t = grouping && !(decimalComma && (t.match(/,/g) || []).length === 1) ? t.replace(/,/g, '') : t.replace(/,/g, '.');
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, ''); // dots grouping thousands: 1.234.567
  }
  if ((t.match(/\./g) || []).length > 1) return NaN;
  const v = Number(t);
  return neg ? -v : v;
}

const CASH_ONLY = ['Deposit', 'Withdraw', 'Fees', 'Taxes', 'Interest income', 'Interest expense', 'Other income', 'Other expense'];

/**
 * Rows ready for review. A share price that is missing is left out (NaN), not guessed: the form then fills in the
 * day's price or asks for one. A row with an action it doesn't know, a bad date or no shares is skipped and listed.
 */
export function parseTransactionsCsv(text: string): { txns: Omit<Txn, 'id'>[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { txns: [], errors: ['File has no data rows'] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = splitCsv(lines[0], delim).map((h) => h.toLowerCase());
  const idx: Record<string, number> = {};
  // each list is in order of preference: "Quantity" wins over "Amount", "Commission" over "Fee"
  for (const [k, names] of Object.entries(COLS)) idx[k] = names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  if (idx.date < 0 || idx.symbol < 0) return { txns: [], errors: ['Could not find Date and Ticker columns'] };
  const txns: Omit<Txn, 'id'>[] = [];
  const errors: string[] = [];
  const rows = lines.slice(1).map((l) => splitCsv(l, delim));
  const dayFirst = dayFirstDates(rows.map((c) => (idx.date >= 0 ? c[idx.date] ?? '' : '')));
  const decimalComma = delim === ';';
  rows.forEach((c, k) => {
    const line = k + 2;
    const get = (key: string) => (idx[key] >= 0 ? c[idx[key]] ?? '' : '');
    const n = (s: string) => parseNumber(s, decimalComma);
    const date = normDate(get('date'), dayFirst);
    const rawAction = get('action').trim();
    const qty = n(get('shares'));
    // no Action column: a negative quantity is a sale
    const action: Action | undefined = idx.action < 0 ? (qty < 0 ? 'Sell' : 'Buy') : ACTIONS[rawAction.toLowerCase()];
    if (!action) { errors.push(`Line ${line}: unknown action "${rawAction}"`); return; }
    const symbol = get('symbol').toUpperCase();
    const shares = Math.abs(qty);
    const cash = CASH_ONLY.includes(action);
    const priceText = get('price');
    // cash rows default to a price of 1 (the amount is in the Shares column) and a stock dividend's price is unused;
    // a share price or a dividend per share is never guessed
    const price = priceText.trim() ? Math.abs(n(priceText)) : cash ? 1 : action === 'Stock dividend' ? 0 : NaN;
    if (!date) { errors.push(`Line ${line}: no valid date`); return; }
    if (!symbol && !cash) { errors.push(`Line ${line}: no ticker`); return; }
    if (!(shares > 0)) { errors.push(`Line ${line}: no ${cash ? 'amount' : 'shares'}`); return; }
    if (priceText.trim() && !isFinite(price)) { errors.push(`Line ${line}: price "${priceText}" isn't a number`); return; }
    const commission = Math.abs(n(get('commission') || '0'));
    txns.push({ date, action, symbol: symbol || 'CASH', price, currency: get('currency') || 'Market', shares, commission: isFinite(commission) ? commission : 0, note: get('note') });
  });
  return { txns, errors };
}

export function transactionsToCsv(txns: Txn[]): string {
  const head = ['Date', 'Action', 'Ticker', 'Price', 'Currency', 'Shares', 'Commission', 'Note'];
  const rows = txns.map((t) => [t.date, t.action, t.symbol, t.price, t.currency, t.shares, t.commission, t.note ?? '']);
  return [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
}
