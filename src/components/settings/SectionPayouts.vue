<script setup lang="ts">
// Dividend Dates: where each dividend-paying holding's payment dates come from. The exchanges' own data needs no
// setup; a holding no built-in connector covers is handed to the user's Muse, with the sentence to send it.
import { computed } from 'vue';
import { loadPayouts, market, result, store } from '../../store.ts';
import { payoutRoute } from '../../market/client.ts';
import { museRequest, sourceName } from '../div/payoutSources.ts';

const route = computed(() => { void market.value; return payoutRoute(); });

interface Row { symbol: string; name: string; status: 'ok' | 'muse' | 'none' | 'waiting'; text: string; unpublished: number }

const rows = computed<Row[]>(() => {
  const r = result.value;
  if (!r) return [];
  const payouts = market.value.payouts ?? {};
  const out: Row[] = [];
  for (const h of r.holdings) {
    if (h.isCustom || !market.value.charts[h.symbol]?.dividends?.length) continue;
    const info = payouts[h.symbol];
    const unpublished = r.dividends.filter((d) => d.symbol === h.symbol && d.status === 'toBePaid' && !d.payKnown).length;
    let status: Row['status'];
    let text: string;
    if (info?.source) {
      status = 'ok';
      const latest = info.records.find((x) => x.payDate);
      text = `From ${sourceName(info.source)}${latest ? `: latest paid ${latest.payDate}` : ''}`;
    } else if (info) {
      status = route.value === 'host' ? 'muse' : 'none';
      text = route.value === 'host' ? 'No built-in source: ask your Muse' : 'No source here: type its dates on the Dividends page';
    } else {
      status = 'waiting';
      text = route.value === null ? 'Not looked up: no connection to the exchanges here' : 'Not looked up yet';
    }
    out.push({ symbol: h.symbol, name: h.name, status, text, unpublished });
  }
  return out.sort((a, b) => (a.status === b.status ? a.symbol.localeCompare(b.symbol) : a.status === 'muse' ? -1 : b.status === 'muse' ? 1 : 0));
});

const forMuse = computed(() => rows.value.filter((x) => x.status === 'muse').map((x) => x.symbol));
const request = computed(() => museRequest(forMuse.value));
const lastChecked = computed(() => {
  const t = Math.max(0, ...Object.values(market.value.payouts ?? {}).map((p) => p.checkedAt || 0));
  return t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
});

async function copy() {
  try {
    await navigator.clipboard.writeText(request.value);
    store.snackbar = { show: true, text: 'Copied: send it to your Muse', color: '' };
  } catch {
    store.snackbar = { show: true, text: 'Select the request and copy it', color: '' };
  }
}
</script>

<template>
  <div class="sec">
    <p class="intro">
      A dividend counts in your value from its ex-dividend date, as <b>to be paid</b>, and reaches your cash on the payment date the company
      published. The dates come from the exchanges' own data: SGX (Singapore), Nasdaq and ASX (Australia), with nothing to set up.
    </p>

    <div v-if="forMuse.length" class="muse" data-test="ask-muse">
      <div class="m-h"><v-icon size="18">mdi-creation</v-icon>Ask your Muse for {{ forMuse.join(', ') }}</div>
      <p class="m-d">No built-in source covers {{ forMuse.length === 1 ? 'this holding' : 'these holdings' }}. Your Muse can connect one made for you: send it this.</p>
      <div class="req">{{ request }}</div>
      <button class="btn-primary" data-test="copy-request" @click="copy"><v-icon size="17">mdi-content-copy</v-icon>Copy request</button>
    </div>

    <div class="sec-h" :class="{ mt: forMuse.length }">Your dividend-paying holdings</div>
    <div v-if="!rows.length" class="empty">None yet. A holding appears here once it has paid a dividend.</div>
    <div v-for="r in rows" :key="r.symbol" class="prow" :data-test="`payout-${r.symbol}`">
      <v-icon size="18" class="pi" :class="r.status">{{ r.status === 'ok' ? 'mdi-check-circle' : r.status === 'muse' ? 'mdi-creation' : 'mdi-help-circle-outline' }}</v-icon>
      <div class="pt">
        <div class="ps"><b>{{ r.symbol }}</b><span class="pn" :title="r.name">{{ r.name }}</span></div>
        <div class="pd">{{ r.text }}<template v-if="r.unpublished"> · {{ r.unpublished }} to be paid without a published date</template></div>
      </div>
    </div>

    <div class="row mt-4">
      <div class="r-d">{{ lastChecked ? `Last checked ${lastChecked}.` : 'Not checked yet.' }} Checked again once a day; you can also type any payment date on the Dividends page.</div>
      <button class="btn-outline" :disabled="store.checkingPayouts || route === null || !rows.length" data-test="check-payouts" @click="loadPayouts(true)">
        {{ store.checkingPayouts ? 'Checking…' : 'Check now' }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './section.scss';
.intro { margin: 0 0 16px; font-size: 13.5px; line-height: 20px; color: var(--text-2); b { color: var(--text); font-weight: 600; } }
.muse { padding: 14px; border: 1px solid var(--primary); border-radius: 12px; background: var(--primary-soft); display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.m-h { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14.5px; .v-icon { color: var(--primary-text); } }
.m-d { margin: 0; font-size: 13px; line-height: 19px; color: var(--text-2); }
.req { width: 100%; padding: 10px 12px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); font-size: 13px; line-height: 19px; user-select: all; overflow-wrap: anywhere; }
.empty { font-size: 13px; color: var(--muted); }
.prow { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line-soft); &:first-of-type { border-top: 0; } }
.pi { margin-top: 1px; color: var(--muted); &.ok { color: var(--pos); } &.muse { color: var(--primary-text); } }
.pt { min-width: 0; flex: 1; }
.ps { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; min-width: 0; b { font-weight: 600; } }
.pn { font-size: 12.5px; color: var(--text-2); overflow-wrap: anywhere; }
.pd { font-size: 12.5px; line-height: 18px; color: var(--text-2); margin-top: 2px; }
.btn-outline:disabled { opacity: 0.4; cursor: default; }
</style>
