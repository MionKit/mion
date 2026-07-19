/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';
import {spawn, type ChildProcess} from 'node:child_process';
import tsRuntypes from '@ts-runtypes/devtools/vite';
import type {PluginOptions as TsRuntypesPluginOptions} from '@ts-runtypes/devtools';

/** One report record from the ts-runtypes pure-fn build report (structural subset). */
type RtPureFnSite = Parameters<NonNullable<TsRuntypesPluginOptions['onPureFnReport']>>[0][number];

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
     *  TS_RUNTYPES_BIN env var → the published platform binary via @ts-runtypes/bin getExePath(). */
    binary?: string;
    /** RunTypes generated-output root (generated modules under `<genDir>/types/` gitignored,
     *  committed enrichment under `<genDir>/enriched/`). Renamed from `outDir` in @ts-runtypes 0.10.0. */
    genDir?: string;
    /** @deprecated use `genDir` — kept as an alias for existing configs. */
    outDir?: string;
    /** What generated fn entries ship: 'code' (default) | 'functions' | 'both'. */
    emitMode?: TsRuntypesPluginOptions['emitMode'];
    /** Cache-module grouping, see @ts-runtypes/devtools docs. */
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    /** Halt the build on Error-severity ts-runtypes diagnostics (default true — the
     *  mion run-types adapter is scanner-clean since the pure-fn helpers moved onto the
     *  untracked runtime-key APIs, so strict mode is safe monorepo-wide). */
    failOnError?: TsRuntypesPluginOptions['failOnError'];
    /** Allow TypeFormat patterns that carry mockSamples but use JS-only regex features
     *  (unicode `\u…` escapes, lookarounds, backreferences) RE2 cannot compile — the
     *  build-time sample check is skipped (FMT004 suppressed) and delegated to the JS
     *  lint lane. Set true for packages whose formats use such patterns. */
    allowUncheckedPatterns?: TsRuntypesPluginOptions['allowUncheckedPatterns'];
    /** LEGACY (deepkit) — accepted and ignored. */
    compilerOptions?: unknown;
    include?: string | string[];
    exclude?: string | string[];
    reflectionMode?: unknown;
}

/** Managed mion server process (client test/e2e builds): spawned via vite-node so the
 *  server code gets its own vite pipeline (marker injection under its own tsconfig). */
export interface MionServerOptions {
    /** Absolute path to the server entry script. */
    startScript: string;
    /** Vite config used to transform the server (defaults to vite-node's lookup from cwd). */
    viteConfig?: string;
    /** Only 'childProcess' is supported since the ts-runtypes migration (server keeps running). */
    runMode?: 'childProcess' | 'middleware' | 'buildOnly';
    /** Max ms to wait for the server port to accept connections (default 30000). */
    waitTimeout?: number;
    /** Extra env vars for the server process (e.g. MION_TEST_PORT). */
    env?: Record<string, string>;
}

/** serverMapFrom build-time transport: client builds HARVEST inline mappers (from the
 *  ts-runtypes pure-fn build report) into a manifest; server builds CONSUME it through
 *  the `virtual:mion/server-mappers` module. Wire carries only the `rt::<hash>` key —
 *  the server registers exactly the mappers its own build baked in. */
export interface MionServerMappersOptions {
    /** CLIENT builds: write harvested serverMapFrom mappers to this manifest path.
     *  `true` resolves '.mion/server-mappers.json' against the process cwd — pass an
     *  absolute path in monorepo/vitest-workspace setups. */
    emit?: boolean | string;
    /** SERVER builds: manifest path(s) served through `virtual:mion/server-mappers`
     *  (import it once, side-effect, from the server entry). Missing files are
     *  tolerated and re-read lazily on the first unresolved mapping. */
    consume?: string | string[];
}

/** Options for the unified mion vite plugin (legacy sections accepted and ignored). */
export interface MionPluginOptions {
    /** ts-runtypes type transformation options. */
    runTypes?: MionRunTypesOptions;
    /** serverMapFrom mapper transport between the client and server builds. */
    serverMappers?: MionServerMappersOptions;
    /** LEGACY pure function extraction — handled by the serverMappers transport now. Ignored. */
    serverPureFunctions?: unknown;
    /** LEGACY AOT cache generation — obsolete, ts-runtypes output IS the AOT artifact. Ignored. */
    aotCaches?: unknown;
    /** Managed mion server process for client tests/e2e (spawned with vite-node, awaited via serverReady). */
    server?: MionServerOptions;
}

let legacyOptionsNoticeShown = false;

/** Resolves the ts-runtypes resolver binary: explicit option → env var → published platform package.
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
 *  built binary at a different version silently produces caches that diverge from CI/user installs
 *  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
 *  themselves are version-stable since @ts-runtypes 0.9.3). */
export function resolveRtBinary(explicit?: string): string | undefined {
    if (explicit) return explicit;
    if (process.env.TS_RUNTYPES_BIN) return process.env.TS_RUNTYPES_BIN;
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
    if (!legacyOptionsNoticeShown && (options.serverPureFunctions || options.aotCaches || rt.compilerOptions)) {
        legacyOptionsNoticeShown = true;
        console.warn(
            '[mionVitePlugin] legacy options (serverPureFunctions/aotCaches/runTypes.compilerOptions) ' +
                'are ignored since the ts-runtypes migration. See docs/ at the repo root.'
        );
    }
    // serverMapFrom harvest (CLIENT builds): consume the ts-runtypes pure-fn build report,
    // keep only sites attributed to @mionjs/client's serverMapFrom wrapper, and write the
    // manifest after every report phase ('build' replaces, 'update' merges the HMR delta).
    const manifestPath = resolveManifestPath(options.serverMappers?.emit);
    const harvestedMappers = new Map<string, ServerMapperManifestEntry>();
    const harvestReport = (sites: RtPureFnSite[], phase: 'build' | 'update'): void => {
        if (phase === 'build') harvestedMappers.clear();
        for (const site of sites) {
            if (site.calleeName !== 'serverMapFrom' || site.calleeModule !== '@mionjs/client') continue;
            harvestedMappers.set(site.key, {
                key: site.key,
                paramNames: site.paramNames,
                code: site.code,
                pureFnDependencies: site.pureFnDependencies,
            });
        }
        writeMapperManifest(manifestPath as string, harvestedMappers);
    };
    // NOTE: project `references` in the tsconfig are fine — the ts-runtypes resolver
    // drops them when building its scan program (they are a tsc --build concept).
    const plugins = tsRuntypes({
        binary: resolveRtBinary(rt.binary),
        tsconfig: rt.tsConfig,
        genDir: rt.genDir ?? rt.outDir,
        emitMode: rt.emitMode,
        moduleMode: rt.moduleMode,
        inlineMode: rt.inlineMode,
        transformMode: rt.transformMode,
        // Strict by default: Error-severity ts-runtypes diagnostics halt the build. The
        // mion run-types adapter no longer trips the scanner (its runtime-key wrappers ride
        // the untracked *ByKey APIs / the raw cache), so consumers get the documented
        // "Error = build must fail" contract. Opt out per package with `failOnError: false`.
        failOnError: rt.failOnError ?? true,
        allowUncheckedPatterns: rt.allowUncheckedPatterns,
        // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
        // mion manifest is the artifact, no need for ts-runtypes' own JSON file).
        ...(manifestPath ? {pureFnReport: 'callback' as const, onPureFnReport: harvestReport} : {}),
    });
    // Always serve virtual:mion/server-mappers — a server entry importing it must keep
    // resolving in pipelines WITHOUT `consume` configured (e.g. specs importing the
    // test-server module for its route types); those get an inert empty module.
    const extraPlugins: unknown[] = [serverMappersConsumePlugin(options.serverMappers?.consume)];
    if (options.server) {
        const server = options.server;
        // Server startup is deferred to buildStart so only the project actually RUNNING
        // spawns it (in vitest workspace mode every project config gets evaluated).
        extraPlugins.unshift({
            name: 'mion-server-orchestrator',
            buildStart() {
                startManagedServer(server);
            },
        });
    }
    return extraPlugins.length > 0 ? [...extraPlugins, plugins] : plugins;
}

// ############# serverMapFrom manifest transport #############

/** Manifest row: one harvested serverMapFrom mapper (mirrors @mionjs/run-types ServerMapperEntry). */
interface ServerMapperManifestEntry {
    key: string;
    paramNames?: string[];
    code?: string;
    pureFnDependencies?: string[];
}

/** Resolves the emit option to an absolute manifest path (undefined = harvest disabled). */
function resolveManifestPath(emit: MionServerMappersOptions['emit']): string | undefined {
    if (!emit) return undefined;
    return path.resolve(emit === true ? '.mion/server-mappers.json' : emit);
}

/** Writes the harvested mappers deterministically (sorted by key; empty array = harvested, none found). */
function writeMapperManifest(manifestPath: string, mappers: Map<string, ServerMapperManifestEntry>): void {
    const entries = [...mappers.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    mkdirSync(path.dirname(manifestPath), {recursive: true});
    writeFileSync(manifestPath, JSON.stringify(entries, null, 2) + '\n');
}

const SERVER_MAPPERS_ID = 'virtual:mion/server-mappers';
const RESOLVED_SERVER_MAPPERS_ID = '\0' + SERVER_MAPPERS_ID;

/** Serves virtual:mion/server-mappers to SERVER builds: registers the manifests' mappers and
 *  installs the lazy re-reader (covers the dev race where the server boots before the client
 *  build finished harvesting — the first unresolved mapping re-reads the manifest). Without
 *  `consume` paths it serves an inert empty module so the import never breaks a pipeline. */
function serverMappersConsumePlugin(consume: string | string[] | undefined) {
    const manifests = (Array.isArray(consume) ? consume : consume ? [consume] : []).map((manifest) => path.resolve(manifest));
    return {
        name: 'mion-server-mappers',
        resolveId(id: string) {
            if (id === SERVER_MAPPERS_ID) return RESOLVED_SERVER_MAPPERS_ID;
        },
        load(id: string) {
            if (id !== RESOLVED_SERVER_MAPPERS_ID) return;
            if (manifests.length === 0) return 'export {};';
            return [
                `import {installServerMapperReader} from '@mionjs/run-types';`,
                `import {existsSync, readFileSync} from 'node:fs';`,
                `const MANIFESTS = ${JSON.stringify(manifests)};`,
                `installServerMapperReader(() => {`,
                `    const entries = [];`,
                `    for (const manifestPath of MANIFESTS) {`,
                `        if (!existsSync(manifestPath)) continue;`,
                `        try {`,
                `            entries.push(...JSON.parse(readFileSync(manifestPath, 'utf8')));`,
                `        } catch {`,
                `            // partial write: the lazy on-miss re-read retries`,
                `        }`,
                `    }`,
                `    return entries;`,
                `});`,
            ].join('\n');
        },
    };
}

// ############# managed server process #############

let serverReadyResolve: (() => void) | undefined;
let serverReadyReject: ((err: Error) => void) | undefined;
let serverStarted = false;
let serverChild: ChildProcess | undefined;

/** Resolves once the managed mion server (options.server) accepts connections.
 *  Only ever resolves in processes whose running project configured `server` —
 *  await it from that project's globalSetup (the old plugin's contract). */
export const serverReady: Promise<void> = new Promise((resolve, reject) => {
    serverReadyResolve = resolve;
    serverReadyReject = reject;
});

/** Spawns the server entry through vite-node (its own vite config → its own marker injection). */
function startManagedServer(server: MionServerOptions): void {
    if (serverStarted) return;
    serverStarted = true;
    const port = parseInt(server.env?.MION_TEST_PORT ?? process.env.MION_TEST_PORT ?? '8076', 10);
    const waitTimeout = server.waitTimeout ?? 30000;
    const args = ['exec', 'vite-node'];
    if (server.viteConfig) args.push('--config', server.viteConfig);
    args.push(server.startScript);
    const child = spawn('pnpm', args, {
        cwd: server.viteConfig ? path.dirname(server.viteConfig) : path.dirname(server.startScript),
        env: {...process.env, ...server.env, MION_TEST_SERVER_AUTO_START: 'true'},
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    // unref so the child never keeps the parent's event loop alive (vitest must be able
    // to exit when tests finish); the exit hook below still tears the server down.
    child.unref();
    serverChild = child;
    const killChild = () => {
        if (serverChild && !serverChild.killed) serverChild.kill('SIGTERM');
    };
    process.once('exit', killChild);
    child.once('error', (err) => {
        serverChild = undefined;
        serverReadyReject?.(new Error(`[mionVitePlugin] failed to spawn managed server: ${err.message}`));
    });
    child.once('exit', (code) => {
        serverChild = undefined;
        if (code && code !== 0) serverReadyReject?.(new Error(`[mionVitePlugin] managed server exited with code ${code}`));
    });
    void waitForPort(port, waitTimeout).then(
        () => serverReadyResolve?.(),
        (err) => {
            killChild();
            serverReadyReject?.(err);
        }
    );
}

/** Polls the port until something accepts a TCP connection (any HTTP response counts). */
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await fetch(`http://127.0.0.1:${port}/`, {method: 'GET'});
            return; // any response means the server is listening
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    throw new Error(`[mionVitePlugin] managed server did not accept connections on port ${port} within ${timeoutMs}ms`);
}
