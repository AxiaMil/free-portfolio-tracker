<script setup lang="ts">
// Performance: headline header, period returns vs benchmarks, and calendar (monthly / quarterly / yearly) returns.
import PortfolioHeader from '../components/PortfolioHeader.vue';
import ReturnTable from '../components/perf/ReturnTable.vue';
import HistoricalReturn from '../components/perf/HistoricalReturn.vue';
</script>

<template>
  <div class="page perf">
    <PortfolioHeader />
    <ReturnTable class="sec-returns" />
    <HistoricalReturn class="sec-hist" />
  </div>
</template>

<style scoped lang="scss">
.sec-returns { margin-top: 44px; }
.sec-hist { margin-top: 56px; }
@media (max-width: 959px) {
  .sec-returns { margin-top: 44px; }
  .sec-hist { margin-top: 40px; }
}
</style>
