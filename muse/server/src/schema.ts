// The space's storage: two tables. There is no schema for holdings, lots or prices. The portfolio stays one JSON
// document, exactly the shape the app saves, and the market snapshot is a set of raw Yahoo responses.
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appState = sqliteTable('app_state', {
  /** "portfolio": the whole app state */
  key: text('key').primaryKey(),
  /** the AppState JSON, as a string */
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(sql`(CAST(strftime('%s','now') AS INTEGER) * 1000)`),
});

export const marketCache = sqliteTable('market_cache', {
  /** the snapshot key: chart:<SYMBOL>, spark:<SYM,SYM,...> or search:<SYMBOL> */
  symbol: text('symbol').primaryKey(),
  /** the Yahoo response JSON, as a string */
  data: text('data').notNull(),
  /** epoch ms of the last successful fetch */
  fetchedAt: integer('fetched_at').notNull(),
});
