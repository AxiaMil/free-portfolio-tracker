// The dividend-date connectors (muse/server/src/payouts.ts) and the server's daily look-up (market.ts), on made-up
// answers in each exchange's own format: no network. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTORS, PAYOUT_HOSTS, clean, connectorsFor, epochDate, fetchPayouts, mergePayouts, sgtDate, usDate, type PayoutRecord } from '../muse/server/src/payouts.ts';
import { getPayouts, refreshMarketCache, updatePayouts, type PayoutKit, type SnapshotRow, type SnapshotStore } from '../muse/server/src/market.ts';

/** a fetch that answers each URL from `routes` (by substring) and records what was asked */
function fakeFetch(routes: Record<string, unknown>, asked: string[] = []) {
  return async (url: string, init?: { headers?: Record<string, string> }) => {
    asked.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return { status: 404, text: async () => '{}' };
    if (hit[1] instanceof Error) throw hit[1];
    assert.ok(init?.headers?.['User-Agent'], 'every request names a client');
    return { status: 200, text: async () => JSON.stringify(hit[1]) };
  };
}

const sgt = (iso: string) => Date.parse(`${iso}T00:00:00+08:00`); // SGX dates: midnight Singapore time, in ms

test('dates: US style and SGX epoch milliseconds become yyyy-mm-dd', () => {
  assert.equal(usDate('11/24/2026'), '2026-11-24');
  assert.equal(usDate('1/5/2026'), '2026-01-05');
  assert.equal(usDate('N/A'), null);
  assert.equal(sgtDate(sgt('2026-11-24')), '2026-11-24');
  assert.equal(sgtDate(null), null);
  assert.equal(epochDate(Date.UTC(2026, 11, 1) / 1000), '2026-12-01');
  assert.equal(epochDate(undefined), null);
});

test('which connector covers which listing', () => {
  const ids = (symbol: string, exchange: string | null) => connectorsFor({ symbol, exchange }).map((c) => c.id);
  assert.deepEqual(ids('ABC.SI', 'SES'), ['sgx']);
  assert.deepEqual(ids('CBA.AX', 'ASX'), ['asx']);
  // Nasdaq listings: Nasdaq's full history first, Yahoo's latest if Nasdaq fails; NYSE: Yahoo
  assert.deepEqual(ids('AAPL', 'NMS'), ['nasdaq', 'yahoo']);
  assert.deepEqual(ids('AAPL', 'NasdaqGS'), ['nasdaq', 'yahoo']);
  assert.deepEqual(ids('KO', 'NYQ'), ['yahoo']);
  assert.deepEqual(ids('BRK-B', 'NYQ'), ['yahoo']);
  assert.deepEqual(ids('^GSPC', 'SNP'), []);
  // Hong Kong, London: none built in; estimated, or the Muse space's own connector
  assert.deepEqual(ids('0700.HK', 'HKG'), []);
  assert.deepEqual(ids('VOD.L', 'LSE'), []);
  assert.deepEqual(PAYOUT_HOSTS, ['api.sgx.com', 'api.nasdaq.com', 'asx.api.markitdigital.com', 'fc.yahoo.com', 'query1.finance.yahoo.com']);
  for (const c of CONNECTORS) assert.ok(!('needsKey' in c), `${c.id} needs nothing set up`);
});

test('SGX: finds the internal code, then adds a payout announced in parts', async () => {
  const asked: string[] = [];
  const f = fakeFetch({
    'marketmetadata/v2?stock-code=ABC': { data: [{ stockCode: 'ABC', ibmCode: '9Z99' }] },
    'corporateactions/v1.0': { data: [
      { anncType: 'DIVIDEND', exDate: sgt('2026-08-13'), recDate: sgt('2026-08-14'), datePaid: sgt('2026-08-27'), particulars: 'Rate: SGD 0.067  Per Security' },
      { anncType: 'DIVIDEND', exDate: sgt('2026-08-13'), recDate: sgt('2026-08-14'), datePaid: sgt('2026-08-27'), particulars: 'Rate: SGD 0.019  Per Security' },
      { anncType: 'DIVIDEND', exDate: sgt('2026-11-13'), recDate: sgt('2026-11-16'), datePaid: null, particulars: 'Rate: SGD 0.81  Per Security' },
      { anncType: 'DIVIDEND', exDate: sgt('2026-02-11'), datePaid: sgt('2026-02-27'), particulars: '3 Cash Options' },
    ] },
  }, asked);
  const r = await fetchPayouts({ symbol: 'ABC.SI', exchange: 'SES' }, f);
  assert.equal(r.source, 'sgx');
  assert.ok(asked[1].includes('ibmcode=9Z99') && asked[1].includes('cat=DIVIDEND'));
  assert.deepEqual(r.records, [
    { exDate: '2026-11-13', payDate: null, recordDate: '2026-11-16', amount: 0.81, currency: 'SGD', source: 'sgx' },
    { exDate: '2026-08-13', payDate: '2026-08-27', recordDate: '2026-08-14', amount: 0.086, currency: 'SGD', source: 'sgx' },
    { exDate: '2026-02-11', payDate: '2026-02-27', recordDate: null, amount: null, currency: null, source: 'sgx' },
  ]);
});

test('Nasdaq: reads its dividend history, as a stock or else as an ETF', async () => {
  const asked: string[] = [];
  const f = fakeFetch({
    'quote/QQQX/dividends?assetclass=stocks': { data: { dividends: { rows: null } } },
    'quote/QQQX/dividends?assetclass=etf': { data: { dividends: { rows: [
      { exOrEffDate: '09/15/2026', paymentDate: '09/30/2026', recordDate: '09/15/2026', amount: '$0.34', currency: 'USD' },
      { exOrEffDate: '12/15/2026', paymentDate: 'N/A', recordDate: 'N/A', amount: '$0.35' },
    ] } } },
  }, asked);
  const r = await fetchPayouts({ symbol: 'QQQX', exchange: 'NasdaqGM' }, f);
  assert.equal(r.source, 'nasdaq');
  assert.equal(asked.length, 2);
  assert.deepEqual(r.records.map((x) => [x.exDate, x.payDate, x.amount]), [['2026-12-15', null, 0.35], ['2026-09-15', '2026-09-30', 0.34]]);
});

test('ASX: the latest dividend', async () => {
  const f = fakeFetch({ 'companies/xyz/key-statistics': { data: { dateExDate: '2026-08-19', datePayDate: '2026-09-29', dividend: 2.7, dividendCurrency: 'AUD' } } });
  const r = await fetchPayouts({ symbol: 'XYZ.AX', exchange: 'ASX' }, f);
  assert.deepEqual(r.records, [{ exDate: '2026-08-19', payDate: '2026-09-29', recordDate: null, amount: 2.7, currency: 'AUD', source: 'asx' }]);
});

test('Yahoo: one anonymous session for every US holding, the latest dividend, and a stale payment date dropped', async () => {
  const asked: string[] = [];
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;
  const quotes: Record<string, unknown> = {
    KOX: { exDividendDate: day('2026-12-01'), dividendDate: day('2026-12-15'), currency: 'USD' },
    OLDX: { exDividendDate: day('2026-12-01'), dividendDate: day('2026-09-15'), currency: 'USD' }, // the previous one's
  };
  const f = async (url: string, init?: { headers?: Record<string, string> }) => {
    asked.push(url);
    if (url.startsWith('https://fc.yahoo.com')) return { status: 404, text: async () => '', headers: { get: () => null, getSetCookie: () => ['A3=d=abc; Domain=.yahoo.com; Path=/', 'B=x'] } };
    assert.equal(init?.headers?.Cookie, 'A3=d=abc', 'only the session cookie is sent');
    if (url.includes('/getcrumb')) return { status: 200, text: async () => 'Crumb9' };
    const sym = new URL(url).searchParams.get('symbols') ?? '';
    assert.equal(new URL(url).searchParams.get('crumb'), 'Crumb9');
    return { status: 200, text: async () => JSON.stringify({ quoteResponse: { result: [{ symbol: sym, ...(quotes[sym] as object) }] } }) };
  };
  const ko = await fetchPayouts({ symbol: 'KOX', exchange: 'NYQ', currency: 'USD' }, f);
  assert.equal(ko.source, 'yahoo');
  assert.deepEqual(ko.records, [{ exDate: '2026-12-01', payDate: '2026-12-15', recordDate: null, amount: null, currency: 'USD', source: 'yahoo' }]);
  const old = await fetchPayouts({ symbol: 'OLDX', exchange: 'NYQ', currency: 'USD' }, f);
  assert.deepEqual(old.records.map((r) => [r.exDate, r.payDate]), [['2026-12-01', null]]);
  assert.equal(asked.filter((u) => u.startsWith('https://fc.yahoo.com')).length, 1, 'the session is reused');
  // no session: an error, never a throw
  const blocked = await fetchPayouts({ symbol: 'KOX', exchange: 'NYQ' }, async () => ({ status: 403, text: async () => '' }));
  assert.equal(blocked.source, null);
  assert.match(blocked.error ?? '', /yahoo: Yahoo gave no session/);
});

test('no built-in connector: the space\'s own one is asked; with none, no records and no error', async () => {
  const f = fakeFetch({});
  const none = await fetchPayouts({ symbol: 'VOD.L', exchange: 'LSE' }, f);
  assert.deepEqual(none, { symbol: 'VOD.L', records: [], source: null });
  const custom = async (a: { symbol: string }) => (a.symbol === 'VOD.L' ? [{ exDate: '2026-09-15', payDate: '2026-10-01', source: '' }] : null);
  const own = await fetchPayouts({ symbol: 'VOD.L', exchange: 'LSE' }, f, custom);
  assert.equal(own.source, 'custom');
  assert.deepEqual(own.records.map((x) => [x.exDate, x.payDate, x.source]), [['2026-09-15', '2026-10-01', 'custom']]);
});

test('a failure is reported, never thrown, and only connector hosts are ever asked', async () => {
  const r = await fetchPayouts({ symbol: 'ABC.SI', exchange: 'SES' }, fakeFetch({ 'marketmetadata': new Error('network down') }));
  assert.equal(r.source, null);
  assert.deepEqual(r.records, []);
  assert.match(r.error ?? '', /sgx: network down/);
  assert.ok(CONNECTORS.every((c) => c.hosts.every((h) => PAYOUT_HOSTS.includes(h))));
});

test('clean and merge: one record per ex-date, a pay date before the ex-date dropped, a known date never lost', () => {
  const recs: PayoutRecord[] = [
    { exDate: '2026-03-02', payDate: '2026-02-01', source: 'x' },
    { exDate: '2026-06-01', payDate: null, source: 'x' },
    { exDate: '2026-06-01', payDate: '2026-06-20', source: 'x' },
    { exDate: 'soon', payDate: null, source: 'x' },
  ];
  assert.deepEqual(clean(recs).map((r) => [r.exDate, r.payDate]), [['2026-06-01', '2026-06-20'], ['2026-03-02', null]]);
  const before = [{ exDate: '2026-03-02', payDate: '2026-03-20', source: 'asx' }];
  const fresh = [{ exDate: '2026-03-02', payDate: null, source: 'asx' }, { exDate: '2026-08-19', payDate: '2026-09-29', source: 'asx' }];
  assert.deepEqual(mergePayouts(before, fresh).map((r) => [r.exDate, r.payDate]), [['2026-08-19', '2026-09-29'], ['2026-03-02', '2026-03-20']]);
});

// ---------------------------------------------------------------- the server's look-ups (market.ts)

function memoryStore(state: unknown): SnapshotStore & { rows: Map<string, SnapshotRow> } {
  const rows = new Map<string, SnapshotRow>();
  return {
    rows,
    async readState() { return JSON.stringify(state); },
    async readRows(since) { return [...rows.values()].filter((r) => !since || r.fetchedAt > since); },
    async writeRows(rs) { for (const r of rs) rows.set(r.key, r); },
    async deleteRows(keys) { for (const k of keys) rows.delete(k); },
  };
}

const kitWith = (answer: (symbol: string) => PayoutRecord[] | Error, calls: string[] = []): PayoutKit => ({
  async fetchPayouts(a) {
    calls.push(a.symbol);
    const x = answer(a.symbol);
    return x instanceof Error ? { symbol: a.symbol, records: [], source: null, error: x.message } : { symbol: a.symbol, records: x, source: x.length ? 'sgx' : null };
  },
  mergePayouts,
});

test('daily look-up: at most once a day, "check now" at most once a minute, and a failure keeps the dates', async () => {
  const store = memoryStore({});
  const calls: string[] = [];
  let fail = false;
  const kit = kitWith(() => (fail ? new Error('busy') : [{ exDate: '2026-08-13', payDate: '2026-08-27', source: 'sgx' }]), calls);
  const t0 = Date.UTC(2026, 10, 13);
  const ask = [{ symbol: 'ABC.SI', exchange: 'SES' }];
  await updatePayouts(store, ask, kit, { now: t0 });
  await updatePayouts(store, ask, kit, { now: t0 + 3600_000 }); // an hour later: not asked again
  await updatePayouts(store, ask, kit, { now: t0 + 3600_000 + 30_000, force: true }); // check now, a minute after the last
  assert.deepEqual(calls, ['ABC.SI', 'ABC.SI']);
  fail = true;
  const { rows } = await updatePayouts(store, ask, kit, { now: t0 + 22 * 3600_000 }); // the next day
  assert.equal(calls.length, 3);
  assert.deepEqual(rows['ABC.SI'].records.map((r) => r.payDate), ['2026-08-27']);
  assert.equal(rows['ABC.SI'].source, 'sgx');
  assert.equal(rows['ABC.SI'].error, 'busy');
  assert.ok(store.rows.has('payouts:ABC.SI'));
});

test('getPayouts: takes only well-formed asks, at most 60', async () => {
  const store = memoryStore({});
  const calls: string[] = [];
  const kit = kitWith(() => [], calls);
  const asks = [{ symbol: 'abc.si', exchange: 'SES' }, { symbol: 42 }, null, { symbol: 'x'.repeat(40) }, ...Array.from({ length: 70 }, (_, i) => ({ symbol: `S${i}` }))];
  const r = await getPayouts(store, { asks }, kit);
  assert.equal(r.ok, true);
  assert.ok('ABC.SI' in r.payouts);
  assert.ok(calls.length <= 60);
  assert.ok(!calls.some((s) => s.length > 30));
});

test('the scheduled refresh looks up payment dates only for holdings that pay dividends', async () => {
  const state = { activePortfolioId: 'p', portfolios: [{ id: 'p', currency: 'SGD', benchmark: 'ES3.SI', transactions: [
    { symbol: 'ABC.SI', currency: 'Market' }, { symbol: 'GROW.SI', currency: 'Market' },
  ] }] };
  const store = memoryStore(state);
  const chart = (symbol: string, divs: boolean) => ({ chart: { result: [{ meta: { currency: 'SGD', exchangeName: 'SES' }, events: divs ? { dividends: { 1: { amount: 0.1, date: 1 } } } : {}, timestamp: [1], indicators: { quote: [{ close: [1] }] } }] } });
  const f = async (url: string) => ({ status: 200, text: async () => JSON.stringify(url.includes('/chart/ABC.SI') ? chart('ABC.SI', true) : url.includes('/chart/') ? chart('X', false) : url.includes('spark') ? { spark: { result: [{}] } } : { quotes: [{}] }) });
  const calls: string[] = [];
  const res = await refreshMarketCache(store, f, Date.UTC(2026, 10, 13), kitWith(() => [{ exDate: '2026-08-13', payDate: '2026-08-27', source: 'sgx' }], calls));
  assert.deepEqual(calls, ['ABC.SI']);
  assert.equal(res.payouts, 1);
  const row = JSON.parse(store.rows.get('payouts:ABC.SI')!.data);
  assert.equal(row.source, 'sgx');
  // without the kit (an older actions.ts), the refresh does what it always did
  const plain = await refreshMarketCache(memoryStore(state), f, Date.UTC(2026, 10, 13));
  assert.equal(plain.payouts, 0);
});
