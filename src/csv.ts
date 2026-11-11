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
  action: ['action', 'type', 'side', 'transaction type'],
  symbol: ['ticker', 'symbol', 'code', 'stock', 'instrument'],
  shares: ['shares', 'quantity', 'qty', 'units', 'amount'],
  price: ['price', 'unit price', 'price per share'],
  currency: ['currency', 'ccy'],
  commission: ['commission', 'fee', 'fees', 'commission (sgd)'],
  note: ['note', 'notes', 'memo'],
};

function normDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [d, mo] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b]; // default dd/mm
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseTransactionsCsv(text: string): { txns: Omit<Txn, 'id'>[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { txns: [], errors: ['File has no data rows'] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = splitCsv(lines[0], delim).map((h) => h.toLowerCase());
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.date < 0 || idx.symbol < 0) return { txns: [], errors: ['Could not find Date and Ticker columns'] };
  const txns: Omit<Txn, 'id'>[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsv(lines[i], delim);
    const get = (k: string) => (idx[k] >= 0 ? c[idx[k]] ?? '' : '');
    const date = normDate(get('date'));
    const action = ACTIONS[get('action').toLowerCase()] ?? 'Buy';
    const symbol = get('symbol').toUpperCase();
    const n = (s: string) => Number(s.replace(/[^0-9.-]/g, ''));
    const shares = Math.abs(n(get('shares')));
    const price = n(get('price') || '1');
    if (!date || (!symbol && !['Deposit', 'Withdraw', 'Fees', 'Taxes', 'Interest income', 'Interest expense', 'Other income', 'Other expense'].includes(action)) || !shares) {
      errors.push(`Line ${i + 1} skipped`);
      continue;
    }
    txns.push({ date, action, symbol: symbol || 'CASH', price: isFinite(price) ? price : 0, currency: get('currency') || 'Market', shares, commission: Math.abs(n(get('commission') || '0')) || 0, note: get('note') });
  }
  return { txns, errors };
}

export function transactionsToCsv(txns: Txn[]): string {
  const head = ['Date', 'Action', 'Ticker', 'Price', 'Currency', 'Shares', 'Commission', 'Note'];
  const rows = txns.map((t) => [t.date, t.action, t.symbol, t.price, t.currency, t.shares, t.commission, t.note ?? '']);
  return [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
}
