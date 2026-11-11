// Local server: serves the built app, stores the portfolio, proxies + caches market data.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadState, saveState, DATA_DIR } from './store.mjs';
import { getCharts, getQuotes, getProfiles, search, marketStatus } from './market.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5178);
const app = express();
app.use(express.json({ limit: '20mb' }));

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(500).json({ error: String(e?.message || e) }));

app.get('/api/state', wrap(async (_req, res) => res.json(await loadState())));
app.put('/api/state', wrap(async (req, res) => {
  if (!req.body || !Array.isArray(req.body.portfolios)) return res.status(400).json({ error: 'invalid state' });
  await saveState(req.body);
  res.json({ ok: true, savedAt: Date.now() });
}));

app.get('/api/charts', wrap(async (req, res) => res.json(await getCharts(list(req.query.symbols), { force: req.query.force === '1' }))));
app.get('/api/quotes', wrap(async (req, res) => res.json(await getQuotes(list(req.query.symbols), { force: req.query.force === '1' }))));
app.get('/api/profiles', wrap(async (req, res) => res.json(await getProfiles(list(req.query.symbols), { force: req.query.force === '1' }))));
app.get('/api/search', wrap(async (req, res) => {
  try { res.json(await search(String(req.query.q || ''))); } catch { res.json([]); }
}));
app.get('/api/status', (_req, res) => res.json({ ...marketStatus(), dataDir: DATA_DIR, now: Date.now() }));

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Portfolio tracker running at http://localhost:${PORT}`);
});
