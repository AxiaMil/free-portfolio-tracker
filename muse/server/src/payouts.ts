// Dividend payment dates from the exchanges' own public data: "connectors", one per exchange or data service.
// Yahoo's free data dates each dividend by its ex-date only; a connector adds the date the company pays it, so the
// app counts a dividend in your cash on the day it is paid, and as "to be paid" from the ex-date until then.
//
// Plain TypeScript with no imports, so the same file runs in the Muse space's server (actions.ts), in `npm run dev`
// and `npm start` (vite.config.ts), in Node or in a worker. Each connector only reads public data of its own hosts
// (listed in `hosts`): no sign-up, no API key, no login and nothing of the user's, so there is nothing to set up.
//
// Holdings these don't cover (a Hong Kong or London listing, ...) can get the Muse space's own connector
// (custom-payouts.ts). Without one, the app estimates each payment date from the company's usual schedule and marks
// it as an estimate. Adding an exchange for everyone: write a Connector (match the Yahoo symbols it covers, fetch,
// return PayoutRecords) and put it in CONNECTORS.

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

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  status: number;
  text(): Promise<string>;
  headers?: { get(name: string): string | null; getSetCookie?: () => string[] };
}>;

export interface Connector {
  id: string;
  /** what the user sees in Settings */
  name: string;
  covers: string;
  /** every host it reads; a Muse space allows exactly these (manifest.json, network) */
  hosts: string[];
  matches(a: PayoutAsk): boolean;
  fetch(a: PayoutAsk, get: GetText, raw: GetRaw): Promise<PayoutRecord[]>;
}

type GetText = (url: string, headers?: Record<string, string>) => Promise<string>;
/** the whole answer, with the cookies it sets (only the Yahoo connector needs them) */
type GetRaw = (url: string, headers?: Record<string, string>) => Promise<{ status: number; body: string; cookies: string[] }>;

const TIMEOUT_MS = 20_000;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (s: unknown): string | null => (typeof s === 'string' && ISO.test(s) ? s : null);
/** "11/24/2026" (US style) -> "2026-11-24"; "N/A", "None" and anything else -> null */
export function usDate(s: unknown): string | null {
  const m = typeof s === 'string' ? s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) : null;
  const [, mm = '', dd = '', yyyy = ''] = m ?? [];
  return m ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : null;
}
/** Yahoo dates are epoch seconds at midnight UTC of the day */
export function epochDate(s: unknown): string | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
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
      const [, rateCcy, rateAmt] = String(r?.particulars ?? '').match(/Rate:\s*([A-Z]{3})\s*([0-9.]+)/i) ?? [];
      const cur = by.get(exDate) ?? { exDate, payDate: null, recordDate: sgtDate(r?.recDate), amount: null, currency: null, source: 'sgx' };
      const paid = sgtDate(r?.datePaid);
      if (paid && (!cur.payDate || paid > cur.payDate)) cur.payDate = paid;
      if (rateCcy && rateAmt) {
        cur.amount = Math.round(((cur.amount ?? 0) + Number(rateAmt)) * 1e8) / 1e8;
        cur.currency = rateCcy.toUpperCase();
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

// ---------------------------------------------------------------- US: Yahoo Finance (latest dividend)
// Nasdaq lists no NYSE shares, but Yahoo publishes each US company's latest ex-date and payment date. Its quote
// service wants an anonymous session: a cookie from fc.yahoo.com and a "crumb" token for it, nothing of the user's.

const YAHOO_UA = 'Mozilla/5.0 (portfolio-tracker)';
const SESSION_MS = 6 * 3600_000;
const sessions = new WeakMap<object, { cookie: string; crumb: string; at: number }>();

async function yahooSession(raw: GetRaw, key: object, fresh = false): Promise<{ cookie: string; crumb: string }> {
  const known = sessions.get(key);
  if (known && !fresh && Date.now() - known.at < SESSION_MS) return known;
  const start = await raw('https://fc.yahoo.com/', { 'User-Agent': YAHOO_UA });
  const cookie = start.cookies.map((c) => c.split(';')[0]?.trim() ?? '').filter((c) => c.startsWith('A3=')).join('; ');
  if (!cookie) throw new Error('Yahoo gave no session');
  // the crumb comes as plain text: asked for as JSON, Yahoo answers 406
  const crumb = (await raw('https://query1.finance.yahoo.com/v1/test/getcrumb', { 'User-Agent': YAHOO_UA, Accept: '*/*', Cookie: cookie })).body.trim();
  if (!crumb || crumb.length > 40 || /[{<\s]/.test(crumb)) throw new Error('Yahoo gave no crumb');
  const s = { cookie, crumb, at: Date.now() };
  sessions.set(key, s);
  return s;
}

const DAY_MS = 86_400_000;
const yahoo: Connector = {
  id: 'yahoo',
  name: 'Yahoo Finance',
  covers: 'US-listed shares and ETFs, NYSE included: each latest dividend, kept as they build up',
  hosts: ['fc.yahoo.com', 'query1.finance.yahoo.com'],
  // Yahoo's US symbols have no market suffix (KO, BRK-B); indices (^GSPC) and FX (USDSGD=X) pay nothing
  matches: (a) => !/[.^=]/.test(a.symbol) && (!a.currency || a.currency.toUpperCase() === 'USD'),
  async fetch(a, _get, raw) {
    const quote = async (fresh: boolean) => {
      const s = await yahooSession(raw, raw, fresh);
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(a.symbol)}&fields=exDividendDate,dividendDate,currency&crumb=${encodeURIComponent(s.crumb)}`;
      return raw(url, { 'User-Agent': YAHOO_UA, Accept: 'application/json', Cookie: s.cookie });
    };
    let res = await quote(false);
    if (res.status === 401 || res.status === 403) res = await quote(true); // the session ran out: one new one
    const q = json(res.body)?.quoteResponse?.result?.[0];
    const exDate = epochDate(q?.exDividendDate);
    if (!exDate) return [];
    // Yahoo can still show the previous dividend's payment date beside a new ex-date: keep it only when it follows
    const pay = epochDate(q?.dividendDate);
    const days = pay ? (Date.parse(pay) - Date.parse(exDate)) / DAY_MS : -1;
    return [{ exDate, payDate: pay && days >= 0 && days <= 100 ? pay : null, amount: null, currency: q?.currency ?? 'USD', source: 'yahoo' }];
  },
};

/** in the order they are tried: the first that answers with records wins */
export const CONNECTORS: Connector[] = [sgx, nasdaq, asx, yahoo];
export const PAYOUT_HOSTS = [...new Set(CONNECTORS.flatMap((c) => c.hosts))];

/** the built-in connectors that cover a holding; none means it is the Muse space's own connector's job */
export function connectorsFor(a: PayoutAsk): Connector[] {
  return CONNECTORS.filter((c) => c.matches(a));
}

function rawGetter(fetchImpl: FetchLike): GetRaw {
  return async (url, headers) => {
    const host = new URL(url).hostname;
    if (!PAYOUT_HOSTS.includes(host)) throw new Error(`payouts: ${host} is not a connector host`);
    const res = await fetchImpl(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429) throw new Error(`payouts: ${host} is busy (HTTP 429)`);
    const h = res.headers;
    const cookies = h?.getSetCookie?.() ?? (h?.get('set-cookie') ? [h.get('set-cookie') ?? ''] : []);
    return { status: res.status, body: await res.text(), cookies };
  };
}
// one raw getter per fetch function, so a Yahoo session is reused between holdings
const raws = new WeakMap<FetchLike, GetRaw>();
function getters(fetchImpl: FetchLike): { get: GetText; raw: GetRaw } {
  let raw = raws.get(fetchImpl);
  if (!raw) raws.set(fetchImpl, (raw = rawGetter(fetchImpl)));
  const r = raw;
  return { raw: r, get: async (url, headers) => (await r(url, headers)).body };
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
  const { get, raw } = getters(fetchImpl);
  let error: string | undefined;
  for (const c of connectorsFor(a)) {
    try {
      const records = clean(await c.fetch(a, get, raw));
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
    const pay = iso(r.payDate);
    const payDate = pay && pay >= exDate ? pay : null;
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
