import { createRouter, createWebHistory } from 'vue-router';

export const NAV = [
  { title: 'Home', icon: 'mdi-home', to: '/portfolio' },
  { title: 'Performance', icon: 'mdi-chart-areaspline-variant', to: '/performance' },
  { title: 'Allocation', icon: 'mdi-chart-donut', to: '/allocation' },
  { title: 'Dividends', icon: 'mdi-cash', to: '/dividend' },
  { title: 'Risk', icon: 'mdi-shield-half-full', to: '/risk' },
];
export const TOOLS = [
  { title: 'Goal Tracker', icon: 'mdi-flag-checkered', to: '/goal-tracker' },
  { title: 'Trade Analysis', icon: 'mdi-chart-timeline-variant', to: '/trade-analysis' },
  { title: 'Rebalance', icon: 'mdi-scale-balance', to: '/allocation/rebalance' },
];
export const MANAGE = [
  { title: 'Transactions', icon: 'mdi-file-document-multiple', to: '/transactions' },
  { title: 'Custom Assets', icon: 'mdi-card-text', to: '/custom-assets' },
  { title: 'Settings', icon: 'mdi-menu', to: '/menu' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/portfolio' },
    { path: '/portfolio', component: () => import('./pages/HomePage.vue') },
    { path: '/performance', component: () => import('./pages/PerformancePage.vue') },
    { path: '/allocation', component: () => import('./pages/AllocationPage.vue') },
    { path: '/allocation/rebalance', component: () => import('./pages/RebalancePage.vue') },
    { path: '/dividend', component: () => import('./pages/DividendPage.vue') },
    { path: '/risk', component: () => import('./pages/RiskPage.vue') },
    { path: '/goal-tracker', component: () => import('./pages/GoalTrackerPage.vue') },
    { path: '/trade-analysis', component: () => import('./pages/TradeAnalysisPage.vue') },
    { path: '/transactions', component: () => import('./pages/TransactionsPage.vue') },
    { path: '/custom-assets', component: () => import('./pages/CustomAssetsPage.vue') },
    { path: '/menu', component: () => import('./pages/MenuPage.vue') },
    { path: '/menu/:section', component: () => import('./pages/MenuPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/portfolio' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
