// The Muse space's server logic (muse/server/src/market.ts) and its round trip into the app: what the scheduled
// refresh stores is exactly what the app can open on. Uses a fixed fake Yahoo, so no network is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as market from '../muse/server/src/market.ts';
import { cachedCharts, cachedProfiles, cachedQuotes, requestKey, seedMarketCache } from '../src/market/client.ts';

// ---------------------------------------------------------------- a fake Yahoo

const CURRENCY: Record<string, string> = { AAPL: 'USD', 'ASML.AS': 'EUR', 'VOD.L': 'GBp', '^GSPC': 'USD', 'EURUSD=X': 'USD', 'GBPUSD=X': 'USD' };
const calls: string[] = [];
let failing = new Set<string>();

function body(url: string): unknown {
  const u = new URL(url);
  const chart = u.pathname.match(/^\/v8\/finance\/chart\/(.+)$/);
  if (chart) {
    const s = decodeURIComponent(chart[1]);
    if (!(s in CURRENCY)) return { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } };
    const ts = [1767225600, 1767312000, 1767398400]; // 2026-01-01 .. 03
    return { chart: { result: [{ meta: { symbol: s, currency: CURRENCY[s], gmtoffset: 0, longName: `${s} Inc` }, timestamp: ts, indicators: { quote: [{ open: [10, 11, 12], high: [10, 11, 12], low: [10, 11, 12], close: [10, 11, 12] }] }, events: { dividends: { 1767312000: { date: 1767312000, amount: 0.25 } } } }], error: null } };
  }
  if (u.pathname === '/v7/finance/spark') {
    const symbols = (u.searchParams.get('symbols') ?? '').split(',');
    return { spark: { result: symbols.map((s) => ({ symbol: s, response: [{ meta: { regularMarketPrice: 12, chartPreviousClose: 11, currency: CURRENCY[s] ?? 'USD', regularMarketTime: 1767398400 } }] })) } };
  }
  if (u.pathname === '/v1/finance/search') {
    const q = u.searchParams.get('q') ?? '';
    return { quotes: [{ symbol: q, longname: `${q} Inc`, quoteType: 'EQUITY', exchDisp: 'NASDAQ', sectorDisp: 'Technology', industryDisp: 'Consumer Electronics' }] };
  }
  return null;
}

const fakeFetch: market.FetchLike = async (url) => {
  calls.push(url);
  if ([...failing].some((s) => url.includes(encodeURIComponent(s)))) throw new Error('network down');
  const b = body(url);
  return { status: b ? 200 : 404, text: async () => (b ? JSON.stringify(b) : '<html>not found</html>') };
};

function memoryStore(state: unknown): market.SnapshotStore & { rows: Map<string, market.SnapshotRow> } {
  const rows = new Map<string, market.SnapshotRow>();
  return {
    rows,
    readState: async () => (state == null ? null : JSON.stringify(state)),
    readRows: async (since) => [...rows.values()].filter((r) => !since || r.fetchedAt > since),
    writeRows: async (rs) => { for (const r of rs) rows.set(r.key, r); },
    deleteRows: async (keys) => { for (const k of keys) rows.delete(k); },
  };
}

const STATE = {
  version: 1, activePortfolioId: 'p2',
  portfolios: [
    { id: 'p1', currency: 'SGD', benchmark: '^STI', benchmarks: [], transactions: [{ symbol: 'Z74.SI', currency: 'Market' }], customAssets: [] },
    {
      id: 'p2', currency: 'USD', benchmark: '^GSPC', benchmarks: ['^GSPC'],
      transactions: [
        { symbol: 'aapl', currency: 'Market' }, { symbol: 'ASML.AS', currency: 'Market' }, { symbol: 'VOD.L', currency: 'Market' },
        { symbol: 'CASH', currency: 'USD' }, { symbol: 'FLAT', currency: 'USD' },
      ],
      customAssets: [{ symbol: 'FLAT', currency: 'USD', prices: [] }],
    },
  ],
};

// ---------------------------------------------------------------- yahooGet

test('yahooGet accepts only the two Yahoo hosts', async () => {
  await assert.rejects(market.yahooGet('https://example.com/x', fakeFetch), /only accepts/);
  await assert.rejects(market.yahooGet('http://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL', fakeFetch), /only accepts/);
  await assert.rejects(market.yahooGet('https://query1.finance.yahoo.com.evil.example/x', fakeFetch), /only accepts/);
  const j = await market.yahooGet('https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL&range=1d&interval=1d', fakeFetch) as any;
  assert.equal(j.spark.result[0].symbol, 'AAPL');
});

test('yahooGet returns Yahoo error JSON as it is, and refuses a body that is not JSON', async () => {
  const j = await market.yahooGet(market.chartUrl('NOPE'), fakeFetch) as any;
  assert.equal(j.chart.error.code, 'Not Found');
  await assert.rejects(market.yahooGet('https://query1.finance.yahoo.com/unknown', fakeFetch), /non-JSON body \(HTTP 404\)/);
});

// ---------------------------------------------------------------- symbols

test('neededSymbols follows the active portfolio, without CASH or custom assets', () => {
  const n = market.neededSymbols(JSON.stringify(STATE))!;
  assert.deepEqual(n.assets, ['AAPL', 'ASML.AS', 'VOD.L']);
  assert.deepEqual(n.benchmarks, ['^GSPC']);
  assert.equal(n.base, 'USD');
  assert.equal(market.neededSymbols(null), null);
  assert.equal(market.neededSymbols('not json'), null);
});

test('the app and the server key requests the same way', () => {
  assert.equal(requestKey(market.chartUrl('ASML.AS', 1)), 'chart:ASML.AS');
  assert.equal(requestKey(market.chartUrl('ASML.AS', 2)), 'chart:ASML.AS'); // the time window doesn't matter
  assert.equal(requestKey(market.sparkUrl(['AAPL', '^GSPC'])), 'spark:AAPL,^GSPC');
});

// ---------------------------------------------------------------- the scheduled refresh

test('refreshMarketCache stores history, quotes and profiles, with FX pairs from each instrument\'s currency', async () => {
  failing = new Set();
  const store = memoryStore(STATE);
  const r = await market.refreshMarketCache(store, fakeFetch, 1_000_000);
  const keys = [...store.rows.keys()].sort();
  assert.deepEqual(keys, [
    'chart:AAPL', 'chart:ASML.AS', 'chart:EURUSD=X', 'chart:GBPUSD=X', 'chart:VOD.L', 'chart:^GSPC',
    'search:AAPL', 'search:ASML.AS', 'search:VOD.L',
    'spark:AAPL,ASML.AS,VOD.L,^GSPC,EURUSD=X,GBPUSD=X',
  ]);
  assert.equal(r.symbols, 6);
  assert.equal(r.updated, 10);
  assert.equal(r.failed, 0);
  for (const row of store.rows.values()) assert.equal(row.fetchedAt, 1_000_000);
});

test('a failed fetch keeps the last good row', async () => {
  failing = new Set();
  const store = memoryStore(STATE);
  await market.refreshMarketCache(store, fakeFetch, 1_000);
  failing = new Set(['ASML.AS']);
  const r = await market.refreshMarketCache(store, fakeFetch, 2_000);
  assert.ok(r.failed >= 2); // the chart, the profile and the quote chunk that includes it
  assert.equal(store.rows.get('chart:ASML.AS')!.fetchedAt, 1_000); // kept, not removed or overwritten
  assert.equal(store.rows.get('chart:AAPL')!.fetchedAt, 2_000);
  failing = new Set();
});

test('quote chunks from an older symbol list are replaced', async () => {
  failing = new Set();
  const store = memoryStore(STATE);
  store.rows.set('spark:OLD,LIST', { key: 'spark:OLD,LIST', data: '{}', fetchedAt: 1 });
  await market.refreshMarketCache(store, fakeFetch, 5_000);
  assert.ok(!store.rows.has('spark:OLD,LIST'));
});

test('no portfolio yet: nothing to do, no error', async () => {
  const r = await market.refreshMarketCache(memoryStore(null), fakeFetch);
  assert.equal(r.symbols, 0);
  assert.equal(r.ok, true);
});

// ---------------------------------------------------------------- snapshot read / save

test('getSnapshot returns parsed rows, newer than `since` when given', async () => {
  const store = memoryStore(STATE);
  await store.writeRows([
    { key: 'chart:A', data: '{"x":1}', fetchedAt: 10 },
    { key: 'spark:A', data: '{"x":2}', fetchedAt: 20 },
    { key: 'other', data: '{}', fetchedAt: 30 },
    { key: 'search:A', data: 'not json', fetchedAt: 40 },
  ]);
  const all = await market.getSnapshot(store);
  assert.deepEqual(all.entries.map((e) => e.key), ['chart:A', 'spark:A']);
  assert.equal(all.updatedAt, 20);
  const newer = await market.getSnapshot(store, 15);
  assert.deepEqual(newer.entries.map((e) => e.key), ['spark:A']);
});

test('saveSnapshotEntries keeps only snapshot keys with data, at most 60', async () => {
  const store = memoryStore(STATE);
  const many = Array.from({ length: 70 }, (_, i) => ({ key: `spark:S${i}`, data: { i }, fetchedAt: 5 }));
  const r1 = await market.saveSnapshotEntries(store, many);
  assert.equal(r1.saved, 60);
  const r2 = await market.saveSnapshotEntries(store, [{ key: 'portfolio', data: {}, fetchedAt: 1 }, { key: 'search:X', data: null, fetchedAt: 1 }, 'junk']);
  assert.equal(r2.saved, 0);
});

// ---------------------------------------------------------------- into the app

test('the app opens on what the refresh stored', async () => {
  failing = new Set();
  const store = memoryStore(STATE);
  const at = Date.UTC(2026, 0, 3, 12);
  await market.refreshMarketCache(store, fakeFetch, at);
  const { entries } = await market.getSnapshot(store);
  const added = await seedMarketCache(entries);
  assert.ok(added >= 10);

  const charts = await cachedCharts(['AAPL', 'ASML.AS', 'VOD.L', '^GSPC', 'EURUSD=X', 'GBPUSD=X']);
  assert.equal(Object.keys(charts).length, 6);
  assert.equal(charts['ASML.AS'].currency, 'EUR');
  assert.equal(charts.AAPL.bars.length, 3);
  assert.deepEqual(charts.AAPL.dividends, [['2026-01-02', 0.25]]);
  assert.equal(charts.AAPL.fetchedAt, at); // the snapshot's time, so the app refreshes on its own schedule

  const quotes = await cachedQuotes(['AAPL', 'EURUSD=X']);
  assert.equal(quotes.AAPL.price, 12);
  assert.equal(quotes.AAPL.fetchedAt, at);

  const profiles = await cachedProfiles(['AAPL']);
  assert.equal(profiles.AAPL.sector, 'Technology');

  // seeding never replaces newer data on the device with older data
  const older = entries.map((e) => ({ ...e, fetchedAt: at - 60_000 }));
  assert.equal(await seedMarketCache(older), 0);
});
