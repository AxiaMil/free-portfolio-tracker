<div align="center">

<img src="public/logo.svg" alt="Portfolio Tracker logo" width="72" height="72" />

# Free Portfolio Tracker for Meta Muse

**A free, open-source stock, ETF and dividend portfolio tracker that runs in your own [Meta Muse](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) space.**

Track all your investments in one place, on your phone and computer, with live prices. It covers returns against the S&P 500 and other benchmarks, dividend income with a payment calendar, risk, allocation, goals and every trade.

It's free and open source (MIT), with no subscription, premium tier, ads or limits on portfolios and transactions. To set it up, you paste one prompt into Muse. Muse copies the finished space from this repository, so you write no code.

[![Free](https://img.shields.io/badge/price-free-34D399)](#is-it-really-free)
[![No subscription](https://img.shields.io/badge/subscription-none-34D399)](#is-it-really-free)
[![Built for Meta Muse](https://img.shields.io/badge/built%20for-Meta%20Muse-0866FF)](#get-it-in-meta-muse)
[![License: MIT](https://img.shields.io/badge/license-MIT-4C8DFF.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Vuetify 3](https://img.shields.io/badge/Vuetify-3-1867C0?logo=vuetify&logoColor=white)](https://vuetifyjs.com)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D?logo=apacheecharts&logoColor=white)](https://echarts.apache.org)
[![Data stays in your space](https://img.shields.io/badge/data-stays%20in%20your%20space-34D399)](#privacy)

[Get it in Muse](#get-it-in-meta-muse) · [Features](#features) · [What it tracks](#what-you-can-track) · [Screenshots](#screenshots) · [How it runs](#how-it-runs-in-muse) · [Import your trades](#import-your-trades) · [How it works](#how-the-numbers-are-calculated) · [FAQ](#faq) · [Development](#development)

<br />

<img src="docs/screenshots/mobile.png" alt="Free portfolio tracker app on a phone" width="100%" />

<sub>Screenshots show a fictional example portfolio. A new space starts empty.</sub>

</div>

---

## Get it in Meta Muse

Setting up the free tracker takes one prompt. You don't need to code, install anything or create another account.

**1. Create the space.** Paste this into Muse:

```text
Create a space that runs the ready-made Portfolio Tracker web app from
https://github.com/AxiaMil/portfolio-tracker (MIT licence).

The repository contains the finished space. Build it by copying, not by designing:
- Copy the files listed in muse/manifest.json to the places it gives:
  muse/space.json -> space.json, muse/client/index.html -> client/index.html,
  muse/client/src/main.ts and host.ts -> client/src/,
  muse/server/src/actions.ts, market.ts and schema.ts -> server/src/.
- Copy app/portfolio-tracker.js byte for byte to client/src/portfolio-tracker.js. It is the
  whole app in one prebuilt, tested file and loads nothing else.
- Connect only the two lines that depend on this space's starter, and change nothing else:
  client/src/host.ts imports callAction(name, input) from the starter's server-action client,
  and server/src/actions.ts imports db from the starter's Drizzle database.
- Remove the starter's own App component, styles and #root. The page holds only #app.

Do not edit, rebuild, minify, split, unpack, restyle, translate, re-implement or port the app.
Do not add anything to the interface: no header, title bar, avatar, labels under the
navigation icons, banner, tips or notes. Do not add sample data: the app starts empty.

Storage: the two tables in server/src/schema.ts. app_state holds the whole portfolio as one
JSON document under the key "portfolio"; market_cache holds the market snapshot.
Server actions: the six in server/src/actions.ts. Scheduled job: refreshMarketCache every
10 minutes, as in space.json. Network access: query1.finance.yahoo.com and
query2.finance.yahoo.com only. No other database, no login, no API keys.

When it is ready, run refreshMarketCache once, then check: Home shows 0.00 with an empty
chart; the + button opens "Manage Transaction"; adding "Buy AAPL, 10 shares" shows a value
within a few seconds; Settings -> Data & Backup says "Muse space storage"; reloading the space
keeps the transaction.
```

**2. Approve the two Yahoo Finance domains** when Muse's Sentinel asks. Prices, dividends and FX rates come from there, and only ticker symbols are sent.

**3. Add your investments.** Press **+** to add a transaction, or import a CSV from **Transactions** (see [Import your trades](#import-your-trades)). Coming from another copy of the tracker? Use **Settings → Data & Backup → Download backup** there, then **Restore from file** in the space.

The space opens on one empty portfolio called *My Portfolio*. Everything you do in it from then on is managing your portfolio.

<details>
<summary><b>If Muse changed the look</b></summary>

Send this follow-up:

```text
Undo every change you made to the tracker. Rebuild the space from the muse/ folder of
https://github.com/AxiaMil/portfolio-tracker exactly as muse/manifest.json lists it, with
app/portfolio-tracker.js copied byte for byte. No extra header, title, avatar, navigation
labels, banners or notes.
```

</details>

<details>
<summary><b>Updating a space made from an earlier version</b></summary>

Send this to move the space onto the current files. Your data is kept:

```text
Update this space to the current Portfolio Tracker space in the muse/ folder of
https://github.com/AxiaMil/portfolio-tracker (latest main), exactly as muse/manifest.json
lists it, with app/portfolio-tracker.js copied byte for byte to client/src/.
- Keep the app_state and market_cache tables and all their rows as they are: they already
  match server/src/schema.ts. Do not reset or migrate the saved portfolio.
- Replace the old front end (the embedded app/ files, blob URLs, import map, boot ladder and
  fetch cache) with client/index.html, client/src/main.ts and client/src/host.ts. The app now
  does the caching, request limits, retries and snapshot loading itself.
- Replace the server actions with server/src/actions.ts and market.ts. Keep the 10-minute
  refreshMarketCache job.
Do not change the app or add anything around it.
```

</details>

## Why use this free portfolio tracker

Most portfolio trackers want an account, a monthly subscription and a copy of every trade you have ever made. This one is free and lives in your own Muse space:

- **Free and open source.** It is MIT licensed, with no subscription, premium tier, ads or limits on portfolios, holdings or transactions. Every feature below is included.
- **Ready-made for Muse.** The finished space is in this repository. Muse copies it; nothing is designed, generated or rewritten, so every space gets the same tested app.
- **Your data stays in your space.** Transactions, settings and goals are saved in your space's own storage. Nothing else receives them, and a one-click backup gives you a copy whenever you want.
- **No extra accounts, keys or subscriptions.** The only outside requests fetch prices, FX rates, dividends and company profiles from Yahoo Finance. They contain only ticker symbols.
- **Starts from nothing.** A new space opens with one empty portfolio. There is no sample data to delete.
- **Opens at once.** The space keeps a market snapshot that is refreshed every 10 minutes, even while you're away. The app opens on it straight away and updates prices while you look.
- **Works offline.** The last known prices stay on your device, so the app keeps working when you lose your connection.
- **Proper investment maths.** Money-weighted (XIRR) and time-weighted returns, benchmark "what if" simulations, FIFO/average-cost lots, dividend withholding tax, splits and multi-currency FX.

## Features

Everything here is part of the free app:

| | |
|---|---|
| **Dashboard** | Portfolio value with today / yesterday / period gains. Shows what you would have if you had invested in a benchmark instead, or not invested at all. Includes key stats, a P&L breakdown, and a value / return / gain / cash / %-off-high chart with MWR, TWR and SR. Holdings appear as a bar chart, a treemap and a sortable table. |
| **Performance** | Returns against several benchmarks over 1M → All, with the best value in each column highlighted. Historical monthly, quarterly and annual returns, an excess-return view, and a balance view. |
| **Allocation** | Donuts by ticker (market value, cost, gain, loss) and by sector, industry, country, region, market or asset type. Shows cash on hand and concentration. |
| **Dividends** | Projected 12-month income, yield (TTM) and yield on cost. A dividend calendar, received vs upcoming payments by month, quarter or year, and a ticker × month pivot table. With a withholding tax rate set, every amount is net, and the headline shows gross − withholding = net. |
| **Risk** | Max / current / longest drawdown, volatility, Sharpe, Sortino, Calmar, beta and alpha against your benchmark. Rolling charts and a metric × period table. |
| **Goal tracker** | Plan a target with starting value, expected return, recurring contributions and contribution growth. Track actual vs planned month by month. |
| **Trade analysis** | Every lot with its gain, return, alpha vs the benchmark and holding days. Win rate, win rate vs the benchmark, trade activity and costs per year. |
| **Rebalance** | Set target weights in % or currency and see exactly how much to buy or sell of each position. |
| **Transactions** | Add trades by hand or import a CSV, then edit, bulk delete and export. An *Adjusted* ledger shows the deposits, dividends and taxes the app adds for you. Prices outside the day's trading range are flagged. |
| **Custom assets** | Track anything without a ticker, such as property, private funds or crypto on an exchange Yahoo doesn't cover, with your own price history. |
| **Everywhere** | Multiple portfolios and base currencies. Stock splits and minor-unit quotes (GBp, ZAc) handled. Hide-values privacy mode and PNG/CSV export of charts and tables. On phones, a bottom navigation bar with floating **+** and refresh buttons that slide away while you scroll. |
| **Your data** | Saved automatically on every change, with automatic snapshots you can restore. Download a JSON backup, restore it, or export every transaction as CSV. |
| **Looks** | Three themes (Graphite, Midnight and Paper) plus any accent colour, switchable in *Settings → Appearance*. |

## What you can track

| | |
|---|---|
| **Stocks and ETFs** | Anything with a Yahoo Finance symbol, on most of the world's exchanges: the US (`AAPL`, `VOO`), Singapore (`BN4.SI`), Hong Kong (`0700.HK`), London (`VUSA.L`), Europe (`ASML.AS`), Japan, Australia, Canada and more |
| **Funds, REITs and indices** | Mutual funds, REITs and indices listed on Yahoo Finance. Any index can also be a benchmark, such as the S&P 500 (`^GSPC`) |
| **Crypto** | Coins with a Yahoo Finance symbol, such as `BTC-USD`. Anything else can be a custom asset |
| **Dividends** | Added automatically from each holding's dividend history, with your withholding tax taken off, or entered yourself |
| **Cash and currencies** | Deposits, withdrawals, fees, taxes and interest. Choose from 21 base currencies (USD, SGD, EUR, GBP, HKD, JPY, AUD and more), with daily FX conversion |
| **Everything else** | Property, private funds, bonds or savings, as custom assets with prices you enter |

## Screenshots

<p align="center">
  <img src="docs/screenshots/home.png" alt="Portfolio tracker dashboard on a computer: portfolio value, benchmark comparison and performance chart" width="100%" />
  <br /><b>Home, on a computer</b>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/performance.png" alt="Portfolio performance compared with the S&amp;P 500, NASDAQ and other benchmarks" /><p align="center"><b>Performance</b></p></td>
    <td width="50%"><img src="docs/screenshots/risk.png" alt="Portfolio risk metrics: drawdown, volatility, Sharpe, Sortino, beta and alpha" /><p align="center"><b>Risk</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/allocation.png" alt="Portfolio allocation by holding, sector, country and asset type" /><p align="center"><b>Allocation</b></p></td>
    <td width="50%"><img src="docs/screenshots/dividends.png" alt="Dividend tracker: projected dividend income, yield, yield on cost and payment calendar" /><p align="center"><b>Dividends</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/trade-analysis.png" alt="Trade analysis: gain, return and alpha for every lot, with win rate" /><p align="center"><b>Trade analysis</b></p></td>
    <td width="50%"><img src="docs/screenshots/goal-tracker.png" alt="Investment goal tracker: actual portfolio value against the planned path" /><p align="center"><b>Goal tracker</b></p></td>
  </tr>
</table>

## Themes

Pick a theme in **Settings → Appearance**. Each one recolours the whole app, charts included, and you can override its accent colour.

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/theme-graphite.png" alt="Graphite theme" /><p align="center"><b>Graphite</b> (default)<br /><sub>Neutral charcoal, blue accent</sub></p></td>
    <td width="33%"><img src="docs/screenshots/theme-midnight.png" alt="Midnight theme" /><p align="center"><b>Midnight</b><br /><sub>Deep navy, violet accent</sub></p></td>
    <td width="33%"><img src="docs/screenshots/theme-paper.png" alt="Paper theme" /><p align="center"><b>Paper</b><br /><sub>Warm light pages, ink-blue accent</sub></p></td>
  </tr>
</table>

## How it runs in Muse

A Muse space runs a front end, server actions, its own storage and scheduled jobs. It can't run a Node server, listen on a port or use files on disk. The tracker is built around that, in two parts:

- **The app:** [`app/portfolio-tracker.js`](app/portfolio-tracker.js). It holds the whole app (code, styles and fonts) in one prebuilt file of about 690 KB compressed. It loads nothing else, so Muse has nothing to unpack, rebuild or rewrite.
- **The space around it:** [`muse/`](muse). It holds the page, a 30-line bridge, two storage tables, six server actions and the 10-minute refresh, listed for Muse in [`muse/manifest.json`](muse/manifest.json).

| Part of the space | What it does |
|---|---|
| `app_state` table | Your whole portfolio as one JSON document under `portfolio`, saved about 350 ms after every change |
| `market_cache` table | The market snapshot: Yahoo's price history, quotes and company profiles for what you hold |
| `getPortfolio` / `savePortfolio` | Read and save the portfolio |
| `yahooGet` | The app's only route to market data, allowed to reach `query1.finance.yahoo.com` and `query2.finance.yahoo.com` only |
| `getSnapshot` / `saveSnapshotEntries` | Read the snapshot when the app opens; store fresh quotes and profiles it fetched |
| `refreshMarketCache` | Every 10 minutes, open or not: refreshes the snapshot for your active portfolio |

**What happens when you open it:**
1. The app loads your portfolio and the snapshot at the same time.
2. It shows Home straight away from the prices cached on your device, or from the snapshot on a new device.
3. It brings anything stale up to date in the background. It sends at most six requests at a time, never the same one twice at once, and retries a failed request once.
4. While it's open, quotes refresh every minute and history every 10 minutes. The refresh button forces an update.

Only a brand-new space whose snapshot has never been filled waits for prices, and it shows a count while it does. If the app can't start, or can't read your saved portfolio, it says so with a **Try again** button. It never starts empty over your data.

The layout is made for Muse on a phone. There's no top bar. The bottom navigation, **+** and refresh float above the content and slide away while you scroll down. Help is under **Menu → Help & FAQ**. On a computer you get a sidebar and the full-width pages shown above.

[`muse/README.md`](muse/README.md) explains the space file by file, and [docs/HOSTING.md](docs/HOSTING.md) has the full bridge contract and what was tested.

## Import your trades

Use **+ → Add Transactions → Upload Files**, or **Transactions → Upload Files**, with a CSV like this:

```csv
Date,Action,Ticker,Shares,Price,Currency,Commission,Note
2024-03-15,Buy,AAPL,10,172.62,Market,1.00,
2024-06-03,Buy,0700.HK,100,375.40,Market,18.00,
2025-01-10,Sell,AAPL,5,236.85,Market,1.00,partial take-profit
2025-02-01,Deposit,,5000,1,USD,0,
```

- **Columns:** headers are matched loosely, so `Symbol`, `Qty`, `Quantity`, `Type` or `Trade Date` also work. Comma, semicolon and tab separators are detected automatically.
- **Tickers:** use Yahoo Finance symbols, such as `AAPL`, `BN4.SI`, `0700.HK`, `VUSA.L` or `ASML.AS`.
- **Currency:** `Market` means the instrument's own trading currency.
- **Actions:** Buy, Sell, Deposit, Withdraw, Dividend, Stock dividend, Transfer in/out, Fees, Taxes, Interest income/expense, Other income/expense.

## How the numbers are calculated

<details>
<summary><b>Returns: MWR, TWR and SR</b></summary>

- **MWR (money-weighted):** the XIRR of your deposits, withdrawals and current value. It is shown as a cumulative return for the selected period, `(1 + r)^(days/365) − 1`, and as an annualised rate.
- **TWR (time-weighted):** daily returns chained together, with cash flows applied at the start of the day. It measures the investments, not the timing of your deposits.
- **SR (simple return):** gain ÷ (starting value + money added during the period).
- **Benchmarks:** the "What if investing in…" line replays your exact deposits and withdrawals into the benchmark, converted to your base currency.

</details>

<details>
<summary><b>Cash, deposits and dividends</b></summary>

- When a buy costs more than the cash in the portfolio, the app adds a **deposit** for the shortfall, unless margin is enabled. These rows show in *Transactions → Adjusted*.
- With **Auto Dividend** on, dividends come from the instrument's dividend history: the shares you held before each ex-date times the dividend per share. They are paid after the instrument's usual ex-date → pay-date gap.
- The portfolio's **dividend tax rate** is withheld automatically, as a *Taxes* entry next to each automatic dividend.
- The **Dividends** page shows what reaches your cash: every amount, yield and calendar entry is net of that tax, and the headline prints gross − withholding = net. Dividends you enter yourself are taken as received, with nothing withheld.
- **Upcoming** dividends come from announced ex-dates. **Estimated** ones repeat the last 12 months of payments.

</details>

<details>
<summary><b>Risk metrics</b></summary>

- All risk metrics use daily time-weighted returns on weekdays, annualised with 252 trading days.
- **Volatility** is the standard deviation of those returns.
- **Sharpe** = CAGR ÷ volatility. **Sortino** = CAGR ÷ downside deviation. **Calmar** = CAGR ÷ |max drawdown|.
- **Beta** and **alpha** are measured against the primary benchmark in its own currency.
- Annualised figures are withheld until there are 6 months of history.

</details>

<details>
<summary><b>Lots, currencies and splits</b></summary>

- **Lots:** FIFO or average cost, selectable in *Settings → Calculation Methods*. Realised gains, unrealised gains, fees and dividends are tracked per position.
- **Currency conversion:** every value is converted to the portfolio's base currency at that day's FX rate (`USDSGD=X` style pairs, triangulated through USD when needed). Minor-unit quotes such as GBp are converted to the main unit.
- **Splits:** price history is split-adjusted. You enter trades at the price you actually paid, and share counts are adjusted automatically.

</details>

## Privacy

| What | Where it goes |
|---|---|
| Transactions, portfolios, goals, preferences | Your Muse space's storage (`app_state`), and nowhere else |
| Market snapshot | Your space's storage (`market_cache`): public market data for your tickers |
| Automatic snapshots of your data | Your device (IndexedDB): at most one every 5 minutes while you edit, the last 30 kept. Restore them in *Settings → Data & Backup* |
| Market data cache | Your device (IndexedDB), so the app opens fast and works offline |
| Ticker symbols and FX pairs | Sent to Yahoo Finance, from your space's server, to fetch prices, dividends, splits and company profiles. No cookies, no account |

Nothing about you is in this repository. Your portfolio lives only in your space. Download a backup from *Settings → Data & Backup* to keep a copy.

## Development

Only needed if you want to change the app. Running it in Muse needs none of this.

You need **Node.js 20 or newer** (23.6 or newer for the tests).

```bash
git clone https://github.com/AxiaMil/portfolio-tracker.git
cd portfolio-tracker
npm install
npm run dev
```

Open **http://localhost:5178**. Locally the app saves to your browser's storage, and the dev server forwards market-data requests to Yahoo Finance, standing in for the space's `yahooGet` action.

| Command | What it does |
|---|---|
| `npm run dev` | Development mode with hot reload on http://localhost:5178 |
| `npm test` | Engine and Muse server tests (no network needed) |
| `npm run build:app` | Rebuilds `app/`, including `app/portfolio-tracker.js`, the file Muse copies. Run it before committing any app change |
| `npm start` | Builds the app and serves it on http://localhost:5178 |
| `npm run build` | Builds the static app into `dist/` |
| `npm run preview` | Serves the last build without rebuilding |

Set `PORT` to use another port.

**Outside Muse.** The app is plain static files, so it also runs without Muse: on your computer with `npm start`, or from `app/` or `dist/` on any static host. Listed prices then need a small forwarding route to Yahoo Finance. [docs/HOSTING.md](docs/HOSTING.md) covers the options.

### Project structure

```
├── muse/              The finished Meta Muse space: page, bridge, server actions, storage, 10-minute refresh
│   └── manifest.json  What Muse copies, and where
├── app/               Prebuilt app. portfolio-tracker.js is the whole app in one file (what Muse runs);
│                      index.html + assets/ are the same app as static files
├── src/
│   ├── engine/        Pure TypeScript portfolio engine (ledger, lots, returns, risk, dividends, goals, trades)
│   ├── market/        Yahoo Finance client: request limits, retries, device cache, the space's snapshot
│   ├── platform/      Where data is saved: the space's storage (host bridge) or the browser, automatic snapshots
│   ├── pages/         One page per route
│   ├── components/    Charts, tables, dialogs and per-page components
│   ├── composables/   Shared derived stats and UI behaviour
│   ├── plugins/       Vuetify setup and the Lucide icon set
│   ├── styles/        Global styles built on the theme's CSS variables
│   ├── theme.ts       Design tokens and chart colours for each theme
│   ├── store.ts       App state, market-data loading and auto refresh
│   └── format.ts      Money / percentage formatting
├── tests/             Engine and Muse server tests (npm test)
├── public/
│   └── host.js        Host bridge template for running app/ outside Muse
└── docs/
    ├── HOSTING.md     The host bridge, the Muse space in detail, and other hosting
    └── screenshots/   Images used in this README
```

The engine in `src/engine/` has no UI dependencies. It takes your transactions plus market data and produces a daily series, holdings, lots and dividend events. Every page is a view over that result. Storage and market data each sit behind one small module (`src/platform/storage.ts`, `src/market/client.ts`). In Muse, both go through `window.portfolioHost`, which `muse/client/src/host.ts` connects to the space's server actions.

## Tech stack

[Vue 3](https://vuejs.org) · [Vuetify 3](https://vuetifyjs.com) · [Vite](https://vite.dev) · [Apache ECharts](https://echarts.apache.org) via [vue-echarts](https://github.com/ecomfe/vue-echarts) · [Lucide](https://lucide.dev) icons · [Geist](https://vercel.com/font) font. In the space: Muse server actions, Drizzle on SQLite, and one scheduled job. Market data comes from Yahoo Finance's public endpoints.

## FAQ

### Is it really free?

Yes. The tracker is open source under the MIT licence. There's no subscription, premium tier, ads or usage limit, and it never asks for payment. All you need is a Meta Muse space to run it in.

### Do I need to know how to code?

No. Paste the prompt in [Get it in Meta Muse](#get-it-in-meta-muse), and approve the two Yahoo Finance domains when asked. Muse copies the finished space. If Muse changes the look anyway, send the follow-up prompt under that section.

### Can I import my trades from my broker?

Yes, from any broker or spreadsheet that exports trades as CSV. Column names are matched loosely, and the separators are detected automatically. See [Import your trades](#import-your-trades) for the format, or download the template from the upload screen. You can also add trades by hand.

### Which markets and currencies does it support?

Any stock, ETF, fund, index or coin with a Yahoo Finance symbol, on most exchanges worldwide. A portfolio can use any of 21 base currencies. Every holding and dividend is converted at that day's FX rate. For anything Yahoo doesn't list, create a **Custom Asset** and enter prices yourself.

### Is my portfolio private?

Your transactions are saved in your own Muse space and nowhere else. The only outside requests send ticker symbols to Yahoo Finance to fetch prices. See [Privacy](#privacy).

### Is my data the same on my phone and my computer?

Yes. It is saved in your space, so every device that opens the space sees the same portfolio.

### Is this financial advice?

No. It is a bookkeeping and analytics tool. Check important numbers against your broker statements.

### Prices look stale, or the refresh button is amber.

While the app is open, quotes refresh every minute and daily history every 10 minutes. The space also refreshes its snapshot every 10 minutes while the app is closed. The refresh button (top right on a computer, above the bottom bar on a phone) forces an update. It turns amber when Yahoo Finance can't be reached, and the last known prices are shown.

### The first open of a new space waited for prices.

Until `refreshMarketCache` has run once, the snapshot is empty, so the very first open downloads prices and shows a count. After that, the space opens at once.

### A ticker isn't found.

Search uses Yahoo Finance symbols. For anything Yahoo doesn't cover, create a **Custom Asset** and enter prices yourself.

### Upcoming dividends look approximate.

Yahoo's public endpoints don't include announced ex-dates, so upcoming payments are projected from the last 12 months. The country of a holding comes from its exchange.

### Why are my dividends lower than what my holdings pay?

With a dividend tax rate set (*Settings → Portfolio Settings*), the Dividends page shows what you receive after withholding. The headline shows the gross amount, the tax and the net.

### Can I run it outside Muse?

Yes. See [Development](#development) and [docs/HOSTING.md](docs/HOSTING.md). Outside Muse, each browser keeps its own copy of your data.

## Disclaimer

Market data comes from Yahoo Finance's public, unofficial endpoints. It is intended for personal use and may be delayed or inaccurate. This project is not affiliated with Yahoo or any broker.

## License

[MIT](LICENSE)
