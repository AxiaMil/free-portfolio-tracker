// This space's own dividend-date connector, for holdings no built-in connector in payouts.ts covers (an exchange
// with no connector yet, or one company whose exchange publishes nothing). It belongs to the space, not to the
// repository: an update creates this file only when it is missing and never replaces it.
//
// When the user holds such a listing, Muse writes customPayouts below for it: from that exchange's own public
// announcements or, failing that, the company's investor-relations page (its dividend announcements, which follow
// each quarterly or half-yearly result). Rules:
//   - Return the dividends the source lists, newest first, as PayoutRecords: exDate and payDate as yyyy-mm-dd in
//     the exchange's calendar, payDate null when it is not published yet, source naming where it came from.
//   - Return null for a symbol it does not cover, so the app shows "no source" and the user can type the date.
//   - Only ever read pages, with no login or cookies; never guess or estimate a date.
//   - Add every host it reads to CUSTOM_HOSTS, and ask the user to approve them as network access.
// refreshMarketCache calls it at most once a day per holding, and the app's "Check now" calls it on demand.
import type { PayoutAsk, PayoutRecord } from './payouts';

/** hosts customPayouts reads; the space allows these besides the built-in connectors' hosts */
export const CUSTOM_HOSTS: string[] = [];

export async function customPayouts(_a: PayoutAsk): Promise<PayoutRecord[] | null> {
  return null;
}
