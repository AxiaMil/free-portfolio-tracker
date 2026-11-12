<script setup lang="ts">
import { palette, alpha } from '../../theme.ts';
// Price history of one custom asset: step chart (prices carry forward until the next point) + editable table.
import { computed, ref, watch } from 'vue';
import VChart from 'vue-echarts/csp';
import { store, toast } from '../../store.ts';
import type { CustomAsset } from '../../engine/types.ts';
import { AXIS_COLOR, FONT, GRID_COLOR, tooltipBase } from '../../charts.ts';
import { num, pct, signClass } from '../../format.ts';
import { fmtPrice } from '../txn/fmt.ts';
import { normalizePrices, setPrices, upsertPrice } from './options.ts';

const props = defineProps<{ asset: CustomAsset; compact?: boolean }>();

const points = computed(() => normalizePrices(props.asset.prices));
const rows = computed(() => points.value.map(([d, p], i) => ({ date: d, price: p, chg: i > 0 && points.value[i - 1][1] ? p / points.value[i - 1][1] - 1 : null })).reverse());

const newDate = ref(store.today);
const newPrice = ref('');
const editDate = ref<string | null>(null);
const editForm = ref({ date: '', price: '' });
watch(() => props.asset.symbol, () => { editDate.value = null; newPrice.value = ''; newDate.value = store.today; });

function add() {
  const p = Number(newPrice.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate.value)) { toast('Enter a valid date', 'error'); return; }
  if (!(p > 0)) { toast('Enter a price greater than 0', 'error'); return; }
  const existed = props.asset.prices.some(([d]) => d === newDate.value);
  upsertPrice(props.asset, newDate.value, p);
  toast(existed ? `Price on ${newDate.value} replaced` : `Price added for ${newDate.value}`);
  newPrice.value = '';
}

function startEdit(d: string, p: number) {
  editDate.value = d;
  editForm.value = { date: d, price: String(p) };
}
function saveEdit() {
  const d = editForm.value.date;
  const p = Number(editForm.value.price);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(p > 0)) { toast('Enter a valid date and a price greater than 0', 'error'); return; }
  setPrices(props.asset, [...props.asset.prices.filter(([x]) => x !== editDate.value), [d, p]]);
  editDate.value = null;
  toast('Price updated');
}
function remove(d: string) {
  if (props.asset.prices.length <= 1) { toast('An asset needs at least one price. Edit it instead, or delete the asset.', 'error'); return; }
  setPrices(props.asset, props.asset.prices.filter(([x]) => x !== d));
  toast(`Price on ${d} deleted`);
}

const option = computed(() => {
  const pts = points.value;
  const data = pts.map(([d, p]) => [d, p]);
  const last = pts[pts.length - 1];
  if (last && last[0] < store.today) data.push([store.today, last[1]]);
  return {
    animation: false,
    grid: { left: 8, right: 12, top: 14, bottom: 24, containLabel: true },
    tooltip: { ...tooltipBase, trigger: 'axis', valueFormatter: (v: number) => fmtPrice(v) },
    xAxis: { type: 'time', axisLine: { lineStyle: { color: GRID_COLOR } }, axisTick: { show: false }, axisLabel: { color: AXIS_COLOR, fontFamily: FONT, fontSize: 11, hideOverlap: true }, splitLine: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: AXIS_COLOR, fontFamily: FONT, fontSize: 11, formatter: (v: number) => (Math.abs(v) >= 1000 ? num(v, 0) : fmtPrice(v)) }, splitLine: { lineStyle: { color: GRID_COLOR } } },
    series: [{
      type: 'line', name: props.asset.symbol, step: 'end', data, showSymbol: true, symbolSize: (_v: unknown, p: { dataIndex: number }) => (p.dataIndex < pts.length ? 6 : 0),
      lineStyle: { color: palette.portfolio, width: 2 }, itemStyle: { color: palette.portfolio }, areaStyle: { color: palette.portfolioFill },
    }],
  };
});
</script>

<template>
  <div class="ph" :class="{ compact }">
    <div class="chart-wrap"><VChart :option="option" autoresize class="chart" /></div>
    <div class="tbl">
      <div class="add">
        <v-text-field v-model="newDate" type="date" label="Date" density="compact" hide-details class="f-date" />
        <v-text-field v-model="newPrice" type="number" min="0" :label="`Price (${asset.currency})`" density="compact" hide-details class="f-price" @keydown.enter="add" />
        <button class="add-btn" data-test="add-price" @click="add"><v-icon size="18">mdi-plus</v-icon>Add</button>
      </div>
      <div class="scroll">
        <table class="p-table">
          <thead><tr><th>Date</th><th>Price ({{ asset.currency }})</th><th>Change</th><th /></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.date">
              <template v-if="editDate === r.date">
                <td><input v-model="editForm.date" type="date" class="inl" aria-label="Date" /></td>
                <td><input v-model="editForm.price" type="number" min="0" class="inl" aria-label="Price" @keydown.enter="saveEdit" /></td>
                <td />
                <td class="acts">
                  <button class="ico ok" aria-label="Save price" @click="saveEdit"><v-icon size="19">mdi-check</v-icon></button>
                  <button class="ico" aria-label="Cancel" @click="editDate = null"><v-icon size="19">mdi-close</v-icon></button>
                </td>
              </template>
              <template v-else>
                <td>{{ r.date }}</td>
                <td>{{ fmtPrice(r.price) }}</td>
                <td :class="signClass(r.chg)">{{ r.chg == null ? '-' : pct(r.chg) }}</td>
                <td class="acts">
                  <button class="ico" :aria-label="`Edit price on ${r.date}`" @click="startEdit(r.date, r.price)"><v-icon size="19">mdi-pencil</v-icon></button>
                  <button class="ico" :aria-label="`Delete price on ${r.date}`" @click="remove(r.date)"><v-icon size="19">mdi-delete</v-icon></button>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="foot muted">{{ rows.length }} price point{{ rows.length === 1 ? '' : 's' }} · between points the last price is used</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ph { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; }
.ph.compact { grid-template-columns: 1fr; }
.chart-wrap { min-height: 240px; }
.compact .chart-wrap { min-height: 0; }
.chart { height: 260px; width: 100%; }
.compact .chart { height: 200px; }
.add { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.f-date { flex: 1 1 150px; }
.f-price { flex: 1 1 120px; }
.add-btn { display: inline-flex; align-items: center; gap: 2px; height: 40px; padding: 0 14px 0 10px; border: 0; border-radius: 8px; background: var(--primary); color: var(--primary-fg); font: 600 13px/1 var(--font); letter-spacing: 0.8px; cursor: pointer; white-space: nowrap; }
.scroll { max-height: 236px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; }
.p-table th, .p-table td { height: 36px; }
.p-table thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; }
.acts { width: 76px; text-align: right; padding-right: 6px !important; }
.ico { background: none; border: 0; padding: 3px; cursor: pointer; color: var(--text-2); display: inline-flex; border-radius: 6px; &:hover { background: var(--line-soft); color: var(--text); } &.ok { color: var(--pos); } }
.inl { width: 100%; max-width: 140px; height: 28px; padding: 0 6px; border: 1px solid var(--border-strong); border-radius: 6px; background: var(--surface); color: var(--text); font: 13.5px var(--font); color-scheme: dark; }
.foot { font-size: 12px; margin-top: 8px; }
@media (max-width: 959px) { .ph { grid-template-columns: 1fr; } }
</style>
