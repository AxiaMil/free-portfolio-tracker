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

// Phone fixes that must survive every rebuild (see src/styles/app.scss and src/components/BenchmarkCards.vue).
// Reachability checks, such as the one Meta Muse runs, report the inputs Vuetify hides as unreachable controls, and
// content that scrolls sideways on a phone is easy to miss.
test('the one-file app keeps Vuetify\'s hidden inputs visible and reachable, and phones free of sideways scrolling', () => {
  const code = readFileSync(new URL('portfolio-tracker.js', app), 'utf8');
  const rule = (selector: RegExp) => new RegExp(`${selector.source}[^{}]*\\{([^}]*)\\}`).exec(code)?.[1] ?? '';
  assert.match(rule(/html \.v-select \.v-field \.v-field__input>input/), /pointer-events:auto/, 'a press reaches a select\'s input');
  for (const field of [/html \.v-select--selected \.v-field \.v-field__input>input,/, /html \.v-combobox--single:not\(\.v-combobox--selection-slot\) \.v-field--dirty:not\(\.v-field--focused\) input,/]) {
    assert.match(rule(field), /opacity:1;color:transparent/, `visible, its duplicate text unpainted: ${field.source}`);
  }
  assert.match(rule(/html \.v-selection-control__input input/), /opacity:1;.*appearance:none.*outline:none/, 'switch and checkbox inputs: visible, nothing painted');
  assert.match(code, /@media ?\(max-width: ?599px\) ?\{\.strip\[data-v-\w+\]\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);overflow-x:visible\}/, 'Benchmarks: two cards per row on phones');
  assert.match(code, /@media ?\(max-width: ?599px\) ?\{\.pill-group\{flex-wrap:wrap;overflow-x:visible/, 'option rows wrap on phones');
});
