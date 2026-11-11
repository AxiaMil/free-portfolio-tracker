// Local JSON storage. Everything lives in ./data so it can be backed up or copied as a folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.PORTFOLIO_DATA_DIR || path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const STATE_FILE = path.join(DATA_DIR, 'portfolio.json');
const SEED_FILE = path.join(ROOT, 'server', 'seed.json');

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

export async function loadState() {
  const state = await readJson(STATE_FILE, null);
  if (state) return state;
  const seed = await readJson(SEED_FILE, { version: 1, portfolios: [] });
  await writeJson(STATE_FILE, seed);
  return seed;
}

let lastBackupAt = 0;
const BACKUP_EVERY_MS = 5 * 60 * 1000;

export async function saveState(state) {
  // keep a rolling backup of the previous version before overwriting (at most one every 5 minutes, last 30 kept)
  if (Date.now() - lastBackupAt >= BACKUP_EVERY_MS) try {
    await fs.mkdir(path.join(DATA_DIR, 'backups'), { recursive: true });
    const prev = await fs.readFile(STATE_FILE, 'utf8');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(path.join(DATA_DIR, 'backups', `portfolio-${stamp}.json`), prev);
    const files = (await fs.readdir(path.join(DATA_DIR, 'backups'))).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) await fs.unlink(path.join(DATA_DIR, 'backups', f));
    lastBackupAt = Date.now();
  } catch { /* first save */ }
  await writeJson(STATE_FILE, state);
}
