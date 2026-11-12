<div align="center">

<img src="public/logo.svg" alt="Portfolio Tracker logo" width="72" height="72" />

# Portfolio Tracker

**A private, offline-first investment portfolio tracker that runs entirely in your browser.**

Performance, dividends, risk, allocation, goals and trade analysis, computed on your own device from your own transactions, with live market data. No server, no account. It runs on your computer, on any static host, or as a [Meta Muse](#run-it-on-meta-muse) space.

[![License: MIT](https://img.shields.io/badge/license-MIT-4C8DFF.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Vuetify 3](https://img.shields.io/badge/Vuetify-3-1867C0?logo=vuetify&logoColor=white)](https://vuetifyjs.com)
[![Vite 6](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D?logo=apacheecharts&logoColor=white)](https://echarts.apache.org)
[![Static app](https://img.shields.io/badge/runs%20as-static%20files-339933)](docs/HOSTING.md)
[![Data stays local](https://img.shields.io/badge/data-stays%20local-34D399)](#privacy)

[Features](#features) · [Screenshots](#screenshots) · [Quick start](#quick-start) · [Meta Muse](#run-it-on-meta-muse) · [Import your trades](#import-your-trades) · [How it works](#how-the-numbers-are-calculated) · [FAQ](#faq)

<br />

<img src="docs/screenshots/home.png" alt="Home dashboard" width="100%" />

<sub>Screenshots show a fictional example portfolio. A fresh copy of the app starts empty.</sub>

</div>

---

## Why

Most portfolio trackers want an account, a subscription and a copy of every trade you have ever made. This one is a web app that keeps everything on your side:

- **Your data stays with you.** Transactions, settings and goals are saved in your browser (or in the app platform you run it on). Nothing is uploaded, and a one-click backup moves it anywhere.
- **No account, no subscription, no telemetry.** The only outbound requests fetch prices, FX rates, dividends and company profiles from Yahoo Finance. They contain only the ticker symbols.
- **Starts from nothing.** A fresh copy opens with one empty portfolio. There is no sample data to delete.
- **Works offline.** Market data is cached in the browser, so the app keeps working with the last known prices when you lose your connection.
- **Proper investment maths.** Money-weighted (XIRR) and time-weighted returns, benchmark "what if" simulations, FIFO/average-cost lots, dividend withholding tax, splits and multi-currency FX.

## Features

| | |
|---|---|
| **Dashboard** | Portfolio value with today / yesterday / period gains. Shows what you would have if you had invested in a benchmark instead, or not invested at all. Includes key stats, a P&L breakdown, and a value / return / gain / cash / %-off-high chart with MWR, TWR and SR. Holdings appear as a bar chart, a treemap and a sortable table. |
| **Performance** | Returns against several benchmarks over 1M → All, with the best value in each column highlighted. Historical monthly, quarterly and annual returns, an excess-return view, and a balance view. |
| **Allocation** | Donuts by ticker (market value, cost, gain, loss) and by sector, industry, country, region, market or asset type. Shows cash on hand and concentration. |
| **Dividends** | Projected 12-month income, yield (TTM) and yield on cost. A dividend calendar, received vs upcoming payments by month, quarter or year, and a ticker × month pivot table. |
| **Risk** | Max / current / longest drawdown, volatility, Sharpe, Sortino, Calmar, beta and alpha against your benchmark. Rolling charts and a metric × period table. |
| **Goal tracker** | Plan a target with starting value, expected return, recurring contributions and contribution growth. Track actual vs planned month by month. |
| **Trade analysis** | Every lot with its gain, return, alpha vs the benchmark and holding days. Win rate, win rate vs the benchmark, trade activity and costs per year. |
| **Rebalance** | Set target weights in % or currency and see exactly how much to buy or sell of each position. |
| **Transactions** | Add trades by hand or import a CSV, then edit, bulk delete and export. An *Adjusted* ledger shows the deposits, dividends and taxes the app adds for you. Prices outside the day's trading range are flagged. |
| **Custom assets** | Track anything without a ticker, such as property, private funds or crypto on an exchange Yahoo doesn't cover, with your own price history. |
| **Everywhere** | Multiple portfolios and base currencies. Stock splits and minor-unit quotes (GBp, ZAc) handled. Hide-values privacy mode and PNG/CSV export of charts and tables. On phones, a bottom navigation bar with floating **+** and refresh buttons that slide away while you scroll. |
| **Your data** | Saved automatically on every change, with automatic snapshots you can restore. Download a JSON backup, restore it, or export every transaction as CSV. |
| **Looks** | Three themes (Graphite, Midnight and Paper) plus any accent colour, switchable in *Settings → Appearance*. A web app manifest and icons let you add it to a phone's home screen. |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/performance.png" alt="Performance" /><p align="center"><b>Performance</b></p></td>
    <td width="50%"><img src="docs/screenshots/risk.png" alt="Risk" /><p align="center"><b>Risk</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/allocation.png" alt="Allocation" /><p align="center"><b>Allocation</b></p></td>
    <td width="50%"><img src="docs/screenshots/dividends.png" alt="Dividends" /><p align="center"><b>Dividends</b></p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/trade-analysis.png" alt="Trade analysis" /><p align="center"><b>Trade analysis</b></p></td>
    <td width="50%"><img src="docs/screenshots/goal-tracker.png" alt="Goal tracker" /><p align="center"><b>Goal tracker</b></p></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile.png" alt="Phone layout" width="100%" />
  <br /><b>Phone layout</b>
</p>

## Themes

Pick a theme in **Settings → Appearance**. Each one recolours the whole app, charts included, and you can override its accent colour.

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/theme-graphite.png" alt="Graphite theme" /><p align="center"><b>Graphite</b> (default)<br /><sub>Neutral charcoal, blue accent</sub></p></td>
    <td width="33%"><img src="docs/screenshots/theme-midnight.png" alt="Midnight theme" /><p align="center"><b>Midnight</b><br /><sub>Deep navy, violet accent</sub></p></td>
    <td width="33%"><img src="docs/screenshots/theme-paper.png" alt="Paper theme" /><p align="center"><b>Paper</b><br /><sub>Warm light pages, ink-blue accent</sub></p></td>
  </tr>
</table>

## Quick start

You need **Node.js 20 or newer** to build it. The app itself is plain static files.

```bash
git clone https://github.com/AxiaMil/portfolio-tracker.git
cd portfolio-tracker
npm install
npm start
```

Open **http://localhost:5178**. The app starts empty, with one portfolio called *My Portfolio* in your region's currency. Press **+** to add your first transaction, or import a CSV.

| Command | What it does |
|---|---|
| `npm start` | Builds the app and serves it on http://localhost:5178 |
| `npm run dev` | Development mode with hot reload, same address |
| `npm run build` | Builds the static app into `dist/` |
| `npm run preview` | Serves the last build without rebuilding |
| `npm run build:app` | Rebuilds the prebuilt drop-in copy in `app/` (used by Meta Muse) |

Set `PORT` to use another port. Both servers forward market-data requests to Yahoo Finance, because browsers can't call it directly.

### Host it anywhere

`app/` (prebuilt) and `dist/` (your own build) work from any static host, at the domain root or in a sub-folder. Listed prices need one small forwarding route to Yahoo Finance. [docs/HOSTING.md](docs/HOSTING.md) covers the options: a reverse proxy, the `VITE_MARKET_PROXY` build setting, or a host platform's server function.

## Run it on Meta Muse

The tracker runs as a [Meta Muse](https://about.fb.com/news/2026/11/introducing-spaces-customize-muse-app/) space as a drop-in. The repository ships a prebuilt, tested copy in [`app/`](app). It is plain static files, so Muse has no build step, no dependencies and no app code to change. Muse only connects two services it already has, its storage and a server action, through one small file, `app/host.js`. Everything you then do in the space is managing your portfolio.

**1. Create the space.** Paste this into Muse:

```text
Create a space that runs the ready-made web app in the app/ folder of
https://github.com/AxiaMil/portfolio-tracker (MIT licence).

The app is finished and tested. Treat app/ as a fixed, prebuilt asset:
- Serve the files in app/ exactly as they are, as this space's whole front end, full screen.
  app/index.html is the entry page and every path in it is relative. There is no build step.
- Do not edit, rebuild, regenerate, restyle, translate, re-implement or port any of it to another
  framework. If the space needs a page of its own, show app/index.html full screen in a frame with
  nothing around it.
- Do not add anything to the interface: no header, title bar, avatar, labels under the navigation
  icons, banner, tips or notes. Do not add sample data. The app starts empty, as intended.

The only file to write is app/host.js (empty by default). It connects the app to this space. Make it
exactly this, replacing the three commented calls with this space's storage and the server action:

window.portfolioHost = {
  name: 'Muse space storage',
  async loadState() {
    // return the JSON saved in this space's storage under the key "portfolio", or null if none yet
  },
  async saveState(state) {
    // save `state` (one JSON object, the whole portfolio) in this space's storage under "portfolio"
  },
  async fetchJson(url) {
    // return await yahooGet(url)  (the server action below)
  },
};

Server action yahooGet(url): HTTP GET the url and return the parsed JSON body (also when the status is
not 200). Only accept URLs that start with https://query1.finance.yahoo.com/ or
https://query2.finance.yahoo.com/, and reject everything else. No API key, cookies or login.

Network access: query1.finance.yahoo.com and query2.finance.yahoo.com only.
Nothing else is needed: no database, no login, no scheduled jobs. While it is open the app refreshes
prices every minute and caches them itself.

When it is ready, check that Home shows 0.00 with an empty chart, that the + button opens "Manage
Transaction", that adding "Buy AAPL, 10 shares" shows a value within a few seconds, that
Settings → Data & Backup says "Muse space storage", and that reloading the space keeps the transaction.
```

**2. Approve the two Yahoo Finance domains** when Muse's Sentinel asks. Prices, dividends and FX rates come from there, and only ticker symbols are sent.

**3. Bring your data (optional).** In your old copy, use **Settings → Data & Backup → Download backup**. In the Muse space, use **Restore from file**. You can also import a CSV from **Transactions**.

If Muse changed the look anyway, send this follow-up:

```text
Undo every change you made to the tracker. Serve the files in app/ from
https://github.com/AxiaMil/portfolio-tracker exactly as they are. The only file you write is
app/host.js (space storage and the yahooGet server action). No extra header, title, avatar,
navigation labels, banners or notes.
```

What you get in the space is the same app as here, on phone and computer:
- **All features:** every page and tool.
- **Phone layout:** bottom navigation, with + and refresh buttons that slide away while you scroll.
- **Saving:** automatic, with snapshots you can restore.
- **Offline:** the last known prices are kept.

The first visit loads about 500 KB (compressed). After that, the files are cached.

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
- The portfolio's **dividend tax rate** is withheld automatically.
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
| Transactions, portfolios, goals, preferences | Your browser's storage for this site (`localStorage`), or the host's storage when one is connected, as in Meta Muse |
| Automatic snapshots | IndexedDB in your browser: at most one every 5 minutes while you edit, the last 30 kept. Restore them in *Settings → Data & Backup* |
| Ticker symbols and FX pairs | Sent to Yahoo Finance to fetch prices, dividends, splits and company profiles. No cookies, no account |
| Market data | Cached in IndexedDB in your browser |

Nothing about you is in this repository. Your portfolio lives only where you run the app. Download a backup from *Settings → Data & Backup* to keep a copy or move it to another browser.

## Project structure

```
├── app/               Prebuilt drop-in copy of the app (static files, used by Meta Muse)
├── public/
│   └── host.js        Optional host bridge (storage + market data) for platforms such as Meta Muse
├── src/
│   ├── engine/        Pure TypeScript portfolio engine (ledger, lots, returns, risk, dividends, goals, trades)
│   ├── market/        Yahoo Finance client: plain fetch(), route discovery, IndexedDB cache
│   ├── platform/      Where data is saved: browser storage, host storage, automatic snapshots
│   ├── pages/         One page per route
│   ├── components/    Charts, tables, dialogs and per-page components
│   ├── composables/   Shared derived stats and UI behaviour
│   ├── plugins/       Vuetify setup and the Lucide icon set
│   ├── styles/        Global styles built on the theme's CSS variables
│   ├── theme.ts       Design tokens and chart colours for each theme
│   ├── store.ts       App state, market-data loading and auto refresh
│   └── format.ts      Money / percentage formatting
└── docs/
    ├── HOSTING.md     Static hosting, the host bridge and Meta Muse
    └── screenshots/   Images used in this README
```

The engine in `src/engine/` has no UI dependencies. It takes your transactions plus market data and produces a daily series, holdings, lots and dividend events. Every page is a view over that result. Storage and market data each sit behind one small module (`src/platform/storage.ts`, `src/market/client.ts`), so the app can move to another host without touching the rest.

## Tech stack

[Vue 3](https://vuejs.org) · [Vuetify 3](https://vuetifyjs.com) · [Vite](https://vite.dev) · [Apache ECharts](https://echarts.apache.org) via [vue-echarts](https://github.com/ecomfe/vue-echarts) · [Lucide](https://lucide.dev) icons · [Geist](https://vercel.com/font) font. No back end: market data comes from Yahoo Finance's public endpoints over plain `fetch()`.

## FAQ

**Is this financial advice?** No. It is a bookkeeping and analytics tool. Check important numbers against your broker statements.

**Where did my data go when I opened it in another browser?** Each browser keeps its own copy. Use *Settings → Data & Backup → Download backup* in one, then *Restore from file* in the other.

**Prices look stale, or the refresh button is amber.** Quotes refresh every minute and daily history every 10 minutes while the app is open. The refresh button (top right on a computer, above the bottom bar on a phone) forces an update. It turns amber when Yahoo Finance can't be reached and cached prices are shown. On a static host, prices need the forwarding route described in [docs/HOSTING.md](docs/HOSTING.md).

**A ticker isn't found.** Search uses Yahoo Finance symbols. For anything Yahoo doesn't cover, create a **Custom Asset** and enter prices yourself.

**Upcoming dividends look approximate.** Yahoo's public endpoints don't include announced ex-dates. Upcoming payments are projected from the last 12 months, and the country of a holding comes from its exchange.

**Can I run it on a home server?** Yes. Serve `dist/` with any web server and forward the Yahoo routes (see [docs/HOSTING.md](docs/HOSTING.md)). Each browser still keeps its own data, so put it behind authentication if others can reach it.

## Disclaimer

Market data comes from Yahoo Finance's public, unofficial endpoints. It is intended for personal use and may be delayed or inaccurate. This project is not affiliated with Yahoo or any broker.

## License

[MIT](LICENSE)
