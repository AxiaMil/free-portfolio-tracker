// The engine's numbers against values worked out by hand, on made-up portfolios with simple prices.
// Every portfolio also has to satisfy the identity value − net deposits = the sum of the P&L breakdown,
// and value = cash + the market value of the holdings. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolio, type EngineResult } from '../src/engine/portfolio.ts';
import { MarketView } from '../src/engine/market.ts';
import { buildTradeLots } from '../src/engine/trades.ts';
import type { Action, ChartData, MarketBundle, Portfolio, Quote, Txn } from '../src/engine/types.ts';

const TODAY = '2026-06-30';

/** weekday bars from 2025-01-02 to `to`, the close given by `px(date)` */
function chart(symbol: string, currency: string, px: (d: string) => number, extra: Partial<ChartData> = {}, to = TODAY): ChartData {
  const bars: ChartData['bars'] = [];
  for (let t = Date.UTC(2025, 0, 2); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const c = px(iso);
    bars.push([iso, c, c, c, c]);
  }
  return { symbol, currency, exchange: 'Test', instrumentType: 'EQUITY', name: `${symbol} Inc`, bars, dividends: [], splits: [], fetchedAt: 0, ...extra };
}

let seq = 0;
const tx = (date: string, action: Action, symbol: string, shares: number, price: number, extra: Partial<Txn> = {}): Txn =>
  ({ id: `t${++seq}`, date, action, symbol, shares, price, currency: 'Market', commission: 0, note: '', ...extra });

function portfolio(currency: string, transactions: Txn[], extra: Partial<Portfolio> = {}): Portfolio {
  return {
    id: 'p', name: 'Test', currency, benchmark: 'BENCH', benchmarks: [], dividendTaxRate: 0, autoDividend: false, margin: false,
    transactions, customAssets: [], goal: null, rebalance: { mode: 'pct', targets: {}, extraAssets: [] }, ...extra,
  };
}

function run(p: Portfolio, charts: ChartData[], opts: { costMethod?: 'FIFO' | 'Average'; quotes?: Record<string, Quote>; today?: string; payouts?: MarketBundle['payouts'] } = {}) {
  const bundle: MarketBundle = { charts: Object.fromEntries(charts.map((c) => [c.symbol, c])), quotes: opts.quotes ?? {}, profiles: {}, payouts: opts.payouts };
  if (!bundle.charts.BENCH) bundle.charts.BENCH = chart('BENCH', p.currency, () => 100);
  const today = opts.today ?? TODAY;
  const m = new MarketView(bundle, p.currency, today, p.customAssets);
  const r = computePortfolio(p, m, { costMethod: opts.costMethod ?? 'FIFO', today });
  return { r, m };
}

/** an exchange connector's records: each [ex-date, payment date] as the company published them */
const paidOn = (dates: Array<[string, string | null]>, source = 'sgx') =>
  ({ source, checkedAt: 1, records: dates.map(([exDate, payDate]) => ({ exDate, payDate, source })) });

const near = (a: number, b: number, msg = '') => assert.ok(Math.abs(a - b) < 1e-6, `${msg} ${a} != ${b}`);

/** value − net deposits is the sum of the P&L breakdown; value is cash plus the holdings */
function balanced(r: EngineResult) {
  const p = r.pnl;
  near(r.value - r.netDeposits, p.unrealized + p.realized + p.dividends + p.fees + p.taxes + p.interests + p.others, 'value − net deposits vs P&L');
  near(r.value, r.cash + r.holdings.reduce((s, h) => s + h.marketValue, 0) + r.toBePaid, 'value vs cash + holdings + dividends to be paid');
}

// 10 until March, 12 from April to September, 15 from October
const steps = (d: string) => (d < '2025-04-01' ? 10 : d < '2025-10-01' ? 12 : 15);
const twoBuysOneSale = () => [
  tx('2025-01-02', 'Buy', 'AAA', 100, 10, { commission: 5 }),
  tx('2025-04-01', 'Buy', 'AAA', 100, 12, { commission: 5 }),
  tx('2025-10-01', 'Sell', 'AAA', 150, 15, { commission: 5 }),
];

test('FIFO: the sale uses the oldest shares first', () => {
  const { r } = run(portfolio('USD', twoBuysOneSale()), [chart('AAA', 'USD', steps)]);
  const h = r.holdings[0];
  // sold 100 at a cost of 10 and 50 at 12: cost 1,600, proceeds 2,250
  near(r.pnl.realized, 650);
  near(h.shares, 50);
  near(h.avgCost, 12);
  near(h.costValue, 600);
  near(h.marketValue, 750);
  near(h.unrealized, 150);
  near(h.fees, 15);
  near(h.totalGain, 150 + 650 - 15);
  // the buys were paid for by automatic deposits of 1,005 and 1,205; the sale left 2,245 in cash
  near(r.netDeposits, 2210);
  near(r.cash, 2245);
  near(r.value, 2995);
  near(r.pnl.fees, -15);
  balanced(r);
});

test('average cost: the sale uses the average cost of all shares', () => {
  const { r } = run(portfolio('USD', twoBuysOneSale()), [chart('AAA', 'USD', steps)], { costMethod: 'Average' });
  const h = r.holdings[0];
  // average cost 2,200 / 200 = 11: the 150 sold cost 1,650
  near(r.pnl.realized, 600);
  near(h.shares, 50);
  near(h.avgCost, 11);
  near(h.costValue, 550);
  near(h.unrealized, 200);
  near(h.totalGain, 200 + 600 - 15); // the same total gain as FIFO, split differently
  balanced(r);
});

test('average cost across three lots and two sales', () => {
  const px = (d: string) => (d < '2025-03-01' ? 10 : d < '2025-06-01' ? 20 : 30);
  const txns = [
    tx('2025-01-02', 'Buy', 'AAA', 10, 10), tx('2025-03-03', 'Buy', 'AAA', 10, 20), tx('2025-06-02', 'Buy', 'AAA', 20, 30),
    tx('2025-07-01', 'Sell', 'AAA', 20, 30), tx('2025-08-01', 'Sell', 'AAA', 10, 30),
  ];
  const { r } = run(portfolio('USD', txns), [chart('AAA', 'USD', px)], { costMethod: 'Average' });
  // average cost (100 + 200 + 600) / 40 = 22.5 for every sale
  near(r.pnl.realized, 30 * (30 - 22.5));
  near(r.holdings[0].shares, 10);
  near(r.holdings[0].avgCost, 22.5);
  near(r.holdings[0].costValue, 225);
  balanced(r);
});

test('another currency: cost at the trade date\'s rate, value at today\'s', () => {
  const fx = chart('USDSGD=X', 'SGD', (d) => (d < '2025-07-01' ? 1.3 : 1.4));
  const txns = [
    tx('2025-01-02', 'Buy', 'USX', 10, 100),
    // the same stock bought with a price in Singapore dollars: S$130 was US$100 that day
    tx('2025-01-02', 'Buy', 'USX', 10, 130, { currency: 'SGD' }),
  ];
  const { r, m } = run(portfolio('SGD', txns), [chart('USX', 'USD', () => 100), fx]);
  const h = r.holdings[0];
  near(h.costValue, 1300 + 1300);
  near(h.marketValue, 20 * 100 * 1.4);
  near(h.unrealized, 2800 - 2600);
  // the average cost is in the stock's own currency (US$100, not the average of 100 and 130)
  near(h.avgCost, 100);
  assert.equal(h.currency, 'USD');
  balanced(r);
  // per lot too: both lots are valued in US dollars
  const lots = buildTradeLots(r.ledger, m, { costMethod: 'FIFO', today: TODAY, benchmark: 'BENCH', margin: false });
  assert.equal(lots.length, 2);
  for (const l of lots) { assert.equal(l.currency, 'USD'); near(l.marketValue, 1400); }
  near(lots[1].price, 100);
  near(lots[1].unrealized, 1400 - 1300);
  assert.deepEqual(r.missingFx, []);
  assert.equal(r.warnings.length, 0); // S$130 is within the day's range once converted to US dollars
});

test('dividends: per holding and per lot after withholding; the breakdown shows gross and tax', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2025-12-01', 0.5], ['2026-03-02', 0.5]] });
  const p = portfolio('USD', [tx('2025-01-02', 'Buy', 'DIV', 100, 50)], { autoDividend: true, dividendTaxRate: 30 });
  const { r, m } = run(p, [c], { payouts: { DIV: paidOn([['2025-12-01', '2025-12-15'], ['2026-03-02', '2026-03-16']]) } });
  const h = r.holdings[0];
  near(h.dividends, 70);
  near(h.totalGain, 70);
  near(r.pnl.dividends, 100);
  near(r.pnl.taxes, -30);
  near(r.cash, 70);
  balanced(r);
  const lots = buildTradeLots(r.ledger, m, { costMethod: 'FIFO', today: TODAY, benchmark: 'BENCH', margin: false });
  near(lots[0].dividends, 70);
  near(lots[0].totalGain, 70);
});

test('dividends: only shares held before the ex-date, none on shares already sold', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2025-03-03', 1], ['2025-09-01', 1]] });
  const txns = [tx('2025-01-02', 'Buy', 'DIV', 100, 50), tx('2025-03-03', 'Buy', 'DIV', 50, 50), tx('2025-06-02', 'Sell', 'DIV', 120, 50)];
  const { r } = run(portfolio('USD', txns, { autoDividend: true }), [c]);
  // 100 shares before the first ex-date (the buy on the ex-date doesn't count), 30 before the second
  near(r.pnl.dividends, 100 + 30);
  near(r.holdings[0].dividends, 130);
  balanced(r);
});

test('a dividend entered by hand counts once, with its commission as a fee', () => {
  const c = chart('DIV', 'USD', () => 50);
  const txns = [tx('2025-01-02', 'Buy', 'DIV', 100, 50), tx('2025-06-02', 'Dividend', 'DIV', 100, 0.4, { commission: 1 })];
  const { r } = run(portfolio('USD', txns, { dividendTaxRate: 30 }), [c]);
  near(r.holdings[0].dividends, 40);
  near(r.holdings[0].fees, 1);
  near(r.holdings[0].totalGain, 39);
  near(r.cash, 39);
  balanced(r);
});

test('split: trades keep the price you paid, shares double', () => {
  // a 2-for-1 split on 2025-06-02; Yahoo's history is split-adjusted, so it shows 50 throughout
  const c = chart('SPL', 'USD', () => 50, { splits: [['2025-06-02', 2]] });
  const { r, m } = run(portfolio('USD', [tx('2025-01-02', 'Buy', 'SPL', 10, 100)]), [c]);
  const h = r.holdings[0];
  near(h.shares, 20);
  near(h.avgCost, 50);
  near(h.costValue, 1000);
  near(h.marketValue, 1000);
  assert.equal(r.warnings.length, 0); // 100 before the split is in the day's range
  near(m.tradedCloseAt('SPL', '2025-01-02')!, 100);
  near(m.tradedCloseAt('SPL', '2025-06-02')!, 50);
  balanced(r);
});

test('pence: London prices quoted in GBp count in pounds', () => {
  const c = chart('LON.L', 'GBp', () => 250);
  const { r, m } = run(portfolio('GBP', [tx('2025-01-02', 'Buy', 'LON.L', 100, 2.5)]), [c]);
  near(r.holdings[0].last!, 2.5);
  near(r.holdings[0].marketValue, 250);
  near(r.holdings[0].unrealized, 0);
  near(m.tradedCloseAt('LON.L', '2025-05-05')!, 2.5); // what the trade form fills in
  assert.equal(r.warnings.length, 0);
  balanced(r);
});

test('transfer out: the gain until the transfer is realised', () => {
  const c = chart('TRF', 'USD', (d) => (d < '2025-06-02' ? 10 : 15));
  const txns = [tx('2025-01-02', 'Buy', 'TRF', 10, 10), tx('2025-10-01', 'Transfer out', 'TRF', 10, 15)];
  const { r } = run(portfolio('USD', txns), [c]);
  assert.equal(r.holdings.length, 0);
  near(r.pnl.realized, 50);
  near(r.netDeposits, 100 - 150);
  near(r.value, 0);
  balanced(r);
});

test('transfer in: cost is the value you enter, and it counts as money added', () => {
  const c = chart('TRF', 'USD', () => 12);
  const { r } = run(portfolio('USD', [tx('2025-01-02', 'Transfer in', 'TRF', 10, 10)]), [c]);
  near(r.holdings[0].costValue, 100);
  near(r.holdings[0].unrealized, 20);
  near(r.netDeposits, 100);
  near(r.cash, 0);
  balanced(r);
});

test('selling more than you hold: a warning, and the numbers still add up', () => {
  const c = chart('OVR', 'USD', (d) => (d < '2025-06-02' ? 10 : 12));
  const sale = tx('2025-07-01', 'Sell', 'OVR', 15, 12);
  const { r } = run(portfolio('USD', [tx('2025-01-02', 'Buy', 'OVR', 10, 10), sale]), [c]);
  const w = r.warnings.find((x) => x.kind === 'oversold');
  assert.ok(w, 'oversold warning');
  assert.equal(w!.id, sale.id);
  near(w!.low, 10);
  assert.equal(r.holdings.length, 0);
  // 10 shares sold at a gain of 2, and 5 with no recorded cost
  near(r.pnl.realized, 20 + 60);
  near(r.cash, 180);
  near(r.value, 180); // no negative holding left behind
  near(r.series[r.series.length - 1].holdingsValue, 0);
  balanced(r);
});

test('cash actions: deposits, withdrawals, interest, fees, taxes, other income and expense', () => {
  const c = chart('CSH', 'USD', () => 10);
  const txns = [
    tx('2025-01-02', 'Deposit', 'CASH', 1000, 1, { currency: 'USD' }),
    tx('2025-01-02', 'Buy', 'CSH', 10, 10),
    tx('2025-03-03', 'Stock dividend', 'CSH', 1, 0),
    tx('2025-04-01', 'Interest income', 'CASH', 5, 1, { currency: 'USD' }),
    tx('2025-04-01', 'Other expense', 'CASH', 3, 1, { currency: 'USD' }),
    tx('2025-04-01', 'Fees', 'CASH', 2, 1, { currency: 'USD' }),
    tx('2025-05-01', 'Withdraw', 'CASH', 50, 1, { currency: 'USD' }),
    tx('2025-05-01', 'Taxes', 'CASH', 1, 1, { currency: 'USD' }),
    tx('2025-05-01', 'Other income', 'CASH', 4, 1, { currency: 'USD' }),
    tx('2025-05-01', 'Interest expense', 'CASH', 0.5, 1, { currency: 'USD' }),
  ];
  const { r } = run(portfolio('USD', txns), [c]);
  near(r.cash, 1000 - 100 + 5 - 3 - 2 - 50 - 1 + 4 - 0.5);
  near(r.holdings[0].shares, 11);
  near(r.holdings[0].costValue, 100); // the bonus share cost nothing
  near(r.netDeposits, 950);
  near(r.pnl.interests, 4.5);
  near(r.pnl.others, 1);
  near(r.pnl.fees, -2);
  near(r.pnl.taxes, -1);
  near(r.pnl.unrealized, 10);
  balanced(r);
});

test('time-weighted return ignores the timing of deposits', () => {
  const px = (d: string) => (d < '2025-03-03' ? 10 : d < '2025-06-02' ? 11 : 12.1);
  const txns = [tx('2025-01-02', 'Buy', 'TWR', 100, 10), tx('2025-03-04', 'Buy', 'TWR', 1000 / 11, 11)];
  const { r } = run(portfolio('USD', txns), [chart('TWR', 'USD', px)]);
  // +10% and +10% again, whatever was added in between
  near(r.series[r.series.length - 1].twrIndex, 1.21);
  balanced(r);
});

test('today: an exchange ahead of your time zone already trading tomorrow', () => {
  // the last bar is dated 2026-07-01 while it's still 2026-06-30 here
  const c = chart('AHD.SI', 'SGD', (d) => (d < '2026-07-01' ? 10 : 11), {}, '2026-07-01');
  const { r } = run(portfolio('SGD', [tx('2025-01-02', 'Buy', 'AHD.SI', 100, 10)]), [c]);
  near(r.holdings[0].marketValue, 1100);
  near(r.value, 1100); // the headline uses the same latest price as the holdings
  balanced(r);
});

test('a quote is dated by its exchange\'s calendar, not UTC', () => {
  // 10:30 on 2026-06-30 in Sydney is still 2026-06-29 in UTC
  const time = Date.parse('2026-06-29T23:30:00Z');
  const q: Quote = {
    symbol: 'ASX.AX', price: 21, prevClose: 20, change: 1, changePct: 5, time, gmtoffset: 11 * 3600, marketState: null, currency: 'AUD',
    name: 'ASX', shortName: null, quoteType: 'EQUITY', exchange: 'ASX', high52: null, low52: null, dividendRate: null, dividendYield: null, fetchedAt: time,
  };
  const c = chart('ASX.AX', 'AUD', () => 20, {}, '2026-06-29');
  const { r, m } = run(portfolio('AUD', [tx('2025-01-02', 'Buy', 'ASX.AX', 10, 20)]), [c], { quotes: { 'ASX.AX': q } });
  near(m.priceAt('ASX.AX', '2026-06-29')!, 20); // yesterday's close is left alone
  near(m.lastPrice('ASX.AX')!, 21);
  near(r.holdings[0].dayGain, 10);
  balanced(r);
});

test('a currency with no exchange rate is reported, not silently counted 1:1', () => {
  const jp = chart('7203.T', 'JPY', () => 2000);
  const p = portfolio('SGD', [tx('2025-01-02', 'Buy', '7203.T', 100, 2000)]);
  assert.deepEqual(run(p, [jp]).r.missingFx, ['JPY']);
  const withFx = run(p, [jp, chart('JPYSGD=X', 'SGD', () => 0.009)]);
  assert.deepEqual(withFx.r.missingFx, []);
  near(withFx.r.holdings[0].marketValue, 100 * 2000 * 0.009);
  // or through USD, when the direct pair isn't there
  const viaUsd = run(p, [jp, chart('JPYUSD=X', 'USD', () => 0.0067), chart('USDSGD=X', 'SGD', () => 1.35)]);
  assert.deepEqual(viaUsd.r.missingFx, []);
  near(viaUsd.r.holdings[0].marketValue, 100 * 2000 * 0.0067 * 1.35);
});

test('per-holding return: money-weighted, with dividends after tax', () => {
  // bought at 100, worth 110 a year later, with a 2.00 dividend (1.40 after 30% tax) on the way
  const c = chart('MWR', 'USD', (d) => (d < '2026-06-30' ? 100 : 110), { dividends: [['2025-12-31', 2]] });
  const p = portfolio('USD', [tx('2025-06-30', 'Buy', 'MWR', 1, 100)], { autoDividend: true, dividendTaxRate: 30 });
  const { r } = run(p, [c]);
  const h = r.holdings[0];
  near(h.totalGain, 10 + 1.4);
  // the return sits between a dividend paid at the end (11.4%) and at the start (≈ 11.5%)
  assert.ok(h.totalReturn > 0.114 && h.totalReturn < 0.1155, String(h.totalReturn));
  balanced(r);
});

// ---------------------------------------------------------------- payment dates: cash on the day it is paid

test('dividend payment date: value from the ex-date, cash only on the published payment date', () => {
  // $1 a share on 100 shares, ex 2026-03-02, paid 2026-03-20; the price drops by the dividend on the ex-date
  const c = chart('DIV', 'USD', (d) => (d < '2026-03-02' ? 50 : 49), { dividends: [['2026-03-02', 1]] });
  const p = portfolio('USD', [tx('2026-01-02', 'Deposit', 'CASH', 5000, 1), tx('2026-01-02', 'Buy', 'DIV', 100, 50)], { autoDividend: true, dividendTaxRate: 30 });
  const { r } = run(p, [c], { payouts: { DIV: paidOn([['2026-03-02', '2026-03-20']]) } });
  const at = (d: string) => r.series[r.dateIndex.get(d)!];
  // before the ex-date: nothing
  near(at('2026-02-27').toBePaid, 0);
  near(at('2026-02-27').cash, 0);
  // from the ex-date: $70 after withholding to be paid, in value but not in cash; the price drop is offset
  near(at('2026-03-02').toBePaid, 70);
  near(at('2026-03-02').cash, 0);
  near(at('2026-03-02').value, 100 * 49 + 70);
  near(at('2026-03-19').toBePaid, 70);
  // on the payment date it moves to cash
  near(at('2026-03-20').toBePaid, 0);
  near(at('2026-03-20').cash, 70);
  near(at('2026-03-20').value, at('2026-03-19').value);
  near(r.cash, 70);
  near(r.toBePaid, 0);
  const ev = r.dividends.find((d) => d.symbol === 'DIV')!;
  assert.equal(ev.status, 'received');
  assert.equal(ev.payDate, '2026-03-20');
  assert.equal(ev.paySource, 'sgx');
  balanced(r);
});

test('dividend payment date: still to be paid when the date is ahead or not published', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2026-05-04', 1], ['2026-06-01', 2]] });
  const p = portfolio('USD', [tx('2026-01-02', 'Deposit', 'CASH', 5000, 1), tx('2026-01-02', 'Buy', 'DIV', 100, 50)], { autoDividend: true });
  // May's is paid after today; June's has no payment date published yet
  const { r } = run(p, [c], { payouts: { DIV: paidOn([['2026-05-04', '2026-07-10'], ['2026-06-01', null]]) } });
  near(r.cash, 0);
  near(r.toBePaid, 300);
  near(r.value, 5000 + 300);
  near(r.pnl.dividends, 300); // income from the ex-date
  const st = Object.fromEntries(r.dividends.filter((d) => d.symbol === 'DIV').map((d) => [d.exDate, [d.status, d.payKnown]]));
  assert.deepEqual(st, { '2026-05-04': ['toBePaid', true], '2026-06-01': ['toBePaid', false] });
  assert.ok(r.toBePaidRow);
  near(r.toBePaidRow!.allocation + r.cashRow.allocation + r.holdings.reduce((s, h) => s + h.allocation, 0), 1);
  balanced(r);
});

test('dividend payment date: a date you type wins; with none, no source means to be paid, never a guess', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2026-03-02', 1]] });
  const base = [tx('2026-01-02', 'Deposit', 'CASH', 5000, 1), tx('2026-01-02', 'Buy', 'DIV', 100, 50)];
  const none = run(portfolio('USD', base, { autoDividend: true }), [c]).r;
  near(none.cash, 0);
  near(none.toBePaid, 100);
  const typed = run(portfolio('USD', base, { autoDividend: true, payDates: { 'DIV|2026-03-02': '2026-03-25' } }), [c], { payouts: { DIV: paidOn([['2026-03-02', '2026-03-20']]) } }).r;
  near(typed.cash, 100);
  near(typed.toBePaid, 0);
  const ev = typed.dividends.find((d) => d.symbol === 'DIV')!;
  assert.equal(ev.payDate, '2026-03-25');
  assert.equal(ev.paySource, 'you');
  assert.equal(typed.series[typed.dateIndex.get('2026-03-24')!].toBePaid, 100);
  balanced(none);
  balanced(typed);
});

test('dividend payment date: a connector record a day off the ex-date still matches', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2026-03-02', 1]] });
  const p = portfolio('USD', [tx('2026-01-02', 'Deposit', 'CASH', 5000, 1), tx('2026-01-02', 'Buy', 'DIV', 100, 50)], { autoDividend: true });
  const { r } = run(p, [c], { payouts: { DIV: paidOn([['2026-03-03', '2026-03-20']]) } });
  near(r.cash, 100);
  const far = run(p, [c], { payouts: { DIV: paidOn([['2026-03-09', '2026-03-20']]) } }).r;
  near(far.cash, 0); // a week away is another dividend
});

test('dividend payment date: spending a dividend whose date isn\'t published adds no deposit you didn\'t make', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2026-03-02', 1]] });
  // no deposits recorded: the buy is paid for by an automatic deposit; later $100 of dividend buys 2 more shares
  const txns = [tx('2026-01-02', 'Buy', 'DIV', 100, 50), tx('2026-04-01', 'Buy', 'DIV', 2, 50)];
  const { r } = run(portfolio('USD', txns, { autoDividend: true }), [c]);
  near(r.netDeposits, 5000);
  near(r.toBePaid, 100);
  near(r.cash, -100); // spent before its payment is recorded
  near(r.value, 102 * 50);
  balanced(r);
  // once its payment date is known, cash is back to 0
  const paid = run(portfolio('USD', txns, { autoDividend: true }), [c], { payouts: { DIV: paidOn([['2026-03-02', '2026-03-20']]) } }).r;
  near(paid.netDeposits, 5000);
  near(paid.cash, 0);
  near(paid.toBePaid, 0);
  balanced(paid);
});

test('announced dividends from a connector show as confirmed with their own dates', () => {
  const c = chart('DIV', 'USD', () => 50, { dividends: [['2026-03-02', 1]] });
  const p = portfolio('USD', [tx('2026-01-02', 'Buy', 'DIV', 100, 50)], { autoDividend: true });
  const payouts = { DIV: { source: 'nasdaq', checkedAt: 1, records: [
    { exDate: '2026-08-03', payDate: '2026-08-20', amount: 1.1, currency: 'USD', source: 'nasdaq' },
    { exDate: '2026-03-02', payDate: '2026-03-20', amount: 1, currency: 'USD', source: 'nasdaq' },
  ] } };
  const { r } = run(p, [c], { payouts });
  const next = r.dividends.find((d) => d.symbol === 'DIV' && d.exDate === '2026-08-03')!;
  assert.equal(next.status, 'confirmed');
  assert.equal(next.payDate, '2026-08-20');
  assert.equal(next.payKnown, true);
  near(next.amountBase, 110);
  // a year after the last one, an estimate, paid the usual 18 days after its ex-date (from the published ones)
  const est = r.dividends.find((d) => d.symbol === 'DIV' && d.exDate === '2027-03-02')!;
  assert.equal(est.status, 'estimated');
  assert.equal(est.payKnown, false);
  assert.equal(est.payDate, '2027-03-20');
  assert.equal(r.dividends.filter((d) => d.symbol === 'DIV' && d.exDate > TODAY).length, 2);
});
