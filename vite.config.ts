import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPayouts, type PayoutAsk } from './muse/server/src/payouts.ts';

// The app builds to plain static files (dist/) with relative paths, so any static host can serve it.
// Browsers can't call Yahoo Finance directly (it sends no CORS headers), so `npm run dev` and `npm start`
// forward ./yahoo/q1/* and ./yahoo/q2/* to Yahoo. Other hosts provide a route of their own (docs/HOSTING.md).
const yahoo = (target: string, prefix: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.slice(prefix.length),
  configure: (proxy) => {
    // send nothing about the page that asked: no cookies, origin or referrer, and not the browser's own name.
    // Yahoo answers 429 to a full browser User-Agent arriving without its cookies, so ask as the Muse server does.
    proxy.on('proxyReq', (req) => {
      for (const h of ['cookie', 'origin', 'referer']) req.removeHeader(h);
      req.setHeader('user-agent', 'Mozilla/5.0 (portfolio-tracker)');
    });
  },
});
const proxy = {
  '/yahoo/q1': yahoo('https://query1.finance.yahoo.com', '/yahoo/q1'),
  '/yahoo/q2': yahoo('https://query2.finance.yahoo.com', '/yahoo/q2'),
};
const port = Number(process.env.PORT) || 5178;

/**
 * Dividend payment dates for `npm run dev` and `npm start`: GET ./payouts?asks=[{symbol,exchange},...] runs the same
 * keyless connectors a Muse space does (muse/server/src/payouts.ts) and answers { ok, payouts }. An answer is kept
 * for an hour, so opening the app again doesn't ask the exchanges again.
 */
function payoutRoute(): Plugin {
  const memo = new Map<string, { at: number; row: unknown }>();
  const HOUR = 3600_000;
  const handler = async (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b: string): void }) => {
    try {
      const u = new URL(req.url ?? '', 'http://local');
      const force = u.searchParams.get('force') === '1';
      const asks = (JSON.parse(u.searchParams.get('asks') ?? '[]') as PayoutAsk[])
        .filter((a) => typeof a?.symbol === 'string' && a.symbol.length <= 30).slice(0, 60);
      const payouts: Record<string, unknown> = {};
      for (let i = 0; i < asks.length; i += 3) {
        await Promise.all(asks.slice(i, i + 3).map(async (a) => {
          const hit = memo.get(a.symbol);
          if (hit && Date.now() - hit.at < (force ? 60_000 : HOUR)) { payouts[a.symbol] = hit.row; return; }
          const r = await fetchPayouts({ symbol: a.symbol.toUpperCase(), exchange: a.exchange ?? null, currency: a.currency ?? null, name: a.name ?? null });
          const row = { records: r.records, source: r.source, checkedAt: Date.now(), ...(r.error ? { error: r.error } : {}) };
          memo.set(a.symbol, { at: Date.now(), row });
          payouts[a.symbol] = row;
        }));
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, payouts }));
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }));
    }
  };
  return {
    name: 'portfolio-payouts',
    configureServer(server) { server.middlewares.use('/payouts', (req, res) => void handler(req, res)); },
    configurePreviewServer(server) { server.middlewares.use('/payouts', (req, res) => void handler(req, res)); },
  };
}

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

/** `new Function(…)`, `Function("…")` or `eval(…)`; tests/build-output.test.ts checks the built files the same way */
const CODE_FROM_STRING = /\bnew\s+Function\s*\(|(?<![\w$.])Function\s*\(\s*["'`]|(?<![\w$.])eval\s*\(/;

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
        js.code = `/*! Portfolio Tracker, one-file build. MIT licence. https://github.com/AxiaMil/free-portfolio-tracker */\n${style}${js.code}`;
        // Meta Muse refuses to publish a script that builds code from a string, so the file Muse copies must have none
        const evalLike = js.code.match(CODE_FROM_STRING);
        if (evalLike) this.error(`one-file build contains code built from a string (${evalLike[0]}), which Meta Muse refuses`);
        this.emitFile({ type: 'asset', fileName: 'portfolio-tracker.html', source: SINGLE_HTML });
      },
    },
    // muse/manifest.json gives Muse the app file's exact size and hash, to check its copy against
    writeBundle(options) {
      const file = readFileSync(join(options.dir ?? 'app', SINGLE_JS));
      const manifestPath = fileURLToPath(new URL('./muse/manifest.json', import.meta.url));
      const before = readFileSync(manifestPath, 'utf8');
      const sha256 = createHash('sha256').update(file).digest('hex');
      const after = before
        .replace(/("bytes":\s*)\d+/, `$1${file.length}`)
        .replace(/("sha256":\s*)"[0-9a-f]*"/, `$1"${sha256}"`);
      if (!after.includes(`"bytes": ${file.length}`) || !after.includes(`"sha256": "${sha256}"`)) this.error('muse/manifest.json: app.bytes or app.sha256 not found');
      if (after !== before) writeFileSync(manifestPath, after);
    },
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode single` (part of `npm run build:app`) writes app/portfolio-tracker.js next to the regular build
  const single = mode === 'single';
  return {
    base: './',
    plugins: [vue(), vuetify({ autoImport: true }), payoutRoute(), single && oneFile()],
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
