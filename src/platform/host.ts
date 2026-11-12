// Host bridge: the only way the app reaches storage and the network outside the browser defaults.
// A platform that runs the app (for example a Meta Muse space) can define `window.portfolioHost` before the app
// starts: in public/host.js (app/host.js in the prebuilt copy), or on a same-origin page that frames the app.
// Every member is optional; anything missing falls back to the browser.
// The full contract is in docs/HOSTING.md.

export interface PortfolioHost {
  /** shown in Settings → Data & Backup, e.g. "Muse space storage" */
  name?: string;
  /** the saved app state (a JSON object or JSON string), or null/undefined when nothing has been saved yet */
  loadState?: () => unknown | Promise<unknown>;
  /** persist the whole app state (a plain JSON object) */
  saveState?: (state: unknown) => void | Promise<void>;
  /**
   * GET a Yahoo Finance URL (https://query1.finance.yahoo.com/… or https://query2.finance.yahoo.com/…) from the
   * server side and resolve with the parsed JSON body. Browsers can't call Yahoo directly (no CORS headers).
   */
  fetchJson?: (url: string) => Promise<unknown>;
}

declare global {
  interface Window {
    portfolioHost?: PortfolioHost;
  }
}

/**
 * The bridge from public/host.js, or (when the app is shown in a frame) from the same-origin page around it, so a
 * host can connect without touching any of the app's files. A cross-origin parent can't be read and is skipped.
 */
export function host(): PortfolioHost | null {
  if (typeof window === 'undefined') return null;
  if (window.portfolioHost) return window.portfolioHost;
  try {
    if (window.parent !== window && window.parent.portfolioHost) return window.parent.portfolioHost;
  } catch { /* cross-origin parent */ }
  return null;
}
