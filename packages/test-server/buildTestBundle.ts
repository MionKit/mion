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
export type TestBundleTarget = 'edge' | 'cloudflare';

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
