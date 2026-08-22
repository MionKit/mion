/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {build} from 'vite';
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
}
