// Lint-transport assertions: run each app's configured linter over its caveat
// source and prove the published RunTypes lint transport
// (@mionjs/devtools/{oxlint,eslint}) is wired and surfaces an RT diagnostic.
// The TRANSPORT is under test, not the diagnostic catalog — the caveat's
// non-serializable member reliably drives a VL0xx from the resolver.
//
// oxlint rides build-vite; eslint rides smoke-esbuild — both published linters.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const E2E_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(E2E_ROOT, 'node_modules/.bin');

// The transport is wired if its rule name reaches the output — as a real RT
// diagnostic (VL0xx / runtypes/{warn,error}) in-container where the resolver
// binary is installed, or as its `[runtypes]` engine line on a host without the
// platform binary. Either proves the plugin loaded and ran; a silent no-op fails.
const WIRED = /runtypes|VL0\d\d/i;

// A config failure is NEVER an acceptable outcome: it means the app's lint config
// points the resolver at the wrong tsconfig (or none), so the lane would "pass" on
// an error message instead of a real diagnostic. Only a LIVE resolver emits
// CFG001, so this can't collide with the tolerated missing-binary engine line.
const MISCONFIGURED = /CFG001|broken-tsconfig/i;

// The lint lane resolves its binary through @mionjs/bin, which takes no
// plugin option — MION_BIN is its override. Forward the fixture's single host knob
// to it, resolved against the invoking cwd because the child runs in E2E_ROOT.
function lintEnv() {
  const override = process.env.MION_E2E_BINARY;
  return override ? {...process.env, MION_BIN: path.resolve(override)} : process.env;
}

function runLinter(name, binName, args) {
  const bin = path.join(BIN, binName);
  if (!existsSync(bin)) return {skip: true, reason: `${binName} not installed at ${bin}`};
  const result = spawnSync(bin, args, {cwd: E2E_ROOT, encoding: 'utf8', env: lintEnv()});
  return {skip: false, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`, status: result.status};
}

test('oxlint transport (build-vite) surfaces an RT diagnostic', () => {
  const outcome = runLinter('oxlint', 'oxlint', ['--config', 'apps/build-vite/oxlintrc.e2e.json', 'apps/build-vite/src/caveat.ts']);
  if (outcome.skip) return void console.log(`  (skipped: ${outcome.reason})`);
  assert.doesNotMatch(outcome.output, MISCONFIGURED, `oxlint lint config points the resolver at the wrong tsconfig:\n${outcome.output.slice(0, 800)}`);
  assert.match(outcome.output, WIRED, `oxlint RT transport produced no runtypes output:\n${outcome.output.slice(0, 800)}`);
});

test('eslint transport (smoke-esbuild) surfaces an RT diagnostic', () => {
  const outcome = runLinter('eslint', 'eslint', ['--config', 'apps/smoke-esbuild/eslint.config.mjs', 'apps/smoke-esbuild/src/caveat.ts']);
  if (outcome.skip) return void console.log(`  (skipped: ${outcome.reason})`);
  assert.doesNotMatch(outcome.output, MISCONFIGURED, `eslint lint config points the resolver at the wrong tsconfig:\n${outcome.output.slice(0, 800)}`);
  assert.match(outcome.output, WIRED, `eslint RT transport produced no runtypes output:\n${outcome.output.slice(0, 800)}`);
});
