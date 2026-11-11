import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

// In development the UI runs on Vite and forwards /api to the local server (API_PORT, default 5178).
const apiPort = process.env.API_PORT || '5178';

export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  build: { chunkSizeWarningLimit: 4000 },
});
