import { defineConfig, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

// The app builds to plain static files (dist/) with relative paths, so any static host can serve it.
// Browsers can't call Yahoo Finance directly (it sends no CORS headers), so `npm run dev` and `npm start`
// forward ./yahoo/q1/* and ./yahoo/q2/* to Yahoo. Other hosts provide a route of their own (docs/HOSTING.md).
const yahoo = (target: string, prefix: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.slice(prefix.length),
  configure: (proxy) => {
    // send nothing about the page that asked: no cookies, origin or referrer
    proxy.on('proxyReq', (req) => { for (const h of ['cookie', 'origin', 'referer']) req.removeHeader(h); });
  },
});
const proxy = {
  '/yahoo/q1': yahoo('https://query1.finance.yahoo.com', '/yahoo/q1'),
  '/yahoo/q2': yahoo('https://query2.finance.yahoo.com', '/yahoo/q2'),
};
const port = Number(process.env.PORT) || 5178;

export default defineConfig({
  base: './',
  plugins: [vue(), vuetify({ autoImport: true })],
  server: { port, strictPort: true, proxy },
  preview: { port, strictPort: true, proxy },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // three vendor files that download in parallel and stay cached across app updates
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](echarts|zrender|vue-echarts)[\\/]/.test(id)) return 'charts';
          if (/[\\/](vuetify|lucide-vue-next)[\\/]/.test(id)) return 'ui';
          return 'vendor';
        },
      },
    },
  },
});
