# Hosting the tracker

Portfolio Tracker is a static web app. The repository ships a prebuilt, tested copy in [`app/`](../app). `npm run build` writes the same files to `dist/` from your own checkout, and `npm run build:app` refreshes `app/`. Every path is relative and routes use `#/`, so any static host can serve them from the domain root or a sub-folder, with no rewrite rules and no build step on the host.

The app reaches outside the browser in only two places. A host platform can take over both:

| Seam | Default | File |
|---|---|---|
| **Saving your data** | This browser's `localStorage`, falling back to IndexedDB | [`src/platform/storage.ts`](../src/platform/storage.ts) |
| **Market data** (Yahoo Finance) | The `./yahoo/…` route that `npm run dev` / `npm start` forwards | [`src/market/client.ts`](../src/market/client.ts) |

Both are switched through one optional object, `window.portfolioHost`. Define it in either place:

- in `host.js`, next to `index.html` ([`public/host.js`](../public/host.js), or `app/host.js` in the prebuilt copy), which the app loads before its own code. As shipped it holds only comments and changes nothing;
- or on a same-origin page that shows the app in a frame. The app looks at its parent page too, so no file of the app has to change.

## The host bridge

```js
// public/host.js
window.portfolioHost = {
  // shown in Settings → Data & Backup → Where it is saved
  name: 'My platform storage',

  // the saved app state (a JSON object or JSON string), or null the first time
  async loadState() { /* … */ },

  // persist the whole app state, a plain JSON object (called about 350 ms after every change)
  async saveState(state) { /* … */ },

  // GET a Yahoo Finance URL on the server side and return the parsed JSON body
  async fetchJson(url) { /* … */ },
};
```

Every member is optional:

- **`loadState` and `saveState`** must be defined together. The app then reads and writes only through them and never touches `localStorage`. The state is one JSON document, typically 10–200 KB. Its shape is `AppState` in [`src/engine/types.ts`](../src/engine/types.ts): `{ version, activePortfolioId, preferences, portfolios[] }`.
- **`fetchJson(url)`** is the first route the app tries for market data. It receives full `https://query1.finance.yahoo.com/…` or `https://query2.finance.yahoo.com/…` URLs. Return the parsed JSON (Yahoo answers errors as JSON too, so pass those through). Throw only when the request itself fails. The app then tries its other routes and, failing those, shows cached prices with the refresh button in amber.

The TypeScript contract is in [`src/platform/host.ts`](../src/platform/host.ts).

### Requests the app makes

Every request is an HTTP `GET` without cookies or keys:

| Purpose | URL |
|---|---|
| Daily history, dividends and splits | `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=…&period2=…&interval=1d&events=div%7Csplit&includeAdjustedClose=false` |
| Latest quotes (up to 20 symbols per call) | `https://query1.finance.yahoo.com/v7/finance/spark?symbols=…&range=1d&interval=1d` |
| Ticker search and company profiles | `https://query2.finance.yahoo.com/v1/finance/search?q=…&quotesCount=…&newsCount=0&listsCount=0&enableFuzzyQuery=false` |

FX rates are charts too (for example `USDSGD=X`). A server-side fetch should allow these two hosts and nothing else:

```js
// a minimal server action / serverless function
const ALLOWED = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);

export async function fetchYahooJson(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED.has(u.hostname)) throw new Error('Host not allowed');
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  return r.json();
}
```

The app limits itself to four requests at a time. It caches history for 10 minutes, quotes for 45 seconds and profiles for 3 days, all in IndexedDB. While it is open it refreshes quotes every minute and history every 10 minutes. No scheduled job is needed on the host.

## Running on Meta Muse

A Muse space can run a front end plus server actions with their own storage. It cannot run a Node server, a long-running process or files on disk. That maps onto the bridge directly:

| Tracker needs | Muse provides |
|---|---|
| The prebuilt front end (`app/`, served as it is) | The space's front end |
| `loadState` / `saveState` | The space's own storage, holding one JSON document |
| `fetchJson` | A server action that GETs the URL and returns JSON. Muse's Sentinel will ask you to approve `query1.finance.yahoo.com` and `query2.finance.yahoo.com` |

The copy-and-paste prompt is in the README under [Run it on Meta Muse](../README.md#run-it-on-meta-muse). It tells Muse three things:
- serve `app/` unchanged;
- write only `app/host.js`;
- add one allow-listed `yahooGet` server action.

These were tested end to end against the prebuilt copy on a plain static server, at phone and laptop widths:
- With the bridge, saving goes only to the host and prices come only through `fetchJson`.
- Without a bridge, the app still works fully on browser storage, and shows prices as offline until a route exists.

The UI already fits Muse's phone view:

- There is no top bar on phones. The bottom navigation, **+** and refresh float above the content and slide away while you scroll down.
- Help is under **Menu → Help & FAQ**.
- If a space ever blocks browser storage and has no bridge, the app still runs. Settings then says plainly that changes last only until the page closes, and suggests a backup.

## Other ways to host it

| Setup | Market data route |
|---|---|
| The prebuilt `app/` on any static host | As for any static host below, or `window.portfolioHost.fetchJson` |
| `npm run dev` or `npm start` on your computer | Built in: the Vite server forwards `./yahoo/q1` and `./yahoo/q2` |
| Any static host (GitHub Pages, Netlify, S3, nginx …) | Build with `VITE_MARKET_PROXY` pointing at a forwarding endpoint you run, or forward `yahoo/q1/*` and `yahoo/q2/*` next to `index.html` with a reverse proxy |
| An app platform with server functions | `window.portfolioHost.fetchJson`, as above |

`VITE_MARKET_PROXY` accepts either a template or a prefix:

```bash
# the Yahoo URL replaces {url}, URL-encoded
VITE_MARKET_PROXY='https://proxy.example.com/fetch?url={url}' npm run build
# or the encoded Yahoo URL is appended
VITE_MARKET_PROXY='https://proxy.example.com/fetch?url=' npm run build
```

An nginx reverse proxy for the same-origin route, with the app at the site root (for a sub-folder, put the folder in front of `/yahoo/`):

```nginx
location /yahoo/q1/ { proxy_pass https://query1.finance.yahoo.com/; proxy_set_header Host query1.finance.yahoo.com; proxy_set_header Cookie ""; proxy_ssl_server_name on; }
location /yahoo/q2/ { proxy_pass https://query2.finance.yahoo.com/; proxy_set_header Host query2.finance.yahoo.com; proxy_set_header Cookie ""; proxy_ssl_server_name on; }
```

Without any route the app still works with everything you enter: transactions, custom assets with your own prices, goals and backups. Listed prices then stay empty until a route is available.
