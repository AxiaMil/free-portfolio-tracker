// The README's two Muse prompts (new space, and update or repair) never change from version to version: they only
// send Muse to muse/manifest.json on the main branch. The manifest holds everything that does change: which files
// to copy and where, the storage, actions, network access and job, the app file's exact size and hash, and the
// checks. These tests keep that arrangement true:
// - the prompts stay generic: no file, table, action or host names, and every manifest key they quote exists;
// - the manifest stays true to the repository: every file it lists exists and every file of the space is listed,
//   its actions, tables, network access and job match the code, and its size and hash are the committed app file's
//   (`npm run build:app` writes them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { ALLOWED_PREFIXES } from '../muse/server/src/market.ts';
import { PAYOUT_HOSTS } from '../muse/server/src/payouts.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('muse/manifest.json'));
/** a manifest value by its dotted path, such as "howToUse.newSpace" */
const at = (path: string): unknown => path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), manifest);

// ---------------------------------------------------------------- the README prompts

const readme = read('README.md');
const start = readme.indexOf('## Get it in Meta Muse');
const section = readme.slice(start, readme.indexOf('\n## ', start + 1));
const prompts = [...section.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1]);
const promptFor = (steps: string) => prompts.find((p) => p.includes(`"howToUse.${steps}"`)) ?? '';

test('the README has one prompt for a new space and one to update or repair any existing space', () => {
  assert.equal(prompts.length, 2, 'two ```text prompts under "Get it in Meta Muse"');
  assert.ok(promptFor('newSpace'), 'a prompt that follows howToUse.newSpace');
  assert.ok(promptFor('existingSpace'), 'a prompt that follows howToUse.existingSpace');
});

test('the prompts send Muse to the manifest on the main branch of this repository', () => {
  for (const p of prompts) {
    assert.deepEqual([...new Set(p.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/g))], [manifest.repository]);
    assert.ok(p.includes('muse/manifest.json'), p);
    assert.ok(p.includes(`${manifest.branch} branch`), p);
  }
});

test('every manifest key a prompt quotes exists', () => {
  for (const p of prompts) {
    const quoted = [...p.matchAll(/"([\w.]+)"/g)].map((m) => m[1]);
    assert.ok(quoted.length >= 2, p);
    for (const key of quoted) assert.notEqual(at(key), undefined, `"${key}" is not in muse/manifest.json`);
  }
});

test('the prompts name nothing that can change between versions', () => {
  const changing = [
    ...Object.keys(manifest.files), ...Object.values<string>(manifest.files), manifest.app.source, manifest.app.copyTo,
    basename(manifest.app.source), ...Object.keys(manifest.actions), ...Object.keys(manifest.storage.tables),
    ...manifest.network, ...manifest.cron.map((c: { id: string }) => c.id),
  ];
  for (const p of prompts) {
    const files = (p.match(/[\w./-]+\.(?:ts|js|mjs|json|html|css|md)\b/g) ?? []).filter((f) => f !== 'muse/manifest.json');
    assert.deepEqual(files, [], 'the only file a prompt names is muse/manifest.json');
    for (const name of changing) assert.ok(!p.includes(name), `a prompt names "${name}": leave it to the manifest`);
  }
});

// ---------------------------------------------------------------- the manifest

test('the manifest names this repository and its main branch', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(manifest.repository, pkg.repository.url.replace(/\.git$/, ''));
  assert.equal(manifest.branch, 'main');
  assert.ok(read(manifest.app.source).split('\n', 1)[0].includes(manifest.repository), 'the app file\'s header names it too');
});

test('it gives the committed app file\'s exact size and SHA-256', () => {
  const file = readFileSync(new URL(manifest.app.source, root));
  assert.equal(manifest.app.bytes, file.length, 'run npm run build:app, which writes app.bytes');
  assert.equal(manifest.app.sha256, createHash('sha256').update(file).digest('hex'), 'run npm run build:app, which writes app.sha256');
});

test('every file it lists exists, and every file of the space is listed', () => {
  for (const from of Object.keys(manifest.files)) assert.ok(existsSync(new URL(from, root)), from);
  // the space's own files (its dividend-date connector) come from a template and are never replaced
  const templates = Object.values<{ template: string }>(manifest.spaceOwnFiles ?? {}).map((o) => o.template);
  for (const t of templates) assert.ok(existsSync(new URL(t, root)), t);
  const own = new Set(['muse/README.md', 'muse/manifest.json']);
  const inMuse = readdirSync(new URL('muse/', root), { recursive: true })
    .map((f) => `muse/${String(f).replaceAll('\\', '/')}`)
    .filter((f) => statSync(new URL(f, root)).isFile() && !own.has(f));
  assert.deepEqual(inMuse.filter((f) => !(f in manifest.files) && !templates.includes(f)), [], 'files of the space the manifest doesn\'t list');
  // the space's entry script imports the app under the name it is copied to
  assert.match(read('muse/client/src/main.ts'), new RegExp(`import '\\./${basename(manifest.app.copyTo).replace('.', '\\.')}'`));
});

test('its actions, network access, tables and job match the code', () => {
  const exported = [...read('muse/server/src/actions.ts').matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  assert.deepEqual(Object.keys(manifest.actions).sort(), exported.sort());
  assert.deepEqual(manifest.actions.yahooGet.allow, ALLOWED_PREFIXES);
  // Yahoo for prices, and the hosts of the built-in dividend-date connectors
  assert.deepEqual(manifest.network, [...ALLOWED_PREFIXES.map((u) => new URL(u).hostname), ...PAYOUT_HOSTS]);

  const tables = Object.fromEntries([...read('muse/server/src/schema.ts').matchAll(/sqliteTable\('(\w+)', \{([\s\S]*?)\n\}\)/g)]
    .map(([, name, body]) => [name, [...body.matchAll(/(?:text|integer)\('(\w+)'\)/g)].map((m) => m[1])]));
  assert.deepEqual(Object.fromEntries(Object.entries<object>(manifest.storage.tables).map(([t, cols]) => [t, Object.keys(cols)])), tables);

  const jobs = JSON.parse(read('muse/space.json')).managedCronJobs;
  assert.deepEqual(manifest.cron, jobs.map((j: any) => ({ id: j.id, action: j.action, every: j.schedule.every })));
  for (const job of manifest.cron) assert.ok(job.action in manifest.actions, job.action);
});

test('its steps cover a new space and any existing one, and every key they name exists', () => {
  for (const kind of ['newSpace', 'existingSpace']) {
    const steps = manifest.howToUse[kind];
    assert.ok(Array.isArray(steps) && steps.length >= 5, kind);
    for (const step of steps) {
      for (const [key] of step.matchAll(/\b(?:app|starterParts|storage|checks|howToUse|payouts)\.[A-Za-z]\w*(?:\.[A-Za-z]\w*)*/g)) {
        assert.notEqual(at(key), undefined, `${kind} names ${key}, which isn't in the manifest`);
      }
    }
    assert.ok(Array.isArray(manifest.checks[kind]) && manifest.checks[kind].length, `checks.${kind}`);
  }
  for (const key of ['files', 'actions', 'network', 'cron', 'time', 'checks.always']) assert.notEqual(at(key), undefined, key);
  assert.ok('refreshMarketCache' in manifest.actions, 'the steps run refreshMarketCache');
  assert.match(manifest.howToUse.existingSpace.join(' '), /Keep the saved data/);
});

test('dividend payment dates: the space\'s own connector is kept, and Muse is told how to write it', () => {
  const own = manifest.spaceOwnFiles?.['server/src/custom-payouts.ts'];
  assert.equal(own?.template, 'muse/server/src/custom-payouts.ts');
  assert.match(own.rule, /never replace/);
  assert.ok(!Object.values(manifest.files).includes('server/src/custom-payouts.ts'), 'an update must not overwrite it');
  for (const kind of ['newSpace', 'existingSpace']) assert.match(manifest.howToUse[kind].join(' '), /payouts\.forMuse/, kind);
  assert.match(manifest.howToUse.existingSpace.join(' '), /spaceOwnFiles/);
  assert.ok(Array.isArray(manifest.payouts.forMuse) && manifest.payouts.forMuse.length >= 4);
  assert.match(manifest.payouts.forMuse.join(' '), /CUSTOM_HOSTS/);
  assert.match(manifest.payouts.forMuse.join(' '), /never estimate/);
  // nothing for the user to set up
  assert.ok(manifest.notNeeded.includes('API keys or cookies'));
  assert.doesNotMatch(read('muse/server/src/payouts.ts'), /apikey|api_key|token=/i);
  assert.match(read('muse/server/src/actions.ts'), /from '\.\/custom-payouts'/);
});
