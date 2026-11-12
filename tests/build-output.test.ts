// The prebuilt app in app/ is what Meta Muse copies. Muse won't publish a space whose script builds code from a
// string (`new Function(…)`, `Function("…")`, `eval(…)`), so the committed build must contain none.
// vite.config.ts makes the one-file build fail on the same pattern; this checks the files actually committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const CODE_FROM_STRING = /\bnew\s+Function\s*\(|(?<![\w$.])Function\s*\(\s*["'`]|(?<![\w$.])eval\s*\(/;
const app = new URL('../app/', import.meta.url);

test('the pattern finds code built from a string, and nothing else', () => {
  for (const bad of ['new Function("tag","x")', 'const f=Function("return 1")', ';eval(code)', 'new  Function (a)']) assert.match(bad, CODE_FROM_STRING, bad);
  for (const ok of ['isFunction(x)', 'typeof x=="function"', 'a.eval(x)', 'retrieval(x)', 'Function.prototype.call', 'medieval(x)']) assert.doesNotMatch(ok, CODE_FROM_STRING, ok);
});

test('the one-file app Muse copies builds no code from strings', () => {
  const code = readFileSync(new URL('portfolio-tracker.js', app), 'utf8');
  assert.ok(code.length > 1_000_000, 'app/portfolio-tracker.js is the full build');
  assert.equal(code.match(CODE_FROM_STRING)?.[0], undefined);
});

test('the multi-file app in app/assets builds no code from strings either', () => {
  const files = readdirSync(new URL('assets/', app)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 5);
  for (const f of files) assert.equal(readFileSync(new URL(`assets/${f}`, app), 'utf8').match(CODE_FROM_STRING)?.[0], undefined, f);
});
