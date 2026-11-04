// Runs each app's selfCheck() on its BUILT dist from build-all.mjs: proves the RunTypes transform
// survives each bundler's tree-shaking and minification.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..', 'apps');

// build-vite runs all 12 families; each light smoke runs the lean subset.
const HEAVY = 'build-vite';
const SMOKES = ['smoke-esbuild', 'smoke-rollup', 'smoke-rolldown', 'smoke-webpack', 'smoke-rspack', 'smoke-source', 'smoke-types-in-src', 'smoke-bun'];

async function loadEntry(app) {
  const dist = path.join(APPS, app, 'dist/entry.js');
  assert.ok(existsSync(dist), `${app}: dist/entry.js is missing — did build-all.mjs run for it?`);
  return import(pathToFileURL(dist).href);
}

test('build-vite: full feature matrix passes after the Vite-on-Rolldown build', async () => {
  const mod = await loadEntry(HEAVY);
  assert.equal(typeof mod.selfCheck, 'function', 'build-vite dist must export selfCheck');
  const report = mod.selfCheck();
  const detail = report.failures.map((failure) => `[${failure.family}] ${failure.name}${failure.detail ? ` — ${failure.detail}` : ''}`).join('\n');
  assert.ok(report.ok, `build-vite selfCheck failed (${report.passed}/${report.total}):\n${detail}`);
  assert.equal(report.families, 12, 'build-vite must exercise all 12 feature families');
  assert.ok(report.total >= 50, `expected a substantial matrix, got ${report.total} checks`);
});

for (const app of SMOKES) {
  test(`${app}: minimal subset passes after the build`, async () => {
    const mod = await loadEntry(app);
    assert.equal(typeof mod.selfCheck, 'function', `${app} dist must export selfCheck`);
    const {ok, results} = mod.selfCheck();
    const detail = results.filter((result) => !result.ok).map((result) => `${result.name}${result.detail ? ` — ${result.detail}` : ''}`).join('\n');
    assert.ok(ok, `${app} selfCheck failed:\n${detail}`);
    assert.ok(results.length >= 5, `${app}: expected the lean subset, got ${results.length} checks`);
  });
}

// smoke-next has no dist/entry.js either: Next owns its output layout, and the
// shared subset runs during the STATIC PRERENDER rather than at import time. So
// the assertion reads the prerendered HTML, which is the artifact proving the
// transform survived Turbopack and the rewritten code actually executed.
//
// This is the only lane where RunTypes reaches the bundler without a plugin at
// all — Turbopack has none — so it is the one that would break first if the
// broker or the loader regressed.
for (const app of ['smoke-next', 'smoke-next-ts']) {
  test(`${app}: the shared subset passes after the Turbopack build`, () => {
    const html = path.join(APPS, app, '.next/server/app/index.html');
    assert.ok(existsSync(html), `${app}: prerendered index.html is missing — did build-all.mjs run for it?`);
    const rendered = readFileSync(html, 'utf8');
    const results = JSON.parse(decodeEntities(rendered.match(/id="rt-results">(.*?)<\/div>/s)?.[1] ?? '[]'));
    const detail = results
      .filter((result) => !result.ok)
      .map((result) => `${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
      .join('\n');
    assert.ok(results.length >= 5, `${app}: expected the lean subset, got ${results.length} checks`);
    assert.ok(
      results.every((result) => result.ok),
      `${app} selfCheck failed:\n${detail}`
    );
  });
}

// Next rejects a directive that is not the first statement, so these ids render only if the imports land below it.
test('smoke-next: "use client" and "use server" call sites keep their directive first', () => {
  const rendered = readFileSync(path.join(APPS, 'smoke-next', '.next/server/app/index.html'), 'utf8');
  for (const probe of ['rt-use-client', 'rt-use-server']) {
    assert.match(rendered, new RegExp(`id="${probe}">\\w+`), `smoke-next: no ${probe} id in the prerendered HTML`);
  }
});

// emitMode 'ts' writes typed .ts cache modules and no .js twins, so the passing page above ran the typed ones.
test('smoke-next-ts: the cache holds typed .ts modules only', () => {
  const types = path.join(APPS, 'smoke-next-ts', '.rt/types');
  const names = readdirSync(types, {recursive: true}).map(String);
  assert.ok(names.some((name) => name.endsWith('.ts')), `smoke-next-ts: no .ts module under ${types}`);
  assert.deepEqual(names.filter((name) => name.endsWith('.js')), [], 'smoke-next-ts: emitMode ts wrote .js modules');
});

// The genDir comes from the app's tsconfig, so Next reads the same folder the enrich CLI writes.
test('smoke-next: generates into the tsconfig genDir', () => {
  const stamp = path.join(APPS, 'smoke-next', '.rt/types/.rt-stamp');
  assert.ok(existsSync(stamp), `smoke-next: no stamp at ${stamp}, the tsconfig genDir was not honoured`);
  assert.ok(!existsSync(path.join(APPS, 'smoke-next', '.mion')), 'smoke-next: generated into .mion instead of the tsconfig genDir');
});

// React escapes the JSON it renders into the page; undo just enough to parse it.
function decodeEntities(text) {
  return text
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

// smoke-bun-preload has no dist to import: it runs the shared subset through
// Bun's RUNTIME plugin host, where transformation happens per import with no
// bundle step. So the assertion re-runs it and reads the report it prints.
//
// This is the strongest lane in the matrix. The others prove a rewrite survived
// a bundler; this one proves a Bun project is wired, compiled AND executing —
// and it registers the plugin WITHOUT awaiting Bun.plugin(), which is the shape
// that silently loses injections if the adapter's readiness gate regresses.
test('smoke-bun-preload: the shared subset passes under Bun\'s runtime loader', () => {
  const appDir = path.join(APPS, 'smoke-bun-preload');
  const run = spawnSync('bun', ['--preload', './rt-preload.ts', 'src/run.ts'], {
    cwd: appDir,
    encoding: 'utf8',
    env: process.env,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  assert.equal(run.status, 0, `bun exited ${run.status}:\n${output}`);
  const line = output.split('\n').find((l) => l.startsWith('MION_PRELOAD_REPORT '));
  assert.ok(line, `no report line in bun output:\n${output}`);
  const report = JSON.parse(line.slice('MION_PRELOAD_REPORT '.length));
  const detail = report.results
    .filter((result) => !result.ok)
    .map((result) => result.name)
    .join('\n');
  assert.ok(report.ok, `smoke-bun-preload selfCheck failed:\n${detail}`);
  assert.ok(report.results.length >= 5, `expected the lean subset, got ${report.results.length} checks`);
});
