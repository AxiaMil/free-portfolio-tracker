<script setup lang="ts">
const model = defineModel<boolean>({ default: false });
const ITEMS = [
  ['How are prices updated?', 'Live quotes refresh every minute and daily history every 10 minutes while you are online. Everything is cached in the data/cache folder, so the app keeps working offline with the last known prices.'],
  ['Where is my data stored?', 'In data/portfolio.json inside the app folder. Earlier versions are kept in data/backups (one at most every 5 minutes while you edit, last 30 kept).'],
  ['Auto deposits', 'When a buy needs more cash than the portfolio holds, a deposit for the shortfall is added automatically (unless Margin & Short Selling is enabled). See Transactions → Adjusted.'],
  ['Auto dividends', 'Dividends are generated from market data using the shares you held on each ex-dividend date, paid on the pay date, minus your dividend tax rate. Turn this off in Settings → Portfolio Settings.'],
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
