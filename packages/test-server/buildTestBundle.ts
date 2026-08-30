/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {build} from 'vite';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const testServerDir = dirname(fileURLToPath(import.meta.url));

/** Standalone runtime bundles under `build/`, each built from its own vite config. */
export type TestBundleTarget = 'edge' | 'cloudflare' | 'cloudflare-storage';

/**
 * Builds one of the standalone bundles the edge/workers specs load into their runtime.
 *
 * These are GENERATED, never committed: they inline the whole framework, so a committed copy
 * silently freezes whatever the engine emitted the day it was checked in and the specs stop
 * guarding the adapters (see docs/done/stale-test-server-edge-bundles.md). Both specs build
 * theirs through a vitest globalSetup, so the artifact always matches the source under test.
 */
export async function buildTestBundle(target: TestBundleTarget): Promise<void> {
  await build({
    configFile: resolve(testServerDir, `vite.${target}.config.ts`),
    root: testServerDir,
    logLevel: 'warn',
  });
  assertBuiltFromSource(target);
  // Only the SCRIPT-evaluated bundles need the prologue. The storage bundle is an
  // ES MODULE (workerd modules format, which is what lets it export a Durable
  // Object class), and a module is strict by definition — there is nothing to
  // assert and no IIFE wrapper to assert it on.
  if (target !== 'cloudflare-storage') assertStrictMode(target);
}

/**
 * Fails the run if the bundle lost its `"use strict"` prologue.
 *
 * These bundles are evaluated as a SCRIPT (EdgeVM / miniflare `initialCode`), and a script is
 * sloppy unless it opens with the directive. Sloppy mode silently swallows failed property
 * assignments, so a compiled restore fn like `v.date = new Date(v.date)` applied to a non-object
 * stops throwing and a bad request falls through to validation instead of failing to deserialize,
 * breaking node-vs-edge error parity. Rollup emitted the prologue for iife output; rolldown does
 * not, so the vite configs put it back via `output.intro` and this pins it.
 */
function assertStrictMode(target: TestBundleTarget): void {
  const bundlePath = resolve(testServerDir, 'build', `test-server-${target}.js`);
  const head = readFileSync(bundlePath, 'utf8').slice(0, 200);
  if (/^\s*\(function\([^)]*\)\s*\{\s*["']use strict["'];/.test(head)) return;
  throw new Error(
    `[test-server] the ${target} bundle does not open its IIFE with "use strict". It is evaluated ` +
      `as a script, so without the directive every module in it runs in sloppy mode and failed ` +
      `property assignments stop throwing. Restore \`output.intro\` in vite.${target}.config.ts.`
  );
}

/**
 * Fails the run if the bundle inlined any sibling package's `.dist` instead of its source.
 *
 * These configs used to alias each `@mionjs/*` to its package DIRECTORY, which resolves through
 * package.json — so the moment a `.dist` existed (anyone who had run `pnpm run build`) the bundle
 * silently swallowed BUILT output compiled with the default `emitMode: 'code'`, whose fns need
 * `new Function` and therefore cannot run on the edge at all. The specs do catch it, but only for
 * whoever happened to build first; this makes the invariant checked on every run.
 */
function assertBuiltFromSource(target: TestBundleTarget): void {
  const mapPath = resolve(testServerDir, 'build', `test-server-${target}.js.map`);
  const sources = (JSON.parse(readFileSync(mapPath, 'utf8')) as {sources?: string[]}).sources ?? [];
  const built = sources.filter((source) => source.includes('/.dist/'));
  if (!built.length) return;
  throw new Error(
    `[test-server] the ${target} bundle inlined ${built.length} module(s) from a sibling package's ` +
      `.dist instead of its source (e.g. ${built[0]}). Built output is compiled with the default ` +
      `emitMode: 'code', whose fns compile with \`new Function\` on first use — which the edge ` +
      `runtimes this bundle targets forbid. Keep resolution pinned to the 'source' condition.`
  );
}

// ############ CLI ############

/**
 * `node buildTestBundle.ts <edge|cloudflare>` — the package's build scripts run this rather than
 * `vite build --config` directly, so `assertBuiltFromSource` guards EVERY path that produces a
 * bundle, not just the vitest globalSetup one.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] as TestBundleTarget;
  if (target !== 'edge' && target !== 'cloudflare' && target !== 'cloudflare-storage') {
    console.error(
      `[test-server] usage: node buildTestBundle.ts <edge|cloudflare|cloudflare-storage> (got "${String(target ?? '')}")`
    );
    process.exit(1);
  }
  await buildTestBundle(target);
}
