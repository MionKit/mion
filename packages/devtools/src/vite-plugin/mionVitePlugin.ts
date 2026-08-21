/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import path from 'node:path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawn, type ChildProcess} from 'node:child_process';
import tsRuntypes from '@ts-runtypes/devtools/vite';
import type {PluginOptions as TsRuntypesPluginOptions} from '@ts-runtypes/devtools';
import type {Plugin, PluginOption} from 'vite';

/** One report record from the ts-runtypes pure-fn build report (structural subset). */
type RtPureFnSite = Parameters<NonNullable<TsRuntypesPluginOptions['onPureFnReport']>>[0][number];

// ############# mion vite plugin — ts-runtypes migration #############
// The old plugin ran the deepkit type-compiler + pure-fn extraction + AOT cache
// generation. All of that is replaced by @ts-runtypes/devtools: the resolver binary
// scans the program, rewrites route()/middleFn()/createX call sites with precompiled
// function tuples and writes the generated cache modules under <srcDir>/__runtypes/.
//
// This wrapper keeps the old `mionVitePlugin({runTypes: {tsConfig}})` call shape so the
// existing vite/vitest configs across the monorepo keep working unchanged. The legacy
// deepkit/AOT/pure-fn options are REMOVED — see the migration guard below.

/** Options for the ts-runtypes powered type transformation. */
export interface MionRunTypesOptions {
    /** Path to tsconfig.json (absolute, or relative to the vite root). */
    tsConfig?: string;
    /** Explicit path to the ts-runtypes resolver binary. Default resolution:
     *  RT_BIN env var → the published platform binary, both via @ts-runtypes/bin getExePath().
     *  RT_BIN also covers the ESLint lane, so prefer it over a per-plugin path when both must match. */
    binary?: string;
    /** RunTypes generated-output root (generated modules under `<genDir>/types/` gitignored,
     *  committed enrichment under `<genDir>/enriched/`). Renamed from `outDir` in @ts-runtypes 0.10.0. */
    genDir?: string;
    /** @deprecated use `genDir` — kept as an alias for existing configs. */
    outDir?: string;
    /** What generated fn entries ship: 'code' (default) | 'both'.
     *
     *  mion deliberately does NOT support @ts-runtypes' third mode, 'functions'. That mode ships a
     *  live `createRTFn` closure and omits `code` — but mion's whole client story is serializing
     *  compiled fns to the browser as strings and rebuilding them there, so an entry with no body
     *  cannot cross the wire. Allowing it would silently ship clients that throw on first validate.
     *  Guaranteeing `code` here is what lets `MionTypeFn` type it as required (see
     *  packages/core/src/types/general.types.ts). Passing 'functions' throws at config time. */
    emitMode?: 'code' | 'both';
    /** Cache-module grouping, see @ts-runtypes/devtools docs. */
    moduleMode?: TsRuntypesPluginOptions['moduleMode'];
    inlineMode?: TsRuntypesPluginOptions['inlineMode'];
    transformMode?: TsRuntypesPluginOptions['transformMode'];
    /** Halt the build on Error-severity ts-runtypes diagnostics (default true — the
     *  mion run-types adapter is scanner-clean since the pure-fn helpers moved onto the
     *  untracked runtime-key APIs, so strict mode is safe monorepo-wide). */
    failOnError?: TsRuntypesPluginOptions['failOnError'];
    /** How many mockSamples to generate for a TypeFormat pattern that declares none.
     *  Pattern checks run on a real JS engine (the same `new RegExp` the emitted validator
     *  uses), so any JS regex is checkable — there is nothing to opt out of. Declared
     *  mockSamples always win over generation. A pattern the generator cannot handle
     *  (lookarounds are the usual case) fails the build with FMT005, asking for explicit
     *  mockSamples. */
    patternSampleCount?: TsRuntypesPluginOptions['patternSampleCount'];
    /** How many times to retry sample generation before failing with FMT005. The total
     *  budget is `patternSampleCount * patternSampleRetries` — raise this for heavily
     *  constrained patterns whose random draws often miss. */
    patternSampleRetries?: TsRuntypesPluginOptions['patternSampleRetries'];
    /** JS runtime used to run the pattern-checking sidecar. node and bun are found
     *  automatically on PATH; set this (or the upstream `RT_JS_RUNTIME` env var) only to
     *  point at another runtime. When no runtime can be started the build fails closed
     *  with FMT004 rather than shipping unverified patterns. */
    jsRuntime?: TsRuntypesPluginOptions['jsRuntime'];
}

/** Managed mion server process (client test/e2e builds): spawned via vite-node so the
 *  server code gets its own vite pipeline (marker injection under its own tsconfig). */
export interface MionServerOptions {
    /** Absolute path to the server entry script. */
    startScript: string;
    /** Vite config used to transform the server (defaults to vite-node's lookup from cwd). */
    viteConfig?: string;
    /** Only 'childProcess' is supported since the ts-runtypes migration (server keeps running).
     *  'middleware' (in-process dev-server mode) warns and falls back — restoring it is tracked in
     *  docs/todos/vite-plugin-ssr-middleware-mode.md. 'buildOnly' is gone: it WAS the AOT harvest mode. */
    runMode?: 'childProcess' | 'middleware';
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
     *  (import it once, side-effect, from the server entry). In `vite build` the entries
     *  are INLINED into the bundle at build time (missing manifests fail the build; no
     *  node:fs in the artifact — edge/lambda safe). In dev/serve the module reads the
     *  files at runtime, tolerating missing ones with a lazy re-read on the first
     *  unresolved mapping (covers the client-build race). */
    consume?: string | string[];
}

/** Options for the unified mion vite plugin. */
export interface MionPluginOptions {
    /** ts-runtypes type transformation options. */
    runTypes?: MionRunTypesOptions;
    /** serverMapFrom mapper transport between the client and server builds. */
    serverMappers?: MionServerMappersOptions;
    /** Managed mion server process for client tests/e2e (spawned with vite-node, awaited via serverReady). */
    server?: MionServerOptions;
}

let legacyBinEnvNoticeShown = false;

// ############# removed-option migration guard (0.8 → 0.9) #############
// These deepkit/AOT-era options were accepted-and-ignored through the ts-runtypes migration and are
// now gone from the types. Deleting them from the interfaces alone only fails a TYPED config; a plain
// vite.config.js would silently drop them, which is worse than the notice it replaces. So the keys are
// still detected at config time and throw with what to do instead — loud in both lanes, which is the
// end state the deprecation was aiming at. Remove this guard at 1.0.
const REMOVED_PLUGIN_OPTIONS: Record<string, string> = {
    aotCaches: 'AOT caches are obsolete — the ts-runtypes generated modules ARE the compiled artifact. Delete this option.',
    serverPureFunctions:
        'pure-fn extraction moved to the serverMapFrom transport. Use `serverMappers: {emit}` on the client build and `serverMappers: {consume}` on the server build.',
};
const REMOVED_RUNTYPES_OPTIONS: Record<string, string> = {
    compilerOptions: 'the deepkit type-compiler is gone; there is nothing to configure. Delete this option.',
    include: 'scan scope comes from the tsconfig program — narrow `include` in the tsconfig instead.',
    exclude: 'scan scope comes from the tsconfig program — narrow `exclude` in the tsconfig instead.',
    reflectionMode: 'deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.',
    reflection: 'deepkit reflection is gone; types are resolved at build time and always compiled. Delete this option.',
};

/** Throws on any deepkit/AOT-era option a stale config still passes, naming the replacement.
 *  Reads through an index signature so untyped JS/JSON configs are caught too, not just typed ones. */
function assertNoRemovedOptions(options: MionPluginOptions): void {
    const found: string[] = [];
    const root = options as Record<string, unknown>;
    for (const [key, hint] of Object.entries(REMOVED_PLUGIN_OPTIONS)) {
        if (root[key] !== undefined) found.push(`  - ${key}: ${hint}`);
    }
    const rt = (options.runTypes ?? {}) as Record<string, unknown>;
    for (const [key, hint] of Object.entries(REMOVED_RUNTYPES_OPTIONS)) {
        if (rt[key] !== undefined) found.push(`  - runTypes.${key}: ${hint}`);
    }
    if (found.length === 0) return;
    throw new Error(
        `[mionVitePlugin] removed option${found.length > 1 ? 's' : ''} in your config (they stopped doing anything ` +
            `at the ts-runtypes migration and are now gone):\n${found.join('\n')}`
    );
}

/** Resolves the ts-runtypes resolver binary: explicit option → @ts-runtypes/bin getExePath(),
 *  which honours the RT_BIN env var and then the published platform package.
 *
 *  mion deliberately reads NO env var of its own. RT_BIN (@ts-runtypes 0.11.0+) covers BOTH the
 *  transform lane and the ESLint lane, whereas mion's old TS_RUNTYPES_BIN reached only this one —
 *  and since the two lanes run in SEPARATE processes, a mion-side variable can never make them
 *  agree. One variable, both lanes, no divergence.
 *
 *  ⚠️ No sibling-checkout fallback: the binary VERSION is folded into every typeId, so a locally
 *  built binary at a different version silently produces caches that diverge from CI/user installs
 *  (the `<typeId>` half of every `<fnHash>_<typeId>` key stops matching; the fnHash prefixes
 *  themselves are version-stable since @ts-runtypes 0.9.3). The same caution applies to RT_BIN. */
export function resolveRtBinary(explicit?: string): string | undefined {
    if (explicit) return explicit;
    // TS_RUNTYPES_BIN is retired. Warn rather than ignore it silently: a user who set it would
    // otherwise be switched to a different binary (the platform package) without being told.
    if (process.env.TS_RUNTYPES_BIN && !process.env.RT_BIN && !legacyBinEnvNoticeShown) {
        legacyBinEnvNoticeShown = true;
        console.warn(
            '[mion] TS_RUNTYPES_BIN is no longer read and is being IGNORED. Use RT_BIN instead — ' +
                'it is honoured by @ts-runtypes/bin for both the vite transform and the ESLint lane, ' +
                'so they cannot end up on different binaries (whose typeIds would diverge).'
        );
    }
    return undefined; // @ts-runtypes/bin getExePath() takes over (RT_BIN → published platform binary)
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
export function mionVitePlugin(options: MionPluginOptions = {}): PluginOption[] {
    const rt = options.runTypes ?? {};
    assertNoRemovedOptions(options);
    if (options.server && options.server.runMode && options.server.runMode !== 'childProcess') {
        console.warn(
            `[mionVitePlugin] server.runMode '${options.server.runMode}' is not supported since the ts-runtypes ` +
                `migration — only 'childProcess' exists; the managed server will be spawned as a child process.`
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
    // Fail loudly rather than shipping a client whose validators have no body to rebuild from.
    // The type says 'code' | 'both', but configs are plain JS/JSON often written by hand.
    if ((rt.emitMode as string) === 'functions') {
        throw new Error(
            `[mion] emitMode: 'functions' is not supported. mion serializes compiled fns to the client as ` +
                `code strings, and 'functions' omits the code, so every client would fail on first validate. ` +
                `Use 'code' (default) or 'both'.`
        );
    }
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
        patternSampleCount: rt.patternSampleCount,
        patternSampleRetries: rt.patternSampleRetries,
        jsRuntime: rt.jsRuntime,
        // Pure-fn build report feeds the serverMapFrom transport; in-process only (the
        // mion manifest is the artifact, no need for ts-runtypes' own JSON file).
        ...(manifestPath ? {pureFnReport: 'callback' as const, onPureFnReport: harvestReport} : {}),
    });
    // Always serve virtual:mion/server-mappers — a server entry importing it must keep
    // resolving in pipelines WITHOUT `consume` configured (e.g. specs importing the
    // test-server module for its route types); those get an inert empty module.
    const extraPlugins: Plugin[] = [serverMappersConsumePlugin(options.serverMappers?.consume)];
    if (options.server) {
        const server = options.server;
        // Server startup is deferred to buildStart so only the project actually RUNNING
        // spawns it (in vitest workspace mode every project config gets evaluated).
        extraPlugins.unshift({
            name: 'mion-server-orchestrator',
            buildStart() {
                startManagedServer(server);
            },
        } satisfies Plugin);
    }
    return [...extraPlugins, plugins];
}

// ############# serverMapFrom manifest transport #############

/** Manifest row: one harvested serverMapFrom mapper (mirrors @mionjs/core ServerMapperEntry). */
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

/** Serves virtual:mion/server-mappers to SERVER builds. Two modes:
 *  - `vite build` (production bundles): the manifests are read AT BUILD TIME and the entries
 *    are inlined into the generated module as static data — no `node:fs`, no build-machine
 *    paths in the artifact, deployable to lambda/docker/edge like every other build output.
 *  - dev/serve (vitest, vite-node managed server): the module reads the manifest files at
 *    runtime and installs the lazy re-reader, covering the race where the server boots
 *    before the client build finished harvesting (first unresolved mapping re-reads).
 *  Without `consume` paths it serves an inert empty module so the import never breaks a
 *  pipeline that did not configure the transport. */
function serverMappersConsumePlugin(consume: string | string[] | undefined): Plugin {
    const manifests = (Array.isArray(consume) ? consume : consume ? [consume] : []).map((manifest) => path.resolve(manifest));
    let isBuildCommand = false;
    return {
        name: 'mion-server-mappers',
        configResolved(config: {command?: string}) {
            isBuildCommand = config?.command === 'build';
        },
        resolveId(id: string) {
            if (id === SERVER_MAPPERS_ID) return RESOLVED_SERVER_MAPPERS_ID;
        },
        load(id: string) {
            if (id !== RESOLVED_SERVER_MAPPERS_ID) return;
            if (manifests.length === 0) return 'export {};';
            if (isBuildCommand) {
                const entries = readMapperManifests(manifests);
                return [
                    `import {registerServerMappers} from '@mionjs/core';`,
                    `registerServerMappers(${JSON.stringify(entries)});`,
                ].join('\n');
            }
            return [
                `import {installServerMapperReader} from '@mionjs/core';`,
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

/** Reads + merges the mapper manifests at BUILD time (missing files fail loud in build mode —
 *  a production bundle silently missing its mappers would only fail at request time). */
function readMapperManifests(manifests: string[]): unknown[] {
    const entries: unknown[] = [];
    for (const manifestPath of manifests) {
        if (!existsSync(manifestPath)) {
            throw new Error(
                `[mionVitePlugin] serverMappers manifest not found at build time: ${manifestPath}. ` +
                    `Run the client build (serverMappers.emit) before the server build, or fix the configured path.`
            );
        }
        entries.push(...(JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown[]));
    }
    return entries;
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
