import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
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

const SINGLE_JS = 'portfolio-tracker.js';
const SINGLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0F1011" />
    <link rel="icon" type="image/svg+xml" href="./logo.svg" />
    <title>Portfolio: Performance and Dividend Tracker</title>
  </head>
  <body>
    <div id="app"><p style="margin:40vh 0 0;text-align:center;font:14px system-ui,sans-serif;color:#8a8a8a">Loading…</p></div>
    <!-- optional host bridge (storage + server-side fetch): define window.portfolioHost before the app. See docs/HOSTING.md -->
    <script src="./host.js"></script>
    <!-- the whole app in one file: code, styles and fonts -->
    <script src="./${SINGLE_JS}"></script>
  </body>
</html>
`;

/**
 * One-file build: puts the stylesheet (fonts already inlined as data URLs) inside the script, which adds it to the
 * page before the app starts, and writes a small page that loads it. Nothing is left to fetch or unpack.
 */
function oneFile(): Plugin {
  return {
    name: 'portfolio-one-file',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const css: string[] = [];
        for (const [name, file] of Object.entries(bundle)) {
          if (file.type === 'asset' && name.endsWith('.css')) {
            css.push(String(file.source));
            delete bundle[name];
          }
        }
        const others = Object.values(bundle).filter((f) => f.fileName !== SINGLE_JS);
        if (others.length) this.error(`one-file build produced extra files: ${others.map((f) => f.fileName).join(', ')}`);
        const js = bundle[SINGLE_JS];
        if (!js || js.type !== 'chunk') this.error(`one-file build: ${SINGLE_JS} missing`);
        const style = `(function(){var s=document.createElement("style");s.setAttribute("data-app","portfolio-tracker");s.textContent=${JSON.stringify(css.join('\n'))};(document.head||document.documentElement).appendChild(s)})();\n`;
        js.code = `/*! Portfolio Tracker, one-file build. MIT licence. https://github.com/AxiaMil/portfolio-tracker */\n${style}${js.code}`;
        this.emitFile({ type: 'asset', fileName: 'portfolio-tracker.html', source: SINGLE_HTML });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode single` (part of `npm run build:app`) writes app/portfolio-tracker.js next to the regular build
  const single = mode === 'single';
  return {
    base: './',
    plugins: [vue(), vuetify({ autoImport: true }), single && oneFile()],
    server: { port, strictPort: true, proxy },
    preview: { port, strictPort: true, proxy },
    define: single ? { 'process.env.NODE_ENV': JSON.stringify('production') } : undefined,
    build: single
      ? {
        outDir: 'app',
        emptyOutDir: false,
        copyPublicDir: false,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 4000,
        // library mode inlines every asset (the fonts) and leaves out the module preload helper
        lib: { entry: 'src/single.ts', name: 'PortfolioTracker', formats: ['iife'], fileName: () => SINGLE_JS },
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
      : {
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
          output: {
            // three vendor files that download in parallel and stay cached across app updates
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return undefined;
              if (/[\\/](echarts|zrender|vue-echarts)[\\/]/.test(id)) return 'charts';
              if (/[\\/](vuetify|lucide-vue-next)[\\/]/.test(id)) return 'ui';
              return 'vendor';
            },
          },
        },
      },
  };
});
