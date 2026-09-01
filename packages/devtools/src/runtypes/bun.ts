// @mionjs/devtools/runtypes/bun — the Bun plugin, for BOTH of Bun's plugin hosts:
//
//   - `Bun.build({plugins: [runtypes()]})` — the BUNDLER. unplugin's own Bun
//     context targets exactly this, so it works unassisted.
//   - `Bun.plugin(runtypes())` from a `--preload` module — the RUNTIME loader,
//     which transforms each file as Bun imports it, with no bundle step. This
//     is what a `bun run` / `bun test` project uses, and unplugin's context does
//     NOT work there unaided.
//
// The runtime host is a SUBSET of the bundler host, and three gaps have to be
// bridged. All three are load-bearing; the third is the dangerous one.
//
//  1. `build.onStart` / `build.onEnd` DO NOT EXIST on the runtime context (it
//     carries only `target`, `onLoad`, `onResolve`, `module`). unplugin registers
//     the resolver's `buildStart` — which spawns the resolver process and
//     generates the cache modules — through `build.onStart`, so a preload throws
//     `build.onStart is not a function` before anything transforms.
//
//  2. `onLoad` MUST return an object. Returning undefined (the resolver left a
//     file untransformed) is a default-load in the bundler but throws
//     `TypeError: onLoad() expects an object returned` at runtime, so the whole
//     import fails on the first file the resolver had no rewrite for.
//
//  3. `Bun.plugin()` DOES NOT AWAIT AN ASYNC `setup`. It returns a promise, but
//     Bun starts importing modules immediately, so an un-awaited
//     `Bun.plugin(runtypes())` races the resolver's startup: the first files
//     load while `buildStart` is still running, the transform hook sees no
//     resolver yet and passes them through untouched, and their marker call
//     sites register with NO injected type information. Nothing throws and
//     nothing warns — the failure surfaces much later as a missing-type error
//     from whatever consumes the markers.
//
//     A host CAN avoid this by writing `await Bun.plugin(runtypes())`, and that
//     is still worth doing, but "your build is silently wrong if you forget one
//     keyword" is not an acceptable contract. So this adapter gates every
//     `onLoad` on an internal readiness promise: a load that arrives early
//     WAITS for startup instead of skipping the transform. Correct either way.
//
// The plugin's own hooks are host-agnostic — the resolver, the transform gate
// and the diagnostics all come from ./unplugin.ts unchanged.

import {unplugin, PLUGIN_NAME, type Options} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';

// Bun's plugin types are declared by `bun-types`, which is deliberately NOT a
// dependency here: this package is published, and pulling Bun's globals into
// every consumer's typecheck to describe two callbacks is a bad trade. These
// are the structural minimum the adapter touches; a real BunPlugin satisfies
// them, and anything Bun adds later flows through untyped rather than breaking.

/** What an `onLoad` callback hands back: the file's source plus its loader. */
export interface BunOnLoadResult {
  contents: string;
  loader?: string;
}

/** The `build` object passed to `setup`. `onStart`/`onEnd` are optional because
 *  the RUNTIME host omits them entirely — that is gap 1. */
export interface BunBuildContext {
  onLoad: (constraints: unknown, callback: (args: BunOnLoadArgs) => unknown) => void;
  onResolve?: (constraints: unknown, callback: (args: unknown) => unknown) => void;
  onStart?: (callback: () => unknown) => void;
  onEnd?: (callback: () => unknown) => void;
  [key: string]: unknown;
}

export interface BunOnLoadArgs {
  path: string;
  loader?: string;
  [key: string]: unknown;
}

export interface BunPluginLike {
  name: string;
  setup: (build: BunBuildContext) => unknown;
}

/** Reads a file the resolver declined to rewrite, so `onLoad` can still return
 *  an object (gap 2). Uses Bun's own file reader — this only ever runs inside a
 *  Bun process. */
declare const Bun: {file: (path: string) => {text: () => Promise<string>}};

// Loader for a path the resolver left alone. Bun infers loaders from the
// extension for a plain read, but the runtime host wants one named explicitly,
// and `args.loader` already carries what Bun picked.
function passthroughLoader(args: BunOnLoadArgs): string {
  if (typeof args.loader === 'string' && args.loader !== '') return args.loader;
  if (args.path.endsWith('.tsx')) return 'tsx';
  if (args.path.endsWith('.jsx')) return 'jsx';
  if (/\.[mc]?js$/.test(args.path)) return 'js';
  return 'ts';
}

/**
 * The RunTypes Bun plugin. Pass it to `Bun.build({plugins: [...]})` or to
 * `Bun.plugin()` from a `--preload` module (see `bunfig.toml`'s `preload`).
 *
 * ```ts
 * // rt-preload.ts, referenced from bunfig.toml `preload`
 * import {plugin} from 'bun';
 * import runtypes from '@mionjs/devtools/runtypes/bun';
 * plugin(runtypes({tsconfig: './tsconfig.json'}));
 * ```
 */
export function runtypesBunPlugin(options?: Options): BunPluginLike {
  return {
    name: PLUGIN_NAME,
    async setup(build: BunBuildContext) {
      // Which host are we on? The runtime loader has no onStart. Decided HERE,
      // not at construction, because the inner plugin's options depend on it —
      // hence the lazy unplugin.bun() below.
      const runtimeHost = typeof build.onStart !== 'function';

      // `detachResolver` unrefs the resolver child so it can't hold the host
      // process open. Correct for the runtime loader, which keeps one resolver
      // for the whole process and never gets a buildEnd to close it; WRONG for
      // Bun.build, where a pending resolver response can be the build's only
      // live handle and an unref'd child would let the process exit mid-build.
      const built = unplugin.bun(runtimeHost ? ({...options, detachResolver: true} as Options) : options) as unknown;
      // unplugin returns a single plugin for a single-plugin factory, but its
      // type allows an array; normalise before wrapping.
      const inner = (Array.isArray(built) ? built[0] : built) as BunPluginLike;

      // Gap 1 — capture what unplugin registers through onStart/onEnd; the
      // runtime host has neither, so we drive them ourselves below. On the
      // BUNDLER host both already exist and are left completely alone, so
      // Bun.build keeps its own ordering.
      const startCallbacks: Array<() => unknown> = [];
      const endCallbacks: Array<() => unknown> = [];
      if (runtimeHost) {
        build.onStart = (callback) => void startCallbacks.push(callback);
        build.onEnd = (callback) => void endCallbacks.push(callback);
      }

      // Gap 3 — every load waits on this. Resolved once the captured
      // buildStart callbacks have finished (so the resolver is up and the cache
      // modules are on disk), or immediately on the bundler host, which
      // sequences onStart before onLoad itself.
      let signalReady: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        signalReady = resolve;
      });
      // A startup FAILURE must not hang every import behind a promise that
      // never settles: record it and rethrow from the load that hits it, where
      // Bun can attribute the error to a real file.
      let startupError: unknown;

      // Gap 2 + gap 3 — wrap onLoad before `setup` registers any.
      const registerLoad = build.onLoad.bind(build);
      build.onLoad = (constraints, callback) =>
        registerLoad(constraints, async (args: BunOnLoadArgs) => {
          await ready;
          if (startupError !== undefined) throw startupError;
          const result = await callback(args);
          if (result && typeof result === 'object') return result;
          // The resolver had no rewrite for this file. Hand back its original
          // source so Bun transpiles it normally (gap 2).
          return {contents: await Bun.file(args.path).text(), loader: passthroughLoader(args)};
        });

      await inner.setup?.(build);

      if (!runtimeHost) {
        signalReady();
        return;
      }
      // Drive the captured buildStart now, THEN open the gate. Deliberately not
      // awaited before `setup` returns on the bundler path — only the runtime
      // host needs this, and only because it has no onStart of its own.
      try {
        for (const callback of startCallbacks) await callback();
      } catch (error) {
        startupError = error;
      } finally {
        signalReady();
      }
      // buildEnd (resolver teardown) has no runtime-host trigger — the process
      // exiting is the teardown. Keep the callbacks referenced so a future host
      // that grows an onEnd can run them.
      void endCallbacks;
    },
  };
}

export default runtypesBunPlugin;
