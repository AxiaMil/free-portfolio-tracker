// The space's server actions. Six actions; the app reaches them through window.portfolioHost (client/bridge.ts).
//
//   getPortfolio()                      -> { state }            the saved portfolio, or null the first time
//   savePortfolio({ state })            -> { ok: true }         the whole portfolio as one JSON document
//   yahooGet({ url })                   -> parsed JSON body     allow-listed Yahoo Finance GET
//   getSnapshot({ since? })             -> { entries, updatedAt } market snapshot rows fetched after `since`
//   saveSnapshotEntries({ entries })    -> { ok, saved }        fresh quotes / profiles from the open app
//   refreshMarketCache()                -> { ok, symbols, updated, failed, at }  run every 10 minutes (space.json)
//
// The only line to connect is the `db` import: this space's Drizzle database from the Spaces starter.
import { eq, gt, inArray } from 'drizzle-orm';
import { db } from './db';
import { appState, marketCache } from './schema';
import * as market from './market';

const STATE_KEY = 'portfolio';

async function readState(): Promise<string | null> {
  const rows = await db.select().from(appState).where(eq(appState.key, STATE_KEY)).limit(1);
  return rows[0]?.value ?? null;
}

const store: market.SnapshotStore = {
  readState,
  async readRows(since) {
    const q = db.select().from(marketCache);
    const rows = await (since ? q.where(gt(marketCache.fetchedAt, since)) : q);
    return rows.map((r) => ({ key: r.symbol, data: r.data, fetchedAt: r.fetchedAt }));
  },
  async writeRows(rows) {
    for (const r of rows) {
      await db.insert(marketCache).values({ symbol: r.key, data: r.data, fetchedAt: r.fetchedAt })
        .onConflictDoUpdate({ target: marketCache.symbol, set: { data: r.data, fetchedAt: r.fetchedAt } });
    }
  },
  async deleteRows(keys) {
    if (keys.length) await db.delete(marketCache).where(inArray(marketCache.symbol, keys));
  },
};

/** the saved portfolio (parsed), or null when nothing has been saved yet: a new space starts empty */
export async function getPortfolio(_input: Record<string, never> = {}) {
  const value = await readState();
  if (value == null) return { state: null };
  try {
    return { state: JSON.parse(value) };
  } catch {
    return { state: null };
  }
}

/** stores the whole portfolio (an object or a JSON string) under "portfolio" */
export async function savePortfolio(input: { state: unknown }) {
  const value = typeof input?.state === 'string' ? input.state : JSON.stringify(input?.state ?? null);
  if (value === 'null') throw new Error('savePortfolio: no state');
  JSON.parse(value); // must be valid JSON
  const updatedAt = Date.now();
  await db.insert(appState).values({ key: STATE_KEY, value, updatedAt })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt } });
  return { ok: true as const };
}

/** the app's market-data route: only https://query1|query2.finance.yahoo.com/, no key, cookies or login */
export async function yahooGet(input: { url: string }) {
  return market.yahooGet(input?.url);
}

export async function getSnapshot(input: { since?: number } = {}) {
  return market.getSnapshot(store, Number(input?.since) || 0);
}

export async function saveSnapshotEntries(input: { entries: unknown }) {
  return market.saveSnapshotEntries(store, input?.entries);
}

/** the scheduled job (every 10 minutes, open or not) */
export async function refreshMarketCache(_input: Record<string, never> = {}) {
  return market.refreshMarketCache(store);
}
