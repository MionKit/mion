// Runtime-behavior assertions over the BUILT artifacts. Loads each app's dist
// (produced by build-all.mjs — each bundler transformed the shared source through
// its RunTypes plugin) and runs the app's selfCheck(). Proves the transform is
// correct AFTER that bundler mangled it (ESM/CJS, tree-shaking, minification).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..', 'apps');

// build-vite runs the full matrix (13 families); each light smoke runs the lean
// minimal subset.
const HEAVY = 'build-vite';
const SMOKES = ['smoke-esbuild', 'smoke-rollup', 'smoke-rolldown', 'smoke-webpack', 'smoke-rspack', 'smoke-source'];

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
