// How numbers are written on screen, and how a broker's CSV file is read. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alloc, pct, pctAxis, price } from '../src/format.ts';
import { dayFirstDates, normDate, parseNumber, parseTransactionsCsv } from '../src/csv.ts';

test('percentages: grouped whole numbers from 1,000%, never an exponent', () => {
  assert.equal(pct(0.0022), '+0.22%');
  assert.equal(pct(-0.1234), '-12.34%');
  assert.equal(pct(9.99), '+999.00%');
  assert.equal(pct(9.99996), '+1,000%');
  assert.equal(pct(378.4), '+37,840%');
  assert.equal(pct(285), '+28,500%');
  assert.equal(pct(123456.7), '+12,345,670%');
  assert.equal(pct(-0.00001), '0.00%'); // rounds to zero: no minus sign
  assert.equal(pct(0.05, { sign: false }), '5.00%');
  assert.equal(pct(null), '-');
  assert.equal(pct(Infinity), '-');
  for (const r of [1e3, 1e5, 1e8, 1e12]) assert.ok(!/e/i.test(pct(r)), pct(r));
});

test('chart axis percentages', () => {
  assert.equal(pctAxis(0.5), '50%');
  assert.equal(pctAxis(0.005), '0.5%');
  assert.equal(pctAxis(-0.12), '-12%');
  assert.equal(pctAxis(378), '37,800%');
  assert.equal(pctAxis(0), '0%');
});

test('allocations: tiny shares keep three significant digits, never an exponent', () => {
  assert.equal(alloc(0.4567), '45.67%');
  assert.equal(alloc(0.000257), '0.0257%');
  assert.equal(alloc(0.0000123), '0.00123%');
  assert.equal(alloc(1e-9), '<0.001%');
  assert.equal(alloc(0), '0.00%');
});

test('prices keep the decimals that matter', () => {
  assert.equal(price(0.105), '0.105'); // an SGX penny stock
  assert.equal(price(0.1), '0.10');
  assert.equal(price(0.095), '0.095');
  assert.equal(price(0.104567), '0.1046');
  assert.equal(price(1.235), '1.235');
  assert.equal(price(12.3456), '12.346');
  assert.equal(price(150.123), '150.12');
  assert.equal(price(2345.5), '2,345.50');
  assert.equal(price(538), '538.00');
  assert.equal(price(1.5, 4), '1.5000');
});

test('CSV numbers as brokers write them', () => {
  const cases: Array<[string, number, boolean?]> = [
    ['1,234.50', 1234.5], ['1.234,50', 1234.5], ['1 234,5', 1234.5], ["1'234.50", 1234.5], ['$12.30', 12.3], ['S$1,234.50', 1234.5],
    ['12,5', 12.5], ['0,105', 0.105], ['1,234', 1234], ['12,345,678', 12345678], ['1.234.567', 1234567], ['-3.5', -3.5], ['(5.00)', -5],
    ['1.5e-4', 0.00015], ['USD 7.10', 7.1], ['1,234', 1.234, true], ['12,50', 12.5, true],
  ];
  for (const [s, v, dc] of cases) assert.equal(parseNumber(s, dc), v, s);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('n/a')));
});

test('CSV dates: as written, day or month first by what the file shows', () => {
  assert.equal(normDate('2024-03-15'), '2024-03-15');
  assert.equal(normDate('2024/3/5'), '2024-03-05');
  assert.equal(normDate('2024-03-15 14:30:00'), '2024-03-15');
  assert.equal(normDate('15/03/2024'), '2024-03-15');
  assert.equal(normDate('03/15/2024', false), '2024-03-15');
  assert.equal(normDate('31/02/2024'), null);
  assert.equal(normDate('Nov 12, 2026'), '2026-11-12'); // never shifted by the time zone
  assert.equal(dayFirstDates(['03/15/2024', '04/01/2024']), false);
  assert.equal(dayFirstDates(['15/03/2024', '01/04/2024']), true);
  assert.equal(dayFirstDates(['01/04/2024']), true);
});

test('CSV import: month-first files, decimal commas, unknown actions, missing prices', () => {
  const us = parseTransactionsCsv('Date,Action,Ticker,Shares,Price\n03/15/2024,Buy,AAPL,10,172.62\n04/01/2024,Sell,AAPL,5,"1,236.85"\n');
  assert.deepEqual(us.errors, []);
  assert.equal(us.txns[0].date, '2024-03-15');
  assert.equal(us.txns[1].date, '2024-04-01');
  assert.equal(us.txns[1].price, 1236.85);

  const eu = parseTransactionsCsv('Date;Action;Ticker;Shares;Price;Commission\n15.03.2024;Buy;ASML.AS;2;612,40;1,50\n');
  assert.equal(eu.txns[0].date, '2024-03-15');
  assert.equal(eu.txns[0].price, 612.4);
  assert.equal(eu.txns[0].commission, 1.5);

  const odd = parseTransactionsCsv('Date,Action,Ticker,Shares,Price\n2024-03-15,Withholding tax,AAPL,1,2\n2024-03-16,Buy,AAPL,10,\n2024-03-17,Deposit,,500,\n2024-03-18,Dividend,AAPL,10,\n');
  assert.equal(odd.txns.length, 3);
  assert.match(odd.errors[0], /unknown action "Withholding tax"/);
  assert.ok(Number.isNaN(odd.txns[0].price), 'a missing share price is left out, not 1');
  assert.equal(odd.txns[1].price, 1); // a cash row's price is 1
  assert.ok(Number.isNaN(odd.txns[2].price), 'a missing dividend per share is left out');

  // "Quantity" is the share count even when an "Amount" column comes first
  const cols = parseTransactionsCsv('Date,Type,Amount,Quantity,Ticker,Price,Side\n2024-03-15,Stock,1726.20,10,AAPL,172.62,Buy\n');
  assert.equal(cols.txns[0].shares, 10);
  assert.equal(cols.txns[0].action, 'Buy');

  // no Action column: a negative quantity is a sale
  const signed = parseTransactionsCsv('Date,Ticker,Qty,Price\n2024-03-15,AAPL,10,172\n2024-04-15,AAPL,-4,180\n');
  assert.deepEqual(signed.txns.map((t) => [t.action, t.shares]), [['Buy', 10], ['Sell', 4]]);
});
