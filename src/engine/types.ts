// Shared data shapes for the stored state, market data and engine results.

export type Action =
  | 'Buy'
  | 'Sell'
  | 'Deposit'
  | 'Withdraw'
  | 'Transfer in'
  | 'Transfer out'
  | 'Dividend'
  | 'Stock dividend'
  | 'Fees'
  | 'Taxes'
  | 'Interest income'
  | 'Interest expense'
  | 'Other income'
  | 'Other expense';

export const ASSET_ACTIONS: Action[] = ['Buy', 'Sell', 'Transfer in', 'Transfer out', 'Dividend', 'Stock dividend'];
export const CASH_ACTIONS: Action[] = ['Deposit', 'Withdraw', 'Fees', 'Taxes', 'Interest income', 'Interest expense', 'Other income', 'Other expense'];
export const POPULAR_ACTIONS: Action[] = ['Buy', 'Sell', 'Deposit', 'Withdraw'];

export interface Txn {
  id: string;
  date: string;
  action: Action;
  /** ticker, or "CASH" for pure cash transactions */
  symbol: string;
  price: number;
  /** "Market" = the instrument's trading currency, otherwise an ISO code */
  currency: string;
  shares: number;
  commission: number;
  note?: string;
}

export interface CustomAsset {
  symbol: string;
  name: string;
  currency: string;
  /** manual price points [date, price] */
  prices: Array<[string, number]>;
  sector?: string;
  country?: string;
  assetType?: string;
}

export interface GoalPlan {
  startDate: string;
  years: number;
  startValue: number;
  annualReturn: number; // percent
  contribution: number;
  contributionFreq: 'Monthly' | 'Quarterly' | 'Annually';
  growthRate: number; // percent
  growthFreq: 'Year over Year';
}

export interface Portfolio {
  id: string;
  name: string;
  currency: string;
  benchmark: string;
  benchmarks: string[];
  dividendTaxRate: number; // percent
  autoDividend: boolean;
  margin: boolean;
  transactions: Txn[];
  customAssets: CustomAsset[];
  goal: GoalPlan | null;
  rebalance: { mode: 'pct' | 'value'; targets: Record<string, number>; extraAssets: string[]; cashValue?: number | null };
  /** payment dates you typed for automatic dividends, by "SYMBOL|exDate" (they win over any connector's) */
  payDates?: Record<string, string>;
}

export interface Preferences {
  hideValues: boolean;
  decimalSeparator: '.' | ',';
  thousandSeparator: ',' | '.' | ' ' | "'";
  costMethod: 'FIFO' | 'Average';
  accent: string;
  /** visual theme preset: 'graphite' (default) | 'midnight' | 'paper' */
  theme?: string;
  userInitial: string;
}

export interface AppState {
  version: number;
  activePortfolioId: string;
  preferences: Preferences;
  portfolios: Portfolio[];
}

// ---------- market data (as returned by the local server) ----------
export type Bar = [string, number, number, number, number]; // date, open, high, low, close

export interface ChartData {
  symbol: string;
  currency: string | null;
  exchange: string | null;
  instrumentType?: string | null;
  name: string | null;
  bars: Bar[];
  dividends: Array<[string, number]>;
  splits: Array<[string, number]>;
  error?: string;
  stale?: boolean;
  fetchedAt?: number;
}

export interface Quote {
  symbol: string;
  price: number | null;
  /** the exchange's offset from UTC in seconds, to date the quote by the exchange's own calendar */
  gmtoffset?: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  time: number | null;
  marketState: string | null;
  currency: string | null;
  name: string;
  shortName: string | null;
  quoteType: string | null;
  exchange: string | null;
  high52: number | null;
  low52: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  fetchedAt: number;
}

export interface Profile {
  symbol: string;
  name?: string;
  quoteType?: string | null;
  exchange?: string | null;
  currency?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  exDividendDate?: string | null;
  dividendDate?: string | null;
  dividendRate?: number | null;
  error?: string;
}

/** one dividend's dates as the company announced them, from an exchange connector (muse/server/src/payouts.ts) */
export interface PayoutRecord {
  exDate: string;
  /** null while the company hasn't published it */
  payDate: string | null;
  recordDate?: string | null;
  /** per share, in `currency` */
  amount?: number | null;
  currency?: string | null;
  /** sgx, nasdaq, asx, custom (the Muse space's own connector), ... */
  source: string;
}

/** what is known about a holding's dividend dates; source null means no connector covers it (yet) */
export interface PayoutInfo {
  records: PayoutRecord[];
  source: string | null;
  checkedAt: number;
  error?: string;
}

export interface MarketBundle {
  charts: Record<string, ChartData>;
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
  /** dividend payment dates by symbol (none at all where no route to a connector exists) */
  payouts?: Record<string, PayoutInfo>;
}

// ---------- engine output ----------
export type Method = 'MWR' | 'TWR' | 'SR';

export interface LedgerEntry {
  id: string;
  date: string;
  action: Action;
  symbol: string;
  price: number;
  currency: string; // resolved ISO currency
  shares: number;
  commission: number; // in txn currency
  commissionBase: number;
  amountBase: number; // gross amount in base currency (positive)
  fx: number;
  auto: null | 'deposit' | 'dividend' | 'tax';
  /** an automatic dividend's withholding tax, base currency (it is also booked as its own Taxes entry) */
  taxBase?: number;
  /**
   * an automatic dividend (and its withholding) is income on its ex-date, but its cash moves on this date: until
   * then it is "to be paid". null: the payment date isn't known, so it stays to be paid. Absent: cash moves on `date`.
   */
  payDate?: string | null;
  status: 'confirmed' | 'upcoming';
  sourceId?: string;
  warning?: string;
}

export interface DayPoint {
  date: string;
  value: number;
  cash: number;
  holdingsValue: number;
  netDeposits: number;
  /** dividends past their ex-date and not paid yet, after withholding (part of value, not of cash) */
  toBePaid: number;
  flow: number; // external flow on that day (deposits - withdrawals)
  grossDeposits: number;
  twrIndex: number;
  gain: number;
  bench: Record<string, number>; // what-if value per benchmark
  benchIndex: Record<string, number>; // benchmark TWR index (base currency)
  benchLocal: Record<string, number>; // benchmark price index in its own currency (risk metrics)
}

export interface Lot {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  openDate: string;
  price: number;
  currency: string;
  shares: number; // original
  openShares: number;
  costBase: number; // base currency, for original shares, incl commission
  closedShares: number;
  realized: number;
  closeDate: string | null;
  sourceId: string;
}

export interface Holding {
  symbol: string;
  name: string;
  currency: string;
  shares: number;
  last: number | null;
  prevClose: number | null;
  fx: number;
  avgCost: number;
  costValue: number; // base, open lots, excl commission
  marketValue: number;
  allocation: number;
  costAllocation: number;
  dayGain: number;
  dayGainPct: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  dividends: number;
  fees: number;
  totalGain: number;
  totalReturn: number;
  annualizedReturn: number;
  firstDate: string;
  high52: number | null;
  low52: number | null;
  offHigh52: number | null;
  sector: string;
  industry: string;
  country: string;
  region: string;
  market: string;
  assetType: string;
  isCash?: boolean;
  isCustom?: boolean;
}

export interface DividendEvent {
  symbol: string;
  exDate: string;
  /** the payment date, or where it isn't known the ex-date, to place it in time (see payKnown) */
  payDate: string;
  /** whether payDate is the payment date the company published (or you typed) */
  payKnown: boolean;
  /** where the payment date came from: sgx, nasdaq, asx, custom, you; null when not known */
  paySource: string | null;
  /** a Dividend transaction you entered (its date is when it was paid), not one found automatically */
  manual?: boolean;
  perShare: number;
  shares: number;
  currency: string;
  /** gross amount in the base currency */
  amountBase: number;
  /** withholding tax on it in the base currency (the portfolio's dividend tax rate; 0 for dividends you entered) */
  taxBase: number;
  /** received: paid into cash; toBePaid: past its ex-date, not paid yet; confirmed: ex-date ahead; estimated: projected */
  status: 'received' | 'toBePaid' | 'confirmed' | 'estimated';
}
