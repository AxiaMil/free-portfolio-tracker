// Dividend payment dates from the exchanges' own public data: "connectors", one per exchange or data service.
// Yahoo's free data dates each dividend by its ex-date only; a connector adds the date the company pays it, so the
// app counts a dividend in your cash on the day it is paid, and as "to be paid" from the ex-date until then.
//
// Plain TypeScript with no imports, so the same file runs in the Muse space's server (actions.ts), in `npm run dev`
// and `npm start` (vite.config.ts), in Node or in a worker. Each connector only reads public data of its own hosts
// (listed in `hosts`): no sign-up, no API key, no login and no cookies, so there is nothing for the user to set up.
//
// Holdings these don't cover (an NYSE share, a Hong Kong or London listing, ...) are the Muse space's own job: Muse
// writes custom-payouts.ts for exactly the user's holdings, from public pages. Adding an exchange for everyone:
// write a Connector (match the Yahoo symbols it covers, fetch, return PayoutRecords) and put it in CONNECTORS.

/** one dividend as the company announced it. Dates are ISO yyyy-mm-dd in the exchange's own calendar. */
export interface PayoutRecord {
  exDate: string;
  /** the payment date; null when the company has not published it yet */
  payDate: string | null;
  recordDate?: string | null;
  /** per share, in `currency`; the sum of the parts when a payout is announced in parts */
  amount?: number | null;
  currency?: string | null;
  /** which connector reported it (sgx, nasdaq, asx, custom, ...) */
  source: string;
}

/** what the app knows about a holding: its Yahoo symbol and Yahoo's exchange code (NMS, NYQ, SES, ASX, ...) */
export interface PayoutAsk {
  symbol: string;
  exchange?: string | null;
  currency?: string | null;
  name?: string | null;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;

export interface Connector {
  id: string;
  /** what the user sees in Settings */
  name: string;
  covers: string;
  /** every host it reads; a Muse space allows exactly these (manifest.json, network) */
  hosts: string[];
  matches(a: PayoutAsk): boolean;
  fetch(a: PayoutAsk, get: GetText): Promise<PayoutRecord[]>;
}

type GetText = (url: string, headers?: Record<string, string>) => Promise<string>;

const TIMEOUT_MS = 20_000;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (s: unknown): string | null => (typeof s === 'string' && ISO.test(s) ? s : null);
/** "11/24/2026" (US style) -> "2026-11-24"; "N/A", "None" and anything else -> null */
export function usDate(s: unknown): string | null {
  const m = typeof s === 'string' ? s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}
/** SGX dates are epoch milliseconds at midnight Singapore time (UTC+8) */
export function sgtDate(ms: unknown): string | null {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n + 8 * 3600_000).toISOString().slice(0, 10) : null;
}
const money = (s: unknown): number | null => {
  const n = typeof s === 'number' ? s : Number(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null;
};
const json = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };
const suffix = (s: string) => (s.includes('.') ? s.slice(s.lastIndexOf('.') + 1).toUpperCase() : '');
const code = (s: string) => (s.includes('.') ? s.slice(0, s.lastIndexOf('.')) : s).toUpperCase();

// Yahoo's exchange codes for US listings
const NASDAQ = new Set(['NMS', 'NGM', 'NCM', 'NAS', 'NASDAQ']);

// ---------------------------------------------------------------- Singapore: SGX

const sgx: Connector = {
  id: 'sgx',
  name: 'SGX (Singapore Exchange)',
  covers: 'Shares, REITs and ETFs listed in Singapore (symbols ending in .SI)',
  hosts: ['api.sgx.com'],
  matches: (a) => suffix(a.symbol) === 'SI',
  async fetch(a, get) {
    // SGX's corporate actions are filed under an internal code (DBS: D05 -> 1L01), which its market metadata gives
    const meta = json(await get(`https://api.sgx.com/marketmetadata/v2?stock-code=${encodeURIComponent(code(a.symbol))}`));
    const ibm = meta?.data?.[0]?.ibmCode;
    if (!ibm) return [];
    const body = json(await get(`https://api.sgx.com/corporateactions/v1.0?pagestart=0&pagesize=250&ibmcode=${encodeURIComponent(ibm)}&cat=DIVIDEND&orderby=exdate&order=desc`));
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    // a payout announced in parts (tax-exempt, one-tier, capital) is one row per part: add the parts up per ex-date
    const by = new Map<string, PayoutRecord>();
    for (const r of rows) {
      if (r?.anncType && String(r.anncType).toUpperCase() !== 'DIVIDEND') continue;
      const exDate = sgtDate(r?.exDate);
      if (!exDate) continue;
      const rate = String(r?.particulars ?? '').match(/Rate:\s*([A-Z]{3})\s*([0-9.]+)/i);
      const cur = by.get(exDate) ?? { exDate, payDate: null, recordDate: sgtDate(r?.recDate), amount: null, currency: null, source: 'sgx' };
      const paid = sgtDate(r?.datePaid);
      if (paid && (!cur.payDate || paid > cur.payDate)) cur.payDate = paid;
      if (rate) {
        cur.amount = Math.round(((cur.amount ?? 0) + Number(rate[2])) * 1e8) / 1e8;
        cur.currency = rate[1].toUpperCase();
      }
      by.set(exDate, cur);
    }
    return [...by.values()];
  },
};

// ---------------------------------------------------------------- US: Nasdaq (Nasdaq-listed only)

const NASDAQ_HEADERS = { 'User-Agent': BROWSER_UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };

const nasdaq: Connector = {
  id: 'nasdaq',
  name: 'Nasdaq',
  covers: 'Shares and ETFs listed on Nasdaq (Nasdaq publishes dividend history only for its own listings)',
  hosts: ['api.nasdaq.com'],
  // Yahoo's exchange code (NMS, NGM, NCM) or its full name (NasdaqGS, NasdaqGM, NasdaqCM)
  matches: (a) => !a.symbol.includes('.') && !!a.exchange && (NASDAQ.has(a.exchange.toUpperCase()) || /^NASDAQ/i.test(a.exchange)),
  async fetch(a, get) {
    for (const cls of ['stocks', 'etf']) {
      const body = json(await get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(a.symbol)}/dividends?assetclass=${cls}`, NASDAQ_HEADERS));
      const rows: any[] = body?.data?.dividends?.rows ?? [];
      if (!rows.length) continue;
      return rows
        .map((r): PayoutRecord | null => {
          const exDate = usDate(r?.exOrEffDate);
          return exDate ? { exDate, payDate: usDate(r?.paymentDate), recordDate: usDate(r?.recordDate), amount: money(r?.amount), currency: r?.currency || 'USD', source: 'nasdaq' } : null;
        })
        .filter((r): r is PayoutRecord => !!r);
    }
    return [];
  },
};

// ---------------------------------------------------------------- Australia: ASX (latest dividend)

const asx: Connector = {
  id: 'asx',
  name: 'ASX (Australian Securities Exchange)',
  covers: 'Shares and ETFs listed in Australia (symbols ending in .AX); the latest dividend each time, kept as it builds up',
  hosts: ['asx.api.markitdigital.com'],
  matches: (a) => suffix(a.symbol) === 'AX',
  async fetch(a, get) {
    const body = json(await get(`https://asx.api.markitdigital.com/asx-research/1.0/companies/${encodeURIComponent(code(a.symbol).toLowerCase())}/key-statistics`, { 'User-Agent': BROWSER_UA, Accept: 'application/json' }));
    const d = body?.data;
    const exDate = iso(d?.dateExDate);
    if (!exDate) return [];
    return [{ exDate, payDate: iso(d?.datePayDate), amount: money(d?.dividend), currency: d?.dividendCurrency || 'AUD', source: 'asx' }];
  },
};

/** in the order they are tried: the first that answers with records wins */
export const CONNECTORS: Connector[] = [sgx, nasdaq, asx];
export const PAYOUT_HOSTS = [...new Set(CONNECTORS.flatMap((c) => c.hosts))];

/** the built-in connectors that cover a holding; none means it is the Muse space's own connector's job */
export function connectorsFor(a: PayoutAsk): Connector[] {
  return CONNECTORS.filter((c) => c.matches(a));
}

function textGetter(fetchImpl: FetchLike): GetText {
  return async (url, headers) => {
    const host = new URL(url).hostname;
    if (!PAYOUT_HOSTS.includes(host)) throw new Error(`payouts: ${host} is not a connector host`);
    const res = await fetchImpl(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429) throw new Error(`payouts: ${host} is busy (HTTP 429)`);
    return res.text();
  };
}

export interface PayoutResult {
  symbol: string;
  records: PayoutRecord[];
  /** the connector that answered, or null when none covers it or none answered */
  source: string | null;
  error?: string;
}

/** a custom connector a Muse space wrote (custom-payouts.ts); null means "I don't cover this one" */
export type CustomPayouts = (a: PayoutAsk) => Promise<PayoutRecord[] | null>;

/**
 * Asks the connectors that cover `a`, in order, until one returns records. Never throws: a failure comes back
 * as `error`, with no records, so the caller keeps what it had.
 */
export async function fetchPayouts(a: PayoutAsk, fetchImpl: FetchLike = fetch as unknown as FetchLike, custom?: CustomPayouts): Promise<PayoutResult> {
  const get = textGetter(fetchImpl);
  let error: string | undefined;
  for (const c of connectorsFor(a)) {
    try {
      const records = clean(await c.fetch(a, get));
      if (records.length) return { symbol: a.symbol, records, source: c.id };
    } catch (e) {
      error = `${c.id}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (custom) {
    try {
      const records = await custom(a);
      if (records?.length) return { symbol: a.symbol, records: clean(records.map((r) => ({ ...r, source: r.source || 'custom' }))), source: 'custom' };
    } catch (e) {
      error = `custom: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return { symbol: a.symbol, records: [], source: null, ...(error ? { error } : {}) };
}

/** valid records only, one per ex-date, newest first; a pay date before its ex-date is dropped as unreliable */
export function clean(records: PayoutRecord[]): PayoutRecord[] {
  const by = new Map<string, PayoutRecord>();
  for (const r of records) {
    const exDate = iso(r?.exDate);
    if (!exDate) continue;
    const payDate = iso(r.payDate) && r.payDate! >= exDate ? r.payDate : null;
    const amount = typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : null;
    const prev = by.get(exDate);
    if (prev && prev.payDate && !payDate) continue; // keep the one that has a date
    by.set(exDate, { exDate, payDate, recordDate: iso(r.recordDate) ?? null, amount, currency: r.currency ? String(r.currency).toUpperCase() : null, source: String(r.source || 'unknown') });
  }
  return [...by.values()].sort((x, y) => y.exDate.localeCompare(x.exDate));
}

/** what was known before plus what was just fetched: new records win, older ones a connector no longer lists stay */
export function mergePayouts(before: PayoutRecord[], fresh: PayoutRecord[]): PayoutRecord[] {
  const by = new Map(clean(before).map((r) => [r.exDate, r]));
  for (const r of clean(fresh)) {
    const old = by.get(r.exDate);
    by.set(r.exDate, old?.payDate && !r.payDate ? { ...r, payDate: old.payDate } : r);
  }
  return [...by.values()].sort((x, y) => y.exDate.localeCompare(x.exDate));
}
