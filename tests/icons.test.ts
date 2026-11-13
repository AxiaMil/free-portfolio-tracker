// Every `mdi-*` icon name the app uses must be drawn by src/plugins/icons.ts; an unmapped one shows as a blank space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(vue|ts)$/.test(n) ? [p] : [];
  });
}

test('every icon the app names is mapped', () => {
  const map = readFileSync('src/plugins/icons.ts', 'utf8');
  const used = new Set(files('src').filter((f) => !f.endsWith('icons.ts')).flatMap((f) => readFileSync(f, 'utf8').match(/mdi-[a-z0-9-]+[a-z0-9]/g) ?? []));
  const missing = [...used].filter((name) => !map.includes(`'${name}'`)).sort();
  assert.deepEqual(missing, []);
});
