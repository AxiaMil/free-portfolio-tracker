// Names for where a dividend's payment date comes from (muse/server/src/payouts.ts connectors, the Muse space's own
// connector, or the user), and the request a user sends their Muse for holdings no connector covers yet.

const NAMES: Record<string, string> = {
  sgx: 'SGX',
  nasdaq: 'Nasdaq',
  asx: 'ASX',
  custom: 'your Muse connector',
  you: 'you',
  yahoo: 'Yahoo',
};

export function sourceName(id: string | null | undefined): string {
  if (!id) return 'no source yet';
  return NAMES[id] ?? id;
}

/** short tag beside a date: SGX, Nasdaq, ASX, Muse, You */
export function sourceTag(id: string | null | undefined): string {
  if (!id) return '';
  if (id === 'custom') return 'Muse';
  if (id === 'you') return 'You';
  return NAMES[id] ?? id;
}

export const REPO = 'https://github.com/AxiaMil/free-portfolio-tracker';

/** what to send Muse so it connects payment dates for these holdings (payouts.forMuse in muse/manifest.json) */
export function museRequest(symbols: string[]): string {
  const list = symbols.length <= 1 ? symbols.join('') : `${symbols.slice(0, -1).join(', ')} and ${symbols.at(-1)}`;
  return `Please connect dividend payment dates for ${list} in my Portfolio Tracker space, as payouts.forMuse in muse/manifest.json says (${REPO}).`;
}
