# Hosting the tracker

Portfolio Tracker is a static web app. The repository ships a prebuilt, tested copy in [`app/`](../app). `npm run build` writes the same files to `dist/` from your own checkout, and `npm run build:app` refreshes `app/`. Every path is relative and routes use `#/`, so any static host can serve them from the domain root or a sub-folder, with no rewrite rules and no build step on the host.

The app reaches outside the browser in only two places. A host platform can take over both:

| Seam | Default | File |
|---|---|---|
| **Saving your data** | This browser's `localStorage`, falling back to IndexedDB | [`src/platform/storage.ts`](../src/platform/storage.ts) |
| **Market data** (Yahoo Finance) | The `./yahoo/…` route that `npm run dev` / `npm start` forwards | [`src/market/client.ts`](../src/market/client.ts) |

Both are switched through one optional object, `window.portfolioHost`. Define it in any of these places:

- in `host.js`, next to `index.html` ([`public/host.js`](../public/host.js), or `app/host.js` in the prebuilt copy), which the app loads before its own code. As shipped it holds only comments and changes nothing;
- on the page itself, before the [one-file build](#the-one-file-build) runs;
- or on a same-origin page that shows the app in a frame. The app looks at its parent page too, so no file of the app has to change.

## The one-file build

Some platforms take a front end as a single script rather than a folder of files. For them, `npm run build:app` also writes [`app/portfolio-tracker.js`](../app/portfolio-tracker.js): the whole app (code, styles and the Geist fonts as data URLs) in one classic script of about 2.2 MB, 690 KB compressed. It requests no other file, so it works the same whether it is served from a folder, embedded in another bundle or loaded from a `blob:` URL. It never builds code from a string (no `eval` or `Function()`), so it also runs on hosts that refuse that, such as Meta Muse's publishing check or a Content-Security-Policy without `'unsafe-eval'`. The build fails if that changes, and `npm test` checks the committed files.

Any page can run it, in `<head>` or `<body>`. When the page has no `<div id="app">` it adds one at the end of `<body>`, and it adds a viewport tag if there is none. Define `window.portfolioHost` before it:

```html
<script>
  window.portfolioHost = { name: 'My platform storage', loadState, saveState, fetchJson }; // see below
</script>
<script src="portfolio-tracker.js"></script>
```

[`app/portfolio-tracker.html`](../app/portfolio-tracker.html) is a ready page that does this, reading the bridge from `host.js` next to it.

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

  // market data the host keeps between visits (raw Yahoo responses), and fresh responses to keep
  async loadMarketCache(since) { /* … */ },
  async saveMarketCache(entries) { /* … */ },
};
```

Every member is optional:

- **`loadState` and `saveState`** must be defined together. The app then reads and writes only through them and never touches `localStorage`. The state is one JSON document, typically 10–200 KB. Its shape is `AppState` in [`src/engine/types.ts`](../src/engine/types.ts): `{ version, activePortfolioId, preferences, portfolios[] }`.
  - `loadState` returns `null` only when nothing has been saved yet: the app then starts with one empty portfolio. When the read fails, it must throw. Never return `null` for a failure, or the empty start could be saved over the real portfolio.
  - The app doesn't retry `loadState`, so retry inside the bridge if the host's first call can fail for a moment (the Muse bridge does, below).
- **`fetchJson(url)`** is the first route the app tries for market data. It receives full `https://query1.finance.yahoo.com/…` or `https://query2.finance.yahoo.com/…` URLs. Return the parsed JSON (Yahoo answers errors as JSON too, so pass those through). Throw only when the request itself fails. The app retries a failed request once after 0.7 s. It then tries its other routes and, failing those, shows cached prices with the refresh button in amber.
- **`loadMarketCache(since)`** lets a new device open at once, without waiting for market data. It returns raw Yahoo responses as `[{ key, data, fetchedAt }]` (or `{ entries }`).
  - Keys: `chart:<SYMBOL>` (the chart response), `spark:<SYM,SYM,…>` (a quote response for up to 20 symbols) and `search:<SYMBOL>` (the profile search response).
  - `since` is roughly when the device last had live data (0 the first time). Entries fetched before it can be left out.
  - The app parses each entry exactly like a live answer and keeps it wherever it is newer than the device's own copy. It never waits for the cache longer than 2 s.
- **`saveMarketCache(entries)`** receives the same kind of entries: fresh quotes and profiles the open app fetched. They arrive at most every 15 s, 60 per call, and right away when the page is hidden. Saving them is best effort; errors are ignored.

If the saved state can't be read (`loadState` throws, or takes more than 30 s), the app shows that with a **Try again** button. It never starts empty over existing data.

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

How the app requests market data:
- It makes at most six requests at a time, price histories first and company profiles last.
- It never asks for the same data twice at once. Chart URLs differ only in their time window, so they are matched by symbol.
- It caches history for 10 minutes, quotes for 45 seconds and profiles for 3 days, all in IndexedDB.
- While it is open, it refreshes quotes every minute and history every 10 minutes. No scheduled job is needed on the host, though a host can keep a `loadMarketCache` snapshot fresh with one.

When everything it needs is cached on the device or in the host's market cache, however old, the app opens on those prices at once and brings them up to date in the background. Otherwise it waits for the network, with a count of the price histories as they arrive. That only happens on a device's first open, with no host cache.

## Running on Meta Muse

A Muse space can run a front end plus server actions, with its own storage and scheduled jobs. It cannot run a Node server, a long-running process or files on disk. The finished space is in [`muse/`](../muse): Muse copies it as [`muse/manifest.json`](../muse/manifest.json) lists it, and [`muse/README.md`](../muse/README.md) explains it. The manifest also holds the steps for a new space and for updating one made from any earlier version. The README's two prompts only send Muse to it, so they never change between versions.

| Tracker needs | In the space |
|---|---|
| The front end | `app/portfolio-tracker.js` copied byte for byte, run by a page that holds only `#app` |
| `loadState` / `saveState` | `getPortfolio` / `savePortfolio`: one JSON document under `portfolio` in the `app_state` table. On a phone, the first call of a session can fail once while the phone's bridge starts, so [`muse/client/src/host.ts`](../muse/client/src/host.ts) retries a failed load after 0.7, 1.5, 3 and 5 s, then throws |
| `fetchJson` | `yahooGet`: allow-listed to `query1.finance.yahoo.com` and `query2.finance.yahoo.com`, which Muse's Sentinel asks you to approve |
| `loadMarketCache` / `saveMarketCache` | `getSnapshot` / `saveSnapshotEntries` on the `market_cache` table |
| A snapshot fresh while the app is closed | `refreshMarketCache` every 10 minutes ([`muse/space.json`](../muse/space.json)) |

The server logic is in [`muse/server/src/market.ts`](../muse/server/src/market.ts). It has no dependencies and is covered by `npm test`, including a round trip: what the scheduled refresh stores is what the app opens on. `npm test` also covers the bridge's retried load and the style repair below. It checks that `app/portfolio-tracker.js` builds no code from strings, which Muse's publishing check refuses, and that the manifest matches the code and the committed app file.

Muse's builder also rewrites every `x.style` in the space's code, the chart library's included, to go through its style checker (`__tunnel`), which turns every value into text. The chart library keeps each shape's colours in plain objects called `style`, so the app's first module, [`src/platform/style-tunnel.ts`](../src/platform/style-tunnel.ts), sends only page elements to the checker. Without it, chart labels show as solid boxes and some charts don't draw. A host that rewrites code the same way needs nothing more; elsewhere the module does nothing.

These were tested end to end at phone and laptop widths, with the one file loaded from a `blob:` URL on a page that had no `#app` element and no viewport tag. Every server-action call took 250 ms:
- **Opening:** a new device opened on the host's market snapshot in about 0.5 s, with no live request before the first paint. A device with its own cache opened in about 0.3 s. With no snapshot and no cache, the first open took about 2 s, with a count.
- **While open:** only stale data was fetched live: the quotes, in one request. They were then saved back to the snapshot.
- **Storage:** saving went only to the host, and nothing was written to `localStorage`. No file other than the script was requested.
- **History:** navigation, including Back, kept working in a document that refuses `history.pushState`.
- **Load failure:** an unreadable saved portfolio showed **Try again**, and nothing was saved over it.
- **Every page and dialog** was checked at 360, 390, 768 and 1512 px wide, both empty and with data.
- **Muse's style rewrite:** every page was also run from the one file with Muse's `x.style` rewrite applied and a copy of its checker in front, at 390 and 1300 px wide. No chart shape reached the checker, and every chart drew with a clean console.
- **Phones:** at 360 and 366 px, every control on every page and in every dialog was checked, as a reachability check would: its effective opacity, visibility, size and `pointer-events`, clipping, and that a press at its centre lands on it. None was hidden or unreachable, including the inputs Vuetify normally hides inside selects, comboboxes, switches and checkboxes. No page scrolls sideways except wide data tables. Selects, the combobox and switches were also driven with real taps, clicks and keys.
- **Other builds:** the multi-file `app/` folder was tested the same way. Without a bridge, the app still works fully on browser storage, and shows prices as offline until a route exists.

The UI already fits Muse's phone view:

- There is no top bar on phones. The bottom navigation, **+** and refresh float above the content and slide away while you scroll down.
- The bottom navigation and full-screen dialogs keep clear of the phone's home bar and notch (the safe areas). This needs `viewport-fit=cover` in the page's viewport tag: the space's page has it, and the one-file build adds a tag with it when a page has none. At least 8px is kept at the bottom even when the shell reports no safe area.
- Times show in the device's own time zone, with its name (for example *Last Updated: … GMT+8*).
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

Without any route the app still works with everything you enter: transactions, custom assets with your own prices, goals and backups. Prices of listed stocks, funds and coins then stay empty until a route is available.
