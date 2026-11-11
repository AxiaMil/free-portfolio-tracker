<div align="center">

<img src="public/logo.svg" alt="Portfolio Tracker logo" width="72" height="72" />

# Portfolio Tracker

**A self-hosted, offline-first investment portfolio tracker.**

Performance, dividends, risk, allocation, goals and trade analysis, all computed on your own machine from your own transactions, with live market data.

[![License: MIT](https://img.shields.io/badge/license-MIT-4C8DFF.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Vuetify 3](https://img.shields.io/badge/Vuetify-3-1867C0?logo=vuetify&logoColor=white)](https://vuetifyjs.com)
[![Vite 6](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![ECharts 5](https://img.shields.io/badge/ECharts-5-AA344D?logo=apacheecharts&logoColor=white)](https://echarts.apache.org)
[![Node ≥ 20](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Self-hosted](https://img.shields.io/badge/data-stays%20local-34D399)](#privacy)

[Features](#features) · [Screenshots](#screenshots) · [Themes](#themes) · [Quick start](#quick-start) · [Import your trades](#import-your-trades) · [How it works](#how-the-numbers-are-calculated) · [FAQ](#faq)

<br />

<img src="docs/screenshots/home.png" alt="Home dashboard" width="100%" />

<sub>All screenshots use the fictional demo portfolio that ships with the app.</sub>

</div>

---

## Why

Most portfolio trackers want an account, a subscription and a copy of every trade you have ever made. This one is a small Node server and a web app that you run yourself:

- **Your data never leaves your computer.** Transactions, settings and goals live in one JSON file in `data/`.
- **No account, no subscription, no telemetry.** The only outbound requests fetch prices, FX rates, dividends and company profiles from Yahoo Finance. They contain only the ticker symbols.
- **Works offline.** Market data is cached on disk, so the app keeps working with the last known prices when you lose your connection.
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
| **Everywhere** | Multiple portfolios and base currencies. Stock splits and minor-unit quotes (GBp, ZAc) handled. Hide-values privacy mode, a phone layout with bottom navigation, and PNG/CSV export of charts and tables. |
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

You need **Node.js 20 or newer**.

```bash
git clone https://github.com/AxiaMil/portfolio-tracker.git
cd portfolio-tracker
npm install
npm start
```

Open **http://localhost:5178**. The first start creates `data/portfolio.json` from the demo portfolio in [`server/seed.json`](server/seed.json). Delete the demo trades in **Transactions** (or replace the file) and add your own.

| Command | What it does |
|---|---|
| `npm start` | Builds the app and starts the local server on port 5178 |
| `npm run serve` | Starts the server without rebuilding |
| `npm run dev` | Development mode with hot reload on http://localhost:5173 |
| `npm run build` | Builds the front end into `dist/` |

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5178` | Port of the local server (in `npm run dev`, the port of the UI) |
| `API_PORT` | `5178` | API server port used by `npm run dev` |
| `PORTFOLIO_DATA_DIR` | `./data` | Where your portfolio, backups and market-data cache are stored |

The server only listens on `127.0.0.1`, so it is not reachable from other machines on your network.

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
| Transactions, portfolios, goals, preferences | `data/portfolio.json` on your disk only |
| Backups | `data/backups/`: at most one every 5 minutes while you edit, last 30 kept |
| Ticker symbols and FX pairs | Sent to Yahoo Finance to fetch prices, dividends, splits and company profiles |
| Market data | Cached in `data/cache/` |

`data/` is in `.gitignore`, so a fork or clone of this repository never contains your portfolio.

## Project structure

```
├── server/            Express server: state storage, Yahoo Finance proxy + disk cache
│   └── seed.json      Demo portfolio used on first start
├── src/
│   ├── engine/        Pure TypeScript portfolio engine (ledger, lots, returns, risk, dividends, goals, trades)
│   ├── pages/         One page per route
│   ├── components/    Charts, tables, dialogs and per-page components
│   ├── plugins/       Vuetify setup and the Lucide icon set
│   ├── styles/        Global styles built on the theme's CSS variables
│   ├── theme.ts       Design tokens and chart colours for each theme
│   ├── store.ts       App state, market-data loading and auto refresh
│   └── format.ts      Money / percentage formatting
├── scripts/dev.mjs    Runs the API server and Vite together
└── docs/screenshots/  Images used in this README
```

The engine in `src/engine/` has no UI dependencies. It takes your transactions plus market data and produces a daily series, holdings, lots and dividend events. Every page is a view over that result.

## Tech stack

[Vue 3](https://vuejs.org) · [Vuetify 3](https://vuetifyjs.com) · [Vite](https://vite.dev) · [Apache ECharts](https://echarts.apache.org) via [vue-echarts](https://github.com/ecomfe/vue-echarts) · [Express](https://expressjs.com) · [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) · [Lucide](https://lucide.dev) icons · [Geist](https://vercel.com/font) font

## FAQ

**Is this financial advice?** No. It is a bookkeeping and analytics tool. Check important numbers against your broker statements.

**Prices look stale.** Quotes refresh every minute and daily history every 10 minutes while the app is open. The refresh button in the top bar forces an update. It turns amber when the app is showing cached prices because Yahoo Finance could not be reached.

**A ticker isn't found.** Search uses Yahoo Finance symbols. For anything Yahoo doesn't cover, create a **Custom Asset** and enter prices yourself.

**Can I run it on a home server?** Yes. Put it behind a reverse proxy with authentication, because the app has no login of its own. By default it only listens on `127.0.0.1`.

## Disclaimer

Market data comes from Yahoo Finance through the unofficial `yahoo-finance2` library. It is intended for personal use and may be delayed or inaccurate. This project is not affiliated with Yahoo or any broker.

## License

[MIT](LICENSE)
