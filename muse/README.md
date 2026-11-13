# Muse space scaffold

Everything a [Meta Muse](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) space needs to run Portfolio Tracker. Muse copies these files; it doesn't design anything.

## The prompts and the manifest

The main README has two copy-and-paste prompts: one to [create a space](../README.md#step-1-paste-this-into-muse) and one to [update or repair](../README.md#update-or-repair-your-space) a space made from any earlier version. Neither names a file, table or action. Both send Muse to [`manifest.json`](manifest.json) on the main branch, so the same prompt always installs the latest version. Everything that can change between versions is in the manifest:
- `howToUse.newSpace` and `howToUse.existingSpace`: the steps for each case. Updating keeps every saved row and removes whatever earlier versions or later edits left behind.
- `app`, `files` and `starterParts`: what to copy and where. `app.bytes` and `app.sha256` let Muse check that its copy of the app is exact. `npm run build:app` writes them.
- `storage`, `actions`, `network`, `cron` and `time`: what the space needs.
- `checks`: what to look at when it's done.

When you change the space, change the manifest with it, not the prompts. `npm test` fails when they drift apart:
- a prompt names something that can change;
- a quoted key or step reference is missing from the manifest;
- a file in this folder isn't listed;
- the actions, tables, network access or job differ from the code;
- the app's size or hash is stale.

A fork uses its own repository URL in the prompts, in `repository` here and in `package.json`.

## Files

| Repository file | In the space | What it is |
|---|---|---|
| [`../app/portfolio-tracker.js`](../app/portfolio-tracker.js) | `client/src/portfolio-tracker.js` | The whole app in one prebuilt file. Copied byte for byte. |
| [`client/index.html`](client/index.html) | `client/index.html` | The page: only `#app` and the entry script |
| [`client/src/main.ts`](client/src/main.ts) | `client/src/main.ts` | Connects the bridge, then runs the app |
| [`client/src/host.ts`](client/src/host.ts) | `client/src/host.ts` | `window.portfolioHost`: storage and market data through the server actions. Retries the first portfolio load while a phone's bridge is still starting |
| [`server/src/actions.ts`](server/src/actions.ts) | `server/src/actions.ts` | The six server actions |
| [`server/src/market.ts`](server/src/market.ts) | `server/src/market.ts` | The yahooGet allow-list, the market snapshot and the scheduled refresh (no dependencies) |
| [`server/src/schema.ts`](server/src/schema.ts) | `server/src/schema.ts` | Two Drizzle tables: `app_state` and `market_cache` |
| [`space.json`](space.json) | `space.json` | Name, entry and the 10-minute refresh job |

Two lines connect to the Spaces starter's own modules, and nothing else depends on it:
- `client/src/host.ts` imports `callAction(name, input)` from the starter's action client.
- `server/src/actions.ts` imports `db` from the starter's Drizzle database.

## How it works

1. **Opening.** The page defines `window.portfolioHost`, then runs the app. The app loads the portfolio (`getPortfolio`) and the market snapshot (`getSnapshot`) at the same time.
   - On a phone, the first action call of a session can fail once while the phone's bridge is still starting. So the bridge retries a failed `getPortfolio` up to 4 times, after 0.7, 1.5, 3 and 5 seconds. If every try fails, it reports the error and never treats the failure as an empty portfolio.
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

The page loads one script, so there's nothing to unpack and no blob URLs. The script never builds code from a string (no `eval` or `Function()`), so it passes Muse's publishing check as it is and never needs patching.

Muse's builder rewrites every `x.style` in the script so that style changes go through its own checker (`__tunnel.getStyle` / `setStyle`), which turns every value into text and "none" (`null`) into `''`. That is right for page elements, but the chart library keeps each shape's colours and sizes in a plain object that is also called `style`. Unchecked, label backgrounds and label lines were filled in a stray colour, and some charts didn't draw. The app's first module, [`src/platform/style-tunnel.ts`](../src/platform/style-tunnel.ts), passes only page elements to Muse's checker and lets every other object keep its own `style`. Outside Muse it does nothing.

In documents that refuse `history.pushState`, the app falls back to `#hash` navigation. If it can't start, or can't read the saved portfolio, it says so with a **Try again** button instead of a blank page. It never starts empty over existing data.

On phones, the bottom navigation and full-screen dialogs keep clear of the phone's home bar and notch. Times, such as Home's *Last Updated*, show in the device's own time zone.

## Tests

`npm test` from the repository root (Node 23.6 or newer) covers this folder with plain Node and no network:
- `server/src/market.ts`, against a fixed fake Yahoo: the allow-list, the scheduled refresh, the snapshot, and a round trip into the app (what the refresh stores is what the app opens on).
- `client/src/host.ts`, with a fake in place of the starter's `./api`: the retried first load, and a failed load that throws instead of returning an empty portfolio.
- `src/platform/style-tunnel.ts`, against a copy of Muse's style checker: chart shapes keep their own values, and page elements still go through Muse.
- `app/portfolio-tracker.js`, the file the space copies: it must build no code from strings.
- `manifest.json` and the README's prompts: the prompts stay generic, and the manifest matches this folder, the code and the committed app file.
