/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BunPlugin} from 'bun';
import {unplugin} from '@ts-runtypes/devtools/unplugin';

export interface RunTypesLoaderOptions {
    /** Path to the tsconfig.json whose program the resolver scans (absolute, or relative to cwd). */
    tsConfig?: string;
    /** RunTypes generated-output root (defaults to <cwd>/__runtypes). */
    genDir?: string;
    /** Halt the load on Error-severity ts-runtypes diagnostics. Default false for the Bun preload
     *  lane so a single diagnostic doesn't abort the whole `bun test`/`bun run` process; genuine
     *  missing injections still surface at runtime as MissingRtFnsError during route registration. */
    failOnError?: boolean;
}

/**
 * Bun plugin that injects ts-runtypes precompiled type functions into `route()`/`middleFn()` call
 * sites at load time, so mion route registration finds its build-time metadata under Bun. This is
 * the Bun counterpart of `mionVitePlugin` (@mionjs/devtools): both wrap @ts-runtypes/devtools, which
 * drives the same Go resolver. It replaces the old deepkit type-compiler loader — under ts-runtypes
 * all compilation is build-time and there is no runtime reflection.
 *
 * `@ts-runtypes/devtools/unplugin` exposes a Bun context (`unplugin.bun`) built on unplugin@3; the
 * returned BunPlugin resolves the injected `virtual:rt/*` modules via `onResolve` and rewrites each
 * loaded `.ts` file via `onLoad`. `transformMode: 'go'` makes the resolver return fully-rewritten
 * code, since a Bun onLoad callback returns final contents rather than a JS-side edit list.
 */
export function runTypesLoader(options: RunTypesLoaderOptions = {}): BunPlugin {
    const built = unplugin.bun({
        tsconfig: options.tsConfig,
        genDir: options.genDir,
        transformMode: 'go',
        failOnError: options.failOnError ?? false,
    });
    // unplugin.bun returns a single BunPlugin for a single-plugin factory.
    const inner = (Array.isArray(built) ? built[0] : built) as BunPlugin;

    // Bun's RUNTIME plugin API (Bun.plugin preload) is a subset of the Bun.build bundler API:
    // it exposes onResolve/onLoad but NOT onStart/onEnd. unplugin's Bun context registers the
    // resolver's buildStart hook via build.onStart, so under a preload it throws
    // "build.onStart is not a function" and the resolver never spawns. Shim onStart/onEnd onto
    // the build object, run the wrapped setup (registers onResolve/onLoad + captures buildStart),
    // then drive the captured buildStart callbacks ourselves so the resolver process comes up
    // before the first onLoad transform. buildEnd (resolver teardown) is left to process exit.
    return {
        name: inner.name,
        async setup(build: Parameters<NonNullable<BunPlugin['setup']>>[0]) {
            const b = build as unknown as {
                onStart?: (cb: () => unknown) => void;
                onEnd?: (cb: () => unknown) => void;
                onLoad: (opts: unknown, cb: (args: {path: string; loader?: string}) => unknown) => void;
            };
            const startCbs: Array<() => unknown> = [];
            if (typeof b.onStart !== 'function') b.onStart = (cb) => void startCbs.push(cb);
            if (typeof b.onEnd !== 'function') b.onEnd = () => {};
            // Bun's runtime onLoad rejects an undefined result (the bundler treats it as "default
            // load"). Wrap onLoad so files the resolver leaves untransformed fall back to their
            // original source, which Bun then transpiles natively.
            const origOnLoad = b.onLoad.bind(b);
            b.onLoad = (opts, cb) =>
                origOnLoad(opts, async (args) => {
                    const res = await cb(args);
                    if (res && typeof res === 'object') return res;
                    const contents = await Bun.file(args.path).text();
                    return {contents, loader: (args.loader as 'ts') ?? 'ts'};
                });
            await inner.setup?.(build);
            for (const cb of startCbs) await cb();
        },
    } as BunPlugin;
}
