// Date + math helpers shared by the engine. Dates are ISO strings "YYYY-MM-DD".

export const DAY_MS = 86400000;

export function toDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, n: number): string {
  return iso(new Date(toDate(isoDate).getTime() + n * DAY_MS));
}

export function addMonths(isoDate: string, n: number): string {
  const d = toDate(isoDate);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return iso(t);
}

export function addYears(isoDate: string, n: number): string {
  return addMonths(isoDate, 12 * n);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** a moment in the device's own time zone, with the zone's name: "2026-11-12 15:27:02.413 GMT+8" in Singapore,
 *  "2026-11-12 02:27:02.413 EST" in New York */
export function localTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  return `${stamp} ${zoneName(d)}`;
}

function zoneName(d: Date): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value;
    if (name) return name;
  } catch { /* fall back to the offset */ }
  const off = -d.getTimezoneOffset();
  const h = Math.floor(Math.abs(off) / 60), m = Math.abs(off) % 60;
  return off === 0 ? 'GMT' : `GMT${off > 0 ? '+' : '-'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export function isWeekend(isoDate: string): boolean {
  const wd = toDate(isoDate).getUTCDay();
  return wd === 0 || wd === 6;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function quarterKey(isoDate: string): string {
  const m = Number(isoDate.slice(5, 7));
  return `${isoDate.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

export function yearKey(isoDate: string): string {
  return isoDate.slice(0, 4);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let t = toDate(from).getTime();
  const end = toDate(to).getTime();
  while (t <= end) {
    out.push(iso(new Date(t)));
    t += DAY_MS;
  }
  return out;
}

/** index of last element <= key in a sorted string array, or -1 */
export function lastIndexLE(sorted: string[], key: string): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= key) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

/**
 * XIRR: annual rate r such that sum(cf_i / (1+r)^(t_i/365)) = 0.
 * flows: [isoDate, amount] (negative = money in, positive = money out/terminal value)
 */
export function xirr(flows: Array<[string, number]>): number | null {
  const cfs = flows.filter(([, a]) => Math.abs(a) > 1e-9);
  if (cfs.length < 2) return null;
  const hasNeg = cfs.some(([, a]) => a < 0);
  const hasPos = cfs.some(([, a]) => a > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = toDate(cfs[0][0]).getTime();
  const ts = cfs.map(([d]) => (toDate(d).getTime() - t0) / DAY_MS / 365);
  const amts = cfs.map(([, a]) => a);
  const npv = (r: number) => {
    let s = 0;
    for (let i = 0; i < amts.length; i++) s += amts[i] / Math.pow(1 + r, ts[i]);
    return s;
  };
  const span = ts[ts.length - 1] || 1 / 365;
  // Bracket then bisect: robust for very short or very large returns.
  let lo = -0.999999;
  let hi = 1;
  let flo = npv(lo);
  let fhi = npv(hi);
  let guard = 0;
  while (flo * fhi > 0 && guard++ < 200) {
    hi = hi * 2 + 1;
    fhi = npv(hi);
    if (!isFinite(fhi)) break;
  }
  if (!(flo * fhi <= 0)) {
    // fall back to simple annualisation of total return
    const invested = -sum(amts.filter((a) => a < 0));
    const ret = sum(amts) / invested;
    return Math.pow(1 + ret, 1 / Math.max(span, 1 / 365)) - 1;
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (!isFinite(fm)) {
      hi = mid;
      continue;
    }
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

export function uid(prefix = 'id'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
