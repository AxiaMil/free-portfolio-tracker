<script setup lang="ts">
const model = defineModel<boolean>({ default: false });
const ITEMS = [
  ['How are prices updated?', 'Live quotes refresh every minute and daily history every 10 minutes while you are online. Prices are cached in this browser, so the app keeps working offline with the last known prices.'],
  ['Where is my data stored?', 'In this browser (or in the app the tracker runs inside, such as a Muse space). Nothing is uploaded anywhere else. Earlier versions are kept as automatic snapshots, and Settings → Data & Backup can download a backup file.'],
  ['Auto deposits', 'When a buy needs more cash than the portfolio holds, a deposit for the shortfall is added automatically (unless Margin & Short Selling is enabled). See Transactions → Adjusted.'],
  ['Auto dividends', 'Dividends come from market data: the shares you held before each ex-dividend date times the dividend per share, less your dividend tax rate. From its ex-dividend date, the day the share price drops by it, it counts in your value as to be paid. It reaches your cash on the payment date the company published, from SGX, Nasdaq, the ASX or a source your Muse sets up (Settings → Dividend Dates). You can also type a payment date: tap it on the Dividends page. Turn auto dividends off in Settings → Portfolio Settings.'],
  ['MWR, TWR, SR', 'MWR (money-weighted / XIRR) includes the timing and size of your deposits. TWR (time-weighted) measures the investments only and is used for risk metrics. SR (simple return) = gain / invested capital.'],
  ['Tickers', 'Use Yahoo Finance symbols: US stocks as-is (AAPL), Singapore BN4.SI, Hong Kong 0700.HK, London VUSA.L. Assets without market data can be tracked as Custom Assets.'],
];
</script>

<template>
  <v-dialog v-model="model" max-width="640" scrollable>
    <v-card class="pa-2">
      <v-card-title class="d-flex align-center">Help<v-spacer /><v-btn icon="mdi-close" variant="text" @click="model = false" /></v-card-title>
      <v-card-text>
        <v-expansion-panels variant="accordion">
          <v-expansion-panel v-for="[q, a] in ITEMS" :key="q" :title="q" :text="a" />
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
