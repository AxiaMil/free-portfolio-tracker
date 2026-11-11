// Fast lookups over market data: price on a date (forward-filled), FX to base currency,
// live quote overlay for today, split adjustments and instrument metadata.
import type { ChartData, CustomAsset, MarketBundle, Profile, Quote } from './types.ts';
import { lastIndexLE } from './util.ts';

interface Series {
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ['GBP', 100],
  GBX: ['GBP', 100],
  ILA: ['ILS', 100],
  ZAc: ['ZAR', 100],
};

export function normalizeCurrency(c: string | null | undefined): { code: string; divisor: number } {
  if (!c) return { code: 'USD', divisor: 1 };
  const m = MINOR_UNITS[c];
  if (m) return { code: m[0], divisor: m[1] };
  return { code: c.toUpperCase(), divisor: 1 };
}

/**
 * Yahoo reports two kinds of "splits": real share splits / bonus issues (simple ratios such as 2, 3:2, 11:10, 1:20)
 * and spin-off price adjustments (odd ratios such as 1.057). Only real splits change the number of shares you hold.
 */
export function isShareSplit(ratio: number): boolean {
  if (!(ratio > 0)) return false;
  const simple = (x: number) => {
    for (let d = 1; d <= 10; d++) {
      const n = x * d;
      if (Math.round(n) >= 1 && Math.abs(n - Math.round(n)) < 1e-3 * d) return true;
    }
    return false;
  };
  return simple(ratio) || simple(1 / ratio);
}

export function fxSymbol(from: string, to: string): string {
  return `${from}${to}=X`;
}

const COUNTRY_REGION: Record<string, string> = {
  'United States': 'North America', Canada: 'North America', Mexico: 'Latin America', Brazil: 'Latin America',
  Argentina: 'Latin America', Chile: 'Latin America', Uruguay: 'Latin America', Colombia: 'Latin America', Peru: 'Latin America',
  'United Kingdom': 'Europe', Ireland: 'Europe', Germany: 'Europe', France: 'Europe', Netherlands: 'Europe', Switzerland: 'Europe',
  Sweden: 'Europe', Denmark: 'Europe', Norway: 'Europe', Finland: 'Europe', Spain: 'Europe', Italy: 'Europe', Belgium: 'Europe',
  Luxembourg: 'Europe', Austria: 'Europe', Portugal: 'Europe', Poland: 'Europe', Jersey: 'Europe', Guernsey: 'Europe',
  Singapore: 'Asia', 'Hong Kong': 'Asia', China: 'Asia', Japan: 'Asia', Taiwan: 'Asia', 'South Korea': 'Asia', India: 'Asia',
  Indonesia: 'Asia', Malaysia: 'Asia', Thailand: 'Asia', Philippines: 'Asia', Vietnam: 'Asia', Israel: 'Middle East',
  'United Arab Emirates': 'Middle East', 'Saudi Arabia': 'Middle East', Australia: 'Oceania', 'New Zealand': 'Oceania',
  'Cayman Islands': 'North America', Bermuda: 'North America', 'South Africa': 'Africa',
};

const SUFFIX_MARKET: Record<string, [string, string]> = {
  SI: ['SGX', 'Singapore'], HK: ['HKEX', 'Hong Kong'], L: ['LSE', 'United Kingdom'], T: ['TSE', 'Japan'], AX: ['ASX', 'Australia'],
  TO: ['TSX', 'Canada'], DE: ['XETRA', 'Germany'], PA: ['Euronext Paris', 'France'], AS: ['Euronext Amsterdam', 'Netherlands'],
  SS: ['SSE', 'China'], SZ: ['SZSE', 'China'], KS: ['KRX', 'South Korea'], TW: ['TWSE', 'Taiwan'], NS: ['NSE', 'India'],
  BO: ['BSE', 'India'], KL: ['Bursa', 'Malaysia'], BK: ['SET', 'Thailand'], JK: ['IDX', 'Indonesia'], SW: ['SIX', 'Switzerland'],
  MI: ['Borsa Italiana', 'Italy'], MC: ['BME', 'Spain'], ST: ['Nasdaq Stockholm', 'Sweden'], CO: ['Nasdaq Copenhagen', 'Denmark'],
};

export class MarketView {
  base: string;
  today: string;
  bundle: MarketBundle;
  custom: Map<string, CustomAsset>;
  private series = new Map<string, Series>();

  constructor(bundle: MarketBundle, base: string, today: string, customAssets: CustomAsset[] = []) {
    this.bundle = bundle;
    this.base = base;
    this.today = today;
    this.custom = new Map(customAssets.map((c) => [c.symbol, c]));
  }

  chart(symbol: string): ChartData | undefined {
    return this.bundle.charts[symbol];
  }

  quote(symbol: string): Quote | undefined {
    return this.bundle.quotes[symbol];
  }

  profile(symbol: string): Profile | undefined {
    return this.bundle.profiles[symbol];
  }

  /** trading currency of an instrument (after minor-unit normalisation) */
  currencyOf(symbol: string): string {
    const c = this.custom.get(symbol);
    if (c) return c.currency.toUpperCase();
    const raw = this.chart(symbol)?.currency || this.quote(symbol)?.currency || this.profile(symbol)?.currency;
    return normalizeCurrency(raw).code;
  }

  private divisor(symbol: string): number {
    if (this.custom.has(symbol)) return 1;
    const raw = this.chart(symbol)?.currency || this.quote(symbol)?.currency;
    return normalizeCurrency(raw).divisor;
  }

  private getSeries(symbol: string): Series {
    let s = this.series.get(symbol);
    if (s) return s;
    const custom = this.custom.get(symbol);
    const dates: string[] = [];
    const open: number[] = [];
    const high: number[] = [];
    const low: number[] = [];
    const close: number[] = [];
    if (custom) {
      for (const [d, p] of [...custom.prices].sort((a, b) => a[0].localeCompare(b[0]))) {
        dates.push(d); open.push(p); high.push(p); low.push(p); close.push(p);
      }
    } else {
      const div = this.divisor(symbol);
      for (const b of this.chart(symbol)?.bars || []) {
        // undo spin-off adjustments so history shows the prices actually traded
        const k = this.spinoffFactorAfter(symbol, b[0]) / div;
        dates.push(b[0]);
        open.push(b[1] * k);
        high.push(b[2] * k);
        low.push(b[3] * k);
        close.push(b[4] * k);
      }
      // overlay the live quote for today
      const q = this.quote(symbol);
      if (q?.price != null && q.time) {
        const qd = new Date(q.time).toISOString().slice(0, 10);
        const p = q.price / div;
        const last = dates.length ? dates[dates.length - 1] : '';
        const qDate = qd > last ? qd : last;
        if (qDate === last && dates.length) {
          close[close.length - 1] = p;
          high[high.length - 1] = Math.max(high[high.length - 1], p);
          low[low.length - 1] = Math.min(low[low.length - 1], p);
        } else {
          dates.push(qDate); open.push(p); high.push(p); low.push(p); close.push(p);
        }
      }
    }
    s = { dates, open, high, low, close };
    this.series.set(symbol, s);
    return s;
  }

  hasData(symbol: string): boolean {
    return this.getSeries(symbol).dates.length > 0;
  }

  firstDate(symbol: string): string | null {
    const s = this.getSeries(symbol);
    return s.dates[0] ?? null;
  }

  /** close price on/before date in trading currency (null if no data yet) */
  priceAt(symbol: string, date: string): number | null {
    const s = this.getSeries(symbol);
    const i = lastIndexLE(s.dates, date);
    if (i < 0) return s.close.length ? s.close[0] : null; // before history: use first known price
    return s.close[i];
  }

  /** previous trading day close strictly before date */
  prevCloseBefore(symbol: string, date: string): number | null {
    const s = this.getSeries(symbol);
    let i = lastIndexLE(s.dates, date);
    if (i >= 0 && s.dates[i] === date) i--;
    if (i < 0) return null;
    return s.close[i];
  }

  dayRange(symbol: string, date: string): { low: number; high: number } | null {
    const s = this.getSeries(symbol);
    const i = lastIndexLE(s.dates, date);
    if (i < 0 || s.dates[i] !== date) return null;
    return { low: s.low[i], high: s.high[i] };
  }

  bars(symbol: string): Series {
    return this.getSeries(symbol);
  }

  /** latest price (live quote if available) */
  lastPrice(symbol: string): number | null {
    const s = this.getSeries(symbol);
    return s.close.length ? s.close[s.close.length - 1] : null;
  }

  /** FX multiplier converting 1 unit of `ccy` into base currency on date */
  fxAt(ccy: string, date: string): number {
    const c = normalizeCurrency(ccy).code;
    if (c === this.base) return 1;
    const direct = fxSymbol(c, this.base);
    if (this.chart(direct)?.bars?.length || this.quote(direct)) {
      const p = this.priceAt(direct, date);
      if (p) return p;
    }
    // triangulate via USD
    if (c !== 'USD' && this.base !== 'USD') {
      const a = this.priceAt(fxSymbol(c, 'USD'), date);
      const b = this.priceAt(fxSymbol('USD', this.base), date);
      if (a && b) return a * b;
    }
    return 1;
  }

  /** cumulative split ratio for splits strictly after `date` (shares multiply by this) */
  splitFactorAfter(symbol: string, date: string): number {
    let f = 1;
    for (const [d, r] of this.chart(symbol)?.splits || []) if (d > date && isShareSplit(r)) f *= r;
    return f;
  }

  /** cumulative spin-off price adjustment after `date` (Yahoo divides earlier prices by it; we multiply it back) */
  private spinoffFactorAfter(symbol: string, date: string): number {
    let f = 1;
    for (const [d, r] of this.chart(symbol)?.splits || []) if (d > date && r > 0 && !isShareSplit(r)) f *= r;
    return f;
  }

  dividends(symbol: string): Array<[string, number]> {
    const div = this.divisor(symbol);
    return (this.chart(symbol)?.dividends || []).map(([d, a]) => [d, (a * this.spinoffFactorAfter(symbol, d)) / div] as [string, number]);
  }

  name(symbol: string): string {
    const c = this.custom.get(symbol);
    if (c) return c.name;
    return this.profile(symbol)?.name || this.quote(symbol)?.name || this.chart(symbol)?.name || symbol;
  }

  meta(symbol: string) {
    const custom = this.custom.get(symbol);
    const p = this.profile(symbol) || ({} as Profile);
    const q = this.quote(symbol);
    const type = (custom?.assetType || p.quoteType || q?.quoteType || 'EQUITY').toUpperCase();
    const assetType = custom?.assetType || ({ EQUITY: 'Stock', ETF: 'ETF', MUTUALFUND: 'Fund', CRYPTOCURRENCY: 'Crypto', INDEX: 'Index', CURRENCY: 'Currency', FUTURE: 'Future' } as Record<string, string>)[type] || 'Others';
    const suffix = symbol.includes('.') ? symbol.split('.').pop()! : '';
    const sfx = SUFFIX_MARKET[suffix];
    const isFund = type === 'ETF' || type === 'MUTUALFUND';
    const country = custom?.country || p.country || (isFund ? 'Others' : sfx ? sfx[1] : 'United States');
    const exchange = sfx ? sfx[0] : (q?.exchange || p.exchange || this.chart(symbol)?.exchange || 'Others');
    const market = /nasdaq/i.test(exchange) ? 'NASDAQ' : /nyse|new york/i.test(exchange) ? 'NYSE' : exchange;
    return {
      sector: custom?.sector || p.sector || (isFund ? 'Others' : 'Others'),
      industry: p.industry || (isFund ? 'Others' : 'Others'),
      country,
      region: country === 'Others' ? 'Others' : COUNTRY_REGION[country] || 'Others',
      market: custom ? 'Custom' : market,
      assetType,
    };
  }
}
