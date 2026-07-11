/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import fs from 'node:fs';
import path from 'node:path';
import tsRuntypes from '@ts-runtypes/devtools/vite';
import type {PluginOptions as TsRuntypesPluginOptions} from '@ts-runtypes/devtools';

// ############# mion vite plugin — ts-runtypes migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by @ts-runtypes/devtools: the resolver binary
// scans the program, rewrites route()/middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/__runtypes/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. Legacy
// deepkit/AOT/pure-fn options are accepted and ignored (with a one-time notice).

/** Options for the ts-runtypes powered type transformation. */
export interface MionRunTypesOptions {
    /** Path to tsconfig.json (absolute, or relative to the vite root). */
    tsConfig?: string;
    /** Explicit path to the ts-runtypes resolver binary. Default resolution:
     *  TS_RUNTYPES_BIN env var → sibling `ts-run-types/bin/ts-runtypes` checkout →
     *  the published platform binary via @ts-runtypes/bin getExePath(). */
    binary?: string;
    /** RunTypes output root (generated modules land under `<outDir>/types/`, gitignored). */
    outDir?: string;
    /** What generated fn entries ship: 'code' (default) | 'functions' | 'both'. */
    emitMode?: TsRuntypesPluginOptions['emitMode'];
    /** Cache-module grouping, see @ts-runtypes/devtools docs. */
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    /** LEGACY (deepkit) — accepted and ignored. */
    compilerOptions?: unknown;
    include?: string | string[];
    exclude?: string | string[];
    reflectionMode?: unknown;
}

/** Options for the unified mion vite plugin (legacy sections accepted and ignored). */
export interface MionPluginOptions {
    /** ts-runtypes type transformation options. */
    runTypes?: MionRunTypesOptions;
    /** LEGACY pure function extraction — handled by ts-runtypes PureFunction markers now. Ignored. */
    serverPureFunctions?: unknown;
    /** LEGACY AOT cache generation — obsolete, ts-runtypes output IS the AOT artifact. Ignored. */
    aotCaches?: unknown;
    /** LEGACY mion server process orchestration (client e2e builds). Ignored (pending migration). */
    server?: unknown;
}

let legacyOptionsNoticeShown = false;

/** Resolves the ts-runtypes resolver binary: explicit option → env var → sibling checkout → published platform package. */
export function resolveRtBinary(explicit?: string): string | undefined {
    if (explicit) return explicit;
    if (process.env.TS_RUNTYPES_BIN) return process.env.TS_RUNTYPES_BIN;
    // Migration period: prefer a sibling ts-run-types checkout (the vendored JS tarballs
    // under vendor/ts-runtypes must match the binary, and the published 0.9.0 binary predates them).
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, 'ts-run-types', 'bin', 'ts-runtypes');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return undefined; // @ts-runtypes/bin getExePath() takes over (published platform binary)
}

/**
 * Creates the mion Vite plugin (ts-runtypes powered).
 *
 * @example
 * ```ts
 * // vitest.config.ts / vite.config.ts
 * import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [mionVitePlugin({runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')}})],
 * });
 * ```
 */
export function mionVitePlugin(options: MionPluginOptions = {}) {
    const rt = options.runTypes ?? {};
    if (!legacyOptionsNoticeShown && (options.serverPureFunctions || options.aotCaches || options.server || rt.compilerOptions)) {
        legacyOptionsNoticeShown = true;
        console.warn(
            '[mionVitePlugin] legacy options (serverPureFunctions/aotCaches/server/runTypes.compilerOptions) ' +
                'are ignored since the ts-runtypes migration. See migration-docs/ at the repo root.'
        );
    }
    // NOTE: project `references` in the tsconfig are fine — the ts-runtypes resolver
    // drops them when building its scan program (they are a tsc --build concept).
    return tsRuntypes({
        binary: resolveRtBinary(rt.binary),
        tsconfig: rt.tsConfig,
        outDir: rt.outDir,
        emitMode: rt.emitMode,
        moduleMode: rt.moduleMode,
        inlineMode: rt.inlineMode,
        transformMode: rt.transformMode,
    });
}

/** LEGACY compat: resolves immediately. The old plugin resolved this once the managed mion
 *  server process was ready; server orchestration is pending migration. */
export const serverReady: Promise<void> = Promise.resolve();
