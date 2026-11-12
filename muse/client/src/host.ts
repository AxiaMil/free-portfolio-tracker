// Connects the app to this space. Storage and market data go through the server actions in server/src/actions.ts.
// The app itself takes care of everything else: the cache on the device, opening from the snapshot, one request
// per symbol at a time, retries, and saving fresh quotes back. Defined before the app starts (main.ts imports this
// first).
//
// The one line that depends on the Spaces starter is the import of `callAction`: it must call this space's server
// action `name` with `input` and resolve with its result (use the starter's typed action client).
import { callAction } from './api';

declare global {
  interface Window { portfolioHost?: Record<string, unknown> }
}

// On a phone, the first action call of a session can fail once ("Spaces bridge request failed") while the phone
// shell's bridge is still cold; the same call succeeds seconds later. The app rightly treats a failed load as
// fatal, so the load is retried here first: after 700 ms, 1.5 s, 3 s and 5 s.
const LOAD_RETRY_DELAYS_MS = [700, 1500, 3000, 5000];

window.portfolioHost = {
  // shown in Settings → Data & Backup → Where it is saved
  name: 'Muse space storage',
  // the saved portfolio (key "portfolio"), or null the first time: a new space starts empty.
  // A load that still fails after every retry throws the last error. It never returns null, which would read as
  // an empty portfolio and could be saved over the real one.
  async loadState() {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await callAction('getPortfolio', {});
        return r?.state ?? null;
      } catch (e) {
        if (attempt >= LOAD_RETRY_DELAYS_MS.length) throw e;
        await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_DELAYS_MS[attempt]));
      }
    }
  },
  // the whole portfolio, about 350 ms after every change
  async saveState(state: unknown) {
    await callAction('savePortfolio', { state });
  },
  // Yahoo Finance, from the server (browsers can't call it directly)
  async fetchJson(url: string) {
    return callAction('yahooGet', { url });
  },
  // the market snapshot kept fresh by refreshMarketCache every 10 minutes: the app opens on it at once
  async loadMarketCache(since: number) {
    return callAction('getSnapshot', { since });
  },
  // fresh quotes and profiles the open app fetched, for the next open on any device
  async saveMarketCache(entries: unknown[]) {
    return callAction('saveSnapshotEntries', { entries });
  },
};

export {};
