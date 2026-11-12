// The Muse space's bridge (muse/client/src/host.ts): loadState retries a failed getPortfolio, because the first
// action call of a session can fail once on a phone while the shell's bridge is still cold. A load that keeps
// failing must throw, never return null (null reads as an empty portfolio).
//
// host.ts imports `callAction` from the Spaces starter's own ./api module, which isn't in this repository, so that
// one import is pointed at a fake the tests control. Timers are mocked, so the backoff runs instantly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

type CallAction = (name: string, input: unknown) => Promise<any>;
const g = globalThis as any;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './api' && context.parentURL?.endsWith('/muse/client/src/host.ts')) {
      const src = 'export const callAction = (name, input) => globalThis.__museCallAction(name, input);';
      return { url: `data:text/javascript,${encodeURIComponent(src)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

g.window = {};
await import('../muse/client/src/host.ts');
const host = g.window.portfolioHost as {
  name: string;
  loadState(): Promise<unknown>;
  fetchJson(url: string): Promise<unknown>;
};

const STATE = { version: 1, activePortfolioId: 'p1', portfolios: [{ id: 'p1', transactions: [] }] };
const BRIDGE_ERROR = 'Spaces bridge request failed';

/** a getPortfolio that fails on the attempts `failOn` picks (1-based), returns the saved portfolio otherwise, and
 *  counts its calls */
function portfolioAction(failOn: (n: number) => boolean) {
  const calls: string[] = [];
  const fake: CallAction = async (name) => {
    calls.push(name);
    if (failOn(calls.length)) throw new Error(`${BRIDGE_ERROR} (attempt ${calls.length})`);
    return { state: STATE };
  };
  g.__museCallAction = fake;
  return calls;
}

/** lets every pending promise step run, without moving the mocked clock */
const flush = () => new Promise((r) => setImmediate(r));

/** settles into `out` instead of being awaited, so a hanging promise fails an assertion instead of the run */
function watch(p: Promise<unknown>) {
  const out: { value?: unknown; error?: Error; settled: boolean } = { settled: false };
  p.then((value) => Object.assign(out, { value, settled: true }), (error) => Object.assign(out, { error, settled: true }));
  return out;
}

test('a load that succeeds returns at once, with no retry and no wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = portfolioAction(() => false);
  const out = watch(host.loadState());
  await flush();
  assert.equal(out.settled, true, 'resolved without the clock moving');
  assert.deepEqual(out.value, STATE);
  assert.deepEqual(calls, ['getPortfolio']);
});

test('a space with no saved portfolio still loads as null (a new space starts empty)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const result of [{ state: null }, {}, null, undefined]) {
    const calls: string[] = [];
    g.__museCallAction = async (name: string) => { calls.push(name); return result; };
    const out = watch(host.loadState());
    await flush();
    assert.equal(out.settled, true);
    assert.equal(out.value, null);
    assert.equal(calls.length, 1);
  }
});

test('getPortfolio failing once, then succeeding on the retry, returns the state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = portfolioAction((n) => n === 1);
  const out = watch(host.loadState());
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(out.settled, false, 'waits for the retry instead of failing');

  t.mock.timers.tick(699);
  await flush();
  assert.equal(calls.length, 1, 'no retry before 700 ms');
  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(out.settled, true);
  assert.deepEqual(out.value, STATE);
});

test('getPortfolio failing on every attempt throws the last error after 4 retries, and never returns null', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = portfolioAction(() => true);
  const out = watch(host.loadState());
  await flush();

  for (const [i, ms] of [700, 1500, 3000, 5000].entries()) {
    assert.equal(calls.length, i + 1);
    assert.equal(out.settled, false, `still retrying after attempt ${i + 1}`);
    t.mock.timers.tick(ms - 1);
    await flush();
    assert.equal(calls.length, i + 1, `no retry before ${ms} ms`);
    t.mock.timers.tick(1);
    await flush();
  }

  assert.equal(calls.length, 5, 'the first call and 4 retries');
  assert.equal(out.settled, true);
  assert.ok(out.error instanceof Error, 'rejected, not resolved');
  assert.equal(out.error.message, `${BRIDGE_ERROR} (attempt 5)`);
  assert.equal(out.value, undefined);

  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(calls.length, 5, 'no further attempts once it has given up');
});

test('the rest of the bridge is unchanged: same name, and market calls are not retried here', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(host.name, 'Muse space storage');
  const calls: Array<[string, unknown]> = [];
  g.__museCallAction = async (name: string, input: unknown) => { calls.push([name, input]); throw new Error(BRIDGE_ERROR); };
  const url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL';
  await assert.rejects(host.fetchJson(url), new RegExp(BRIDGE_ERROR));
  assert.deepEqual(calls, [['yahooGet', { url }]], 'the app retries market data itself');
});
