# Muse space scaffold

Everything a [Meta Muse](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) space needs to run Portfolio Tracker. Muse copies these files; it doesn't design anything. The copy-and-paste prompt is in the main README under [Get it in Meta Muse](../README.md#get-it-in-meta-muse), and [`manifest.json`](manifest.json) lists the same thing in machine-readable form.

| Repository file | In the space | What it is |
|---|---|---|
| [`../app/portfolio-tracker.js`](../app/portfolio-tracker.js) | `client/src/portfolio-tracker.js` | The whole app in one prebuilt file. Copied byte for byte. |
| [`client/index.html`](client/index.html) | `client/index.html` | The page: only `#app` and the entry script |
| [`client/src/main.ts`](client/src/main.ts) | `client/src/main.ts` | Connects the bridge, then runs the app |
| [`client/src/host.ts`](client/src/host.ts) | `client/src/host.ts` | `window.portfolioHost`: storage and market data through the server actions |
| [`server/src/actions.ts`](server/src/actions.ts) | `server/src/actions.ts` | The six server actions |
| [`server/src/market.ts`](server/src/market.ts) | `server/src/market.ts` | The yahooGet allow-list, the market snapshot and the scheduled refresh (no dependencies) |
| [`server/src/schema.ts`](server/src/schema.ts) | `server/src/schema.ts` | Two Drizzle tables: `app_state` and `market_cache` |
| [`space.json`](space.json) | `space.json` | Name, entry and the 10-minute refresh job |

Two lines connect to the Spaces starter's own modules, and nothing else depends on it:
- `client/src/host.ts` imports `callAction(name, input)` from the starter's action client.
- `server/src/actions.ts` imports `db` from the starter's Drizzle database.

## How it works

1. **Opening.** The page defines `window.portfolioHost`, then runs the app. The app loads the portfolio (`getPortfolio`) and the market snapshot (`getSnapshot`) at the same time.
   - When the device has its own cache, Home shows at once from it.
   - On a new device, Home shows from the snapshot, whatever its age.
   - Prices then update live through `yahooGet`.
   - Only a space whose snapshot has never been filled waits for live data, with a count.
2. **While open.** Quotes refresh every minute and history every 10 minutes. The refresh button forces an update.
   - The app sends at most six requests at a time.
   - It never requests the same data twice at once, and it retries a failed request once.
   - Fresh quotes and profiles go back to the snapshot (`saveSnapshotEntries`) every 15 seconds at most.
3. **While closed.** `refreshMarketCache` runs every 10 minutes and refreshes the snapshot: history, quotes and profiles for the active portfolio. A failed fetch never removes the last good data.
4. **Saving.** Every change saves the whole portfolio as one JSON document under `portfolio` (`savePortfolio`), about 350 ms after the change.

The page loads one script, so there's nothing to unpack and no blob URLs. In documents that refuse `history.pushState`, the app falls back to `#hash` navigation. If it can't start, or can't read the saved portfolio, it says so with a **Try again** button instead of a blank page. It never starts empty over existing data.

## Testing the server logic

`server/src/market.ts` has no dependencies, so its tests run with plain Node: `npm test` from the repository root (Node 23.6 or newer). They use a fixed fake Yahoo, so they need no network.
