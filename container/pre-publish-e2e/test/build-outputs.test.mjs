// Runtime-behavior assertions over the BUILT artifacts. Loads each app's dist
// (produced by build-all.mjs — each bundler transformed the shared source through
// its RunTypes plugin) and runs the app's selfCheck(). Proves the transform is
// correct AFTER that bundler mangled it (ESM/CJS, tree-shaking, minification).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..', 'apps');

// build-vite runs the full matrix (13 families); each light smoke runs the lean
// minimal subset.
const HEAVY = 'build-vite';
const SMOKES = ['smoke-esbuild', 'smoke-rollup', 'smoke-rolldown', 'smoke-webpack', 'smoke-rspack', 'smoke-source', 'smoke-bun'];

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
  assert.equal(report.families, 13, 'build-vite must exercise all 13 feature families');
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
test('smoke-next: the shared subset passes after the Turbopack build', () => {
  const html = path.join(APPS, 'smoke-next', '.next/server/app/index.html');
  assert.ok(existsSync(html), 'smoke-next: prerendered index.html is missing — did build-all.mjs run for it?');
  const rendered = readFileSync(html, 'utf8');
  const results = JSON.parse(decodeEntities(rendered.match(/id="rt-results">(.*?)<\/div>/s)?.[1] ?? '[]'));
  const detail = results
    .filter((result) => !result.ok)
    .map((result) => `${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
    .join('\n');
  assert.ok(results.length >= 5, `smoke-next: expected the lean subset, got ${results.length} checks`);
  assert.ok(
    results.every((result) => result.ok),
    `smoke-next selfCheck failed:\n${detail}`
  );
});

// mion-next is the framework half of the Next story: the app HOSTS the mion API through an App
// Router catch-all handler. build-all.mjs builds it, serves it with `next start` and fetches the
// app's own /selftest route, which does the calling; this reads what that reported.
//
// A batch is the assertion that matters. Its id is baked into the server by the same build that
// gave the client's call site that id, so a batch that answers proves client and API really did
// come out of ONE program — which is the whole reason the API lives in the app.
test('mion-next: the app serves its own mion API, on both wires and in a batch', () => {
  const report = path.join(APPS, 'mion-next', 'selftest.json');
  assert.ok(existsSync(report), 'mion-next: selftest.json is missing — did build-all.mjs run for it?');
  const {json, compact, batch} = JSON.parse(readFileSync(report, 'utf8'));

  // JSON wire: the Date came back as a Date, which only the compiled serializer can do.
  assert.equal(json.error, '', `mion-next JSON round trip failed: ${json.error}`);
  assert.equal(json.message, 'Hello mion!');
  assert.equal(json.atIsDate, true, 'mion-next: the Date did not survive the JSON round trip');

  // Compact wire: the same client, a route whose encoder is positional.
  assert.equal(compact.error, '', `mion-next compact round trip failed: ${compact.error}`);
  assert.equal(compact.sum, 42);

  // Batch: one request, both routes, run by the id this build compiled into the server.
  assert.equal(batch.error, '', `mion-next batch failed: ${batch.error}`);
  assert.equal(batch.message, 'Hello batch!');
  assert.equal(batch.sum, 3);
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
