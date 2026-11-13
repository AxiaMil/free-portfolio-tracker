// Dividends are shown net of the portfolio's withholding tax: gross - withholding = net, everywhere on the
// Dividends page, and the cash the portfolio receives matches the net. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolio } from '../src/engine/portfolio.ts';
import { MarketView } from '../src/engine/market.ts';
import { buildDividendEvents, summarize } from '../src/engine/dividends.ts';
import type { ChartData, Portfolio } from '../src/engine/types.ts';

const TODAY = '2026-06-30';

/** a flat $50 stock trading every weekday, paying $0.50 a share twice */
function chart(): ChartData {
  const bars: ChartData['bars'] = [];
  for (let t = Date.UTC(2025, 0, 2); t <= Date.UTC(2026, 5, 30); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    bars.push([d.toISOString().slice(0, 10), 50, 50, 50, 50]);
  }
  return {
    symbol: 'TEST', currency: 'USD', exchange: 'Test', instrumentType: 'EQUITY', name: 'Test Co', bars,
    dividends: [['2025-12-01', 0.5], ['2026-03-02', 0.5]], splits: [], fetchedAt: Date.now(),
  };
}

function portfolio(rate: number): Portfolio {
  return {
    id: 'p1', name: 'Test', currency: 'USD', benchmark: 'TEST', benchmarks: [], dividendTaxRate: rate, autoDividend: true, margin: false,
    transactions: [{ id: 't1', date: '2025-01-02', action: 'Buy', symbol: 'TEST', price: 50, currency: 'USD', shares: 100, commission: 0, note: '' }],
    customAssets: [], goal: null, rebalance: { mode: 'pct', targets: {}, extraAssets: [] },
  };
}

/** the company's published payment dates for both dividends (an exchange connector's records) */
const PAID = { TEST: { source: 'nasdaq', checkedAt: 1, records: [
  { exDate: '2026-03-02', payDate: '2026-03-16', amount: 0.5, currency: 'USD', source: 'nasdaq' },
  { exDate: '2025-12-01', payDate: '2025-12-15', amount: 0.5, currency: 'USD', source: 'nasdaq' },
] } };

function run(rate: number) {
  const m = new MarketView({ charts: { TEST: chart() }, quotes: {}, profiles: {}, payouts: PAID }, 'USD', TODAY, []);
  const r = computePortfolio(portfolio(rate), m, { costMethod: 'FIFO', today: TODAY });
  return { r, events: buildDividendEvents(r, m) };
}

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('30% withholding: gross 100, withheld 30, net 70', () => {
  const { r, events } = run(30);
  const received = events.filter((e) => e.label === 'Paid');
  assert.equal(received.length, 2);
  close(received.reduce((s, e) => s + e.grossBase, 0), 100);
  close(received.reduce((s, e) => s + e.taxBase, 0), 30);
  close(received.reduce((s, e) => s + e.amountBase, 0), 70);
  // per-share figures are net too: $0.50 gross becomes $0.35
  for (const e of received) close(e.perShareBase, 0.35);

  const s = summarize(events, r, 'Historical');
  close(s.gross, 100);
  close(s.withheld, 30);
  close(s.total, 70);
  close(s.gross - s.withheld, s.total);

  // the ledger pays the gross dividend and takes the tax as a separate Taxes entry; cash ends up with the net
  close(r.pnl.dividends, 100);
  close(r.pnl.taxes, -30);
  close(r.cash, 70);
});

test('no withholding: net equals gross', () => {
  const { r, events } = run(0);
  const s = summarize(events, r, 'Historical');
  close(s.gross, 100);
  close(s.withheld, 0);
  close(s.total, 100);
  close(r.cash, 100);
});

test('dividends entered by hand are not taxed again', () => {
  const p = portfolio(30);
  p.autoDividend = false;
  p.transactions.push({ id: 't2', date: '2026-01-15', action: 'Dividend', symbol: 'TEST', price: 0.4, currency: 'USD', shares: 100, commission: 0, note: '' });
  const m = new MarketView({ charts: { TEST: chart() }, quotes: {}, profiles: {} }, 'USD', TODAY, []);
  const r = computePortfolio(p, m, { costMethod: 'FIFO', today: TODAY });
  const s = summarize(buildDividendEvents(r, m), r, 'Historical');
  close(s.total, 40);
  close(s.withheld, 0);
});
