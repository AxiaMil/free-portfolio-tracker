// The Muse space's files must pass a Muse runtime's TypeScript check as shipped, so Muse never has to patch them:
// strict mode with noUncheckedIndexedAccess and the rest of a Bun project's defaults (tests/muse-typecheck/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('the Muse files pass a Bun project\'s strict TypeScript settings', () => {
  const tsc = join('node_modules', 'typescript', 'bin', 'tsc');
  const r = spawnSync(process.execPath, [tsc, '-p', join('tests', 'muse-typecheck', 'tsconfig.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});
