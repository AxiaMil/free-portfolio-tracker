# Technical details

This page is for people who want to know how the tracker works inside, or who want to change it. You don't need any of it to use the tracker in Meta Muse. The [README](../README.md) covers that.

- [How it runs in Muse](#how-it-runs-in-muse)
- [How the numbers are calculated](#how-the-numbers-are-calculated)
- [Importing trades: the full CSV format](#importing-trades-the-full-csv-format)
- [Where your data is kept](#where-your-data-is-kept)
- [Development](#development)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)

## How it runs in Muse

A Muse space runs a front end, server actions, its own storage and scheduled jobs. It can't run a Node server, listen on a port or use files on disk. The tracker is built around that, in two parts:

- **The app:** [`app/portfolio-tracker.js`](../app/portfolio-tracker.js). It holds the whole app (code, styles and fonts) in one prebuilt file of about 690 KB compressed. It loads nothing else, so Muse has nothing to unpack or rebuild. Muse does rewrite every `x.style` in it to go through its own style checker. The app's first module, [`src/platform/style-tunnel.ts`](../src/platform/style-tunnel.ts), keeps that checker to page elements so the charts' own shape styles stay intact ([details](../muse/README.md#how-it-works)).
- **The space around it:** [`muse/`](../muse). It holds the page, a 30-line bridge, two storage tables, six server actions and the 10-minute refresh, listed for Muse in [`muse/manifest.json`](../muse/manifest.json). The manifest also holds the steps for a new space and for updating any earlier one. The README's prompts only point to it, so they work for every version ([details](../muse/README.md#the-prompts-and-the-manifest)).

| Part of the space | What it does |
|---|---|
| `app_state` table | Your whole portfolio as one JSON document under `portfolio`, saved about 350 ms after every change |
| `market_cache` table | The market snapshot: Yahoo's price history, quotes and company profiles for what you hold |
| `getPortfolio` / `savePortfolio` | Read and save the portfolio |
| `yahooGet` | The app's only route to market data, allowed to reach `query1.finance.yahoo.com` and `query2.finance.yahoo.com` only |
| `getSnapshot` / `saveSnapshotEntries` | Read the snapshot when the app opens; store fresh quotes and profiles it fetched |
| `refreshMarketCache` | Every 10 minutes, open or not: refreshes the snapshot for your active portfolio |

**What happens when you open it:**
1. The app loads your portfolio and the snapshot at the same time. On a phone, the first call can fail once while the phone's bridge starts, so the space retries the portfolio load up to 4 times (after 0.7, 1.5, 3 and 5 seconds) before showing an error.
2. It shows Home straight away from the prices cached on your device, or from the snapshot on a new device.
3. It brings anything stale up to date in the background. It sends at most six requests at a time, never the same one twice at once, and retries a failed request once.
4. While it's open, quotes refresh every minute and history every 10 minutes. The refresh button forces an update.

Only a brand-new space whose snapshot has never been filled waits for prices, and it shows a count while it does. If the app can't start, or can't read your saved portfolio, it says so with a **Try again** button. It never starts empty over your data.

The layout is made for Muse on a phone. There's no top bar. The bottom navigation, **+** and refresh float above the content and slide away while you scroll down. They and full-screen dialogs keep clear of the phone's home bar and notch. Times show in your own time zone. Help is under **Menu → Help & FAQ**. On a computer you get a sidebar and full-width pages.

The app file never builds code from a string (no `eval` or `Function()`), so it passes Muse's publishing check as it is. The build fails if that changes, and `npm test` checks the committed file.

[`muse/README.md`](../muse/README.md) explains the space file by file, and [HOSTING.md](HOSTING.md) has the full bridge contract and what was tested.

## How the numbers are calculated

### Returns: MWR, TWR and SR

- **MWR (money-weighted):** the XIRR of your deposits, withdrawals and current value. It is shown as a cumulative return for the selected period, `(1 + r)^(days/365) − 1`, and as an annualised rate.
- **TWR (time-weighted):** daily returns chained together, with cash flows applied at the start of the day. It measures the investments, not the timing of your deposits.
- **SR (simple return):** gain ÷ (starting value + money added during the period).
- **Benchmarks:** the "What if investing in…" line replays your exact deposits and withdrawals into the benchmark, converted to your base currency.

### Cash, deposits and dividends

- When a buy costs more than the cash in the portfolio, the app adds a **deposit** for the shortfall, unless margin is enabled. These rows show in *Transactions → Adjusted*.
- With **Auto Dividend** on, dividends come from the instrument's dividend history: the shares you held before each ex-date times the dividend per share. Each one counts from its ex-date, the day the share price drops by it, so your value doesn't dip while the payment is on its way. (Yahoo's free data has no payment dates.)
- The portfolio's **dividend tax rate** is withheld automatically, as a *Taxes* entry next to each automatic dividend.
- The **Dividends** page shows what reaches your cash: every amount, yield and calendar entry is net of that tax, and the headline prints gross − withholding = net. Dividends you enter yourself are taken as received, with nothing withheld. A commission on one counts as a fee.
- **Per holding** (the holdings table, a holding's details and each lot in Trade Analysis), dividends are also after that tax, and so are the holding's total gain and return. The **P&L breakdown** shows dividends before it, with the tax on the *Taxes* line.
- The P&L breakdown always adds up: unrealised + realised + dividends + fees + taxes + interest + others = your value − your net deposits. Your value is always your cash plus the market value of your holdings.
- **Upcoming** dividends come from announced ex-dates. **Estimated** ones repeat the last 12 months of payments. Yahoo's public endpoints don't include announced ex-dates, so in practice upcoming payments are projected from the last 12 months.

### Risk metrics

- All risk metrics use daily time-weighted returns on weekdays, annualised with 252 trading days.
- **Volatility** is the standard deviation of those returns.
- **Sharpe** = CAGR ÷ volatility. **Sortino** = CAGR ÷ downside deviation. **Calmar** = CAGR ÷ |max drawdown|.
- **Beta** and **alpha** are measured against the primary benchmark in its own currency.
- Annualised figures are withheld until there are 6 months of history.

### Lots, currencies and splits

- **Lots:** FIFO or average cost, selectable in *Settings → Calculation Methods*. Realised gains, unrealised gains, fees and dividends are tracked per position. Cost and average cost don't include commissions, which count as fees.
- **Transfers:** a transfer in adds shares at the value you enter, as money added. A transfer out takes them out at the value you enter, as money taken out, and the gain until then is realised.
- **Selling more than you hold:** without margin, the Transactions page lists the sale under its warnings. The extra shares count as having cost nothing, so their whole sale price is gain, and the position ends at zero.
- **Currency conversion:** every value is converted to the portfolio's base currency at that day's FX rate (`USDSGD=X` style pairs, or through USD when Yahoo has no direct pair). Minor-unit quotes such as GBp are converted to the main unit. If a rate can't be loaded at all, the home page names the currency, whose amounts then count 1:1 until it loads.
- **Trades in another currency:** you can enter a trade in a currency other than the stock's own, such as a US stock bought in SGD. Its cost is converted at that day's rate. Its price, average cost and lots are shown in the stock's own currency, and it is checked against the day's range in that currency.
- **Splits:** price history is split-adjusted. You enter trades at the price you actually paid, and share counts are adjusted automatically. The trade form fills in the day's close as it was quoted then: before later splits, and in pounds for London stocks quoted in pence. It updates that price when you change the date or ticker, until you type your own.
- **Today's prices:** a quote is dated by its exchange's own calendar. Today's value uses each holding's latest price, the same one the holdings table shows, even when an exchange ahead of your time zone is already trading tomorrow.
- **Country:** a holding's country comes from the exchange it trades on.

## Importing trades: the full CSV format

```csv
Date,Action,Ticker,Shares,Price,Currency,Commission,Note
2024-03-15,Buy,AAPL,10,172.62,Market,1.00,
2024-06-03,Buy,0700.HK,100,375.40,Market,18.00,
2025-01-10,Sell,AAPL,5,236.85,Market,1.00,partial take-profit
2025-02-01,Deposit,,5000,1,USD,0,
```

- **Columns:** headers are matched loosely, so `Symbol`, `Qty`, `Quantity`, `Type` or `Trade Date` also work. Comma, semicolon and tab separators are detected automatically.
- **Tickers:** Yahoo Finance symbols, such as `AAPL`, `BN4.SI`, `0700.HK`, `VUSA.L` or `ASML.AS`.
- **Currency:** `Market` means the instrument's own trading currency.
- **Actions:** Buy, Sell, Deposit, Withdraw, Dividend, Stock dividend, Transfer in/out, Fees, Taxes, Interest income/expense, Other income/expense. Without an Action column, a negative quantity is a sale.
- **Numbers:** `1,234.50`, `1.234,50`, `1 234,50` and `1'234.50` all work, as do currency signs. Semicolon-separated files use decimal commas.
- **Dates:** `2024-03-15`, `15/03/2024`, `03/15/2024` or written out. The file's own dates decide which number is the day: any first number above 12 means day first, any second number above 12 means month first. When nothing tells, it's day first.
- **Checks:** a row with an action the importer doesn't know, a date it can't read, or no shares is skipped and listed. A missing share price is filled in with that day's close and marked, for you to check before you import. A missing dividend amount is never guessed.

## Where your data is kept

| What | Where it goes |
|---|---|
| Transactions, portfolios, goals, preferences | Your Muse space's storage (`app_state`), and nowhere else |
| Market snapshot | Your space's storage (`market_cache`): public market data for your tickers |
| Automatic snapshots of your data | Your device (IndexedDB): at most one every 5 minutes while you edit, the last 30 kept. Restore them in *Settings → Data & Backup* |
| Market data cache | Your device (IndexedDB), so the app opens fast and works offline |
| Ticker symbols and FX pairs | Sent to Yahoo Finance, from your space's server, to fetch prices, dividends, splits and company profiles. No cookies, no account |

## Development

This section is for contributors. Using the tracker in Meta Muse needs none of it.

**Requirements:** Node.js 20 or newer (23.6 or newer to run the tests).

```bash
git clone https://github.com/AxiaMil/free-portfolio-tracker.git
cd free-portfolio-tracker
npm install
npm run dev
```

`npm run dev` starts a development server on your own machine and prints the address to open in your browser (port 5178 by default; set the `PORT` environment variable to change it). In this mode the app saves to the browser's own storage, and the development server forwards market-data requests to Yahoo Finance in place of the space's `yahooGet` action.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server, with hot reload |
| `npm test` | Runs the engine, Muse server and Muse bridge tests, and checks the built app (no network needed) |
| `npm run build:app` | Rebuilds `app/`, including `app/portfolio-tracker.js`, the file Muse copies, and writes that file's size and hash into `muse/manifest.json`. Run it before committing any app change |
| `npm run build` | Builds the static app into `dist/` |
| `npm run preview` | Serves the last build locally, to check it before release |
| `npm start` | `npm run build`, then `npm run preview` |

**Outside Muse.** The app is plain static files, so it also runs without Muse, from `app/` or `dist/` on any static host. Live prices then need a small forwarding route to Yahoo Finance, and each browser keeps its own copy of your data. [HOSTING.md](HOSTING.md) covers the options.

## Project structure

```
├── muse/              The finished Meta Muse space: page, bridge, server actions, storage, 10-minute refresh
│   └── manifest.json  What Muse copies, and where
├── app/               Prebuilt app. portfolio-tracker.js is the whole app in one file (what Muse runs);
│                      index.html + assets/ are the same app as static files
├── src/
│   ├── engine/        Pure TypeScript portfolio engine (ledger, lots, returns, risk, dividends, goals, trades)
│   ├── market/        Yahoo Finance client: request limits, retries, device cache, the space's snapshot
│   ├── platform/      Where data is saved: the space's storage (host bridge) or the browser, automatic snapshots,
│                      and the repair for Muse's style rewrite
│   ├── pages/         One page per route
│   ├── components/    Charts, tables, dialogs and per-page components
│   ├── composables/   Shared derived stats and UI behaviour
│   ├── plugins/       Vuetify setup and the Lucide icon set
│   ├── styles/        Global styles built on the theme's CSS variables
│   ├── theme.ts       Design tokens and chart colours for each theme
│   ├── store.ts       App state, market-data loading and auto refresh
│   └── format.ts      Money / percentage formatting
├── tests/             Engine, Muse server, bridge, style checker, manifest and prompts, and build-output tests
├── public/
│   └── host.js        Host bridge template for running app/ outside Muse
└── docs/
    ├── TECHNICAL.md   This page
    ├── HOSTING.md     The host bridge, the Muse space in detail, and other hosting
    └── screenshots/   Images used in the README
```

The engine in `src/engine/` has no UI dependencies. It takes your transactions plus market data and produces a daily series, holdings, lots and dividend events. Every page is a view over that result. Storage and market data each sit behind one small module (`src/platform/storage.ts`, `src/market/client.ts`). In Muse, both go through `window.portfolioHost`, which `muse/client/src/host.ts` connects to the space's server actions.

## Tech stack

[Vue 3](https://vuejs.org) · [Vuetify 3](https://vuetifyjs.com) · [Vite](https://vite.dev) · [Apache ECharts](https://echarts.apache.org) via [vue-echarts](https://github.com/ecomfe/vue-echarts) (its CSP build) · [Lucide](https://lucide.dev) icons · [Geist](https://vercel.com/font) font. In the space: Muse server actions, Drizzle on SQLite, and one scheduled job. Market data comes from Yahoo Finance's public endpoints.
