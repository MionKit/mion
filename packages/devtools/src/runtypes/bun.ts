// One plugin for BOTH Bun hosts: `Bun.build({plugins})`, which unplugin supports unaided, and `Bun.plugin()`
// from a `--preload` module, which it does not. The runtime host is a SUBSET and needs three gaps bridged,
// marked below: it has no `onStart`/`onEnd`, its `onLoad` throws unless it returns an object, and
// `Bun.plugin()` does not await an async `setup`, so a load racing startup would silently transform nothing
// (no throw, no warning: it surfaces later as a missing-type error from whatever consumes the markers).

import {unplugin, PLUGIN_NAME, type Options} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';

// Bun's plugin types are declared by `bun-types`, deliberately NOT a dependency: this package is published and
// will not pull Bun's globals into every consumer's typecheck. The structural minimum the adapter touches.

export interface BunOnLoadResult {
  contents: string;
  loader?: string;
}

/** `onStart`/`onEnd` are optional because the RUNTIME host omits them entirely — that is gap 1. */
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

/** Bun's own file reader, for the gap-2 passthrough read; this only ever runs inside a Bun process. */
declare const Bun: {file: (path: string) => {text: () => Promise<string>}};

// Bun infers a loader from the extension on a plain read, but the runtime host wants one named explicitly.
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
      // Decided HERE, not at construction, because the inner plugin's options depend on it.
      const runtimeHost = typeof build.onStart !== 'function';

      // `detachResolver` unrefs the resolver child: right for the runtime loader, which never gets a buildEnd to
      // close it, WRONG for Bun.build, where a pending resolver response can be the build's only live handle.
      const built = unplugin.bun(runtimeHost ? ({...options, detachResolver: true} as Options) : options) as unknown;
      // unplugin returns one plugin for a single-plugin factory, but its type allows an array.
      const inner = (Array.isArray(built) ? built[0] : built) as BunPluginLike;

      // Gap 1 — capture what unplugin registers, to drive it below; the BUNDLER host has both hooks and is left
      // alone, so Bun.build keeps its own ordering.
      const startCallbacks: Array<() => unknown> = [];
      const endCallbacks: Array<() => unknown> = [];
      if (runtimeHost) {
        build.onStart = (callback) => void startCallbacks.push(callback);
        build.onEnd = (callback) => void endCallbacks.push(callback);
      }

      // Gap 3 — every load waits on this: the captured buildStart callbacks having finished (resolver up, cache
      // modules on disk), or nothing on the bundler host, which sequences onStart before onLoad itself.
      let signalReady: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        signalReady = resolve;
      });
      // A startup FAILURE must not hang every import behind a promise that never settles; rethrown from the load
      // that hits it, where Bun can attribute the error to a real file.
      let startupError: unknown;

      // Gap 2 + gap 3 — wrap onLoad before `setup` registers any.
      const registerLoad = build.onLoad.bind(build);
      build.onLoad = (constraints, callback) =>
        registerLoad(constraints, async (args: BunOnLoadArgs) => {
          await ready;
          if (startupError !== undefined) throw startupError;
          const result = await callback(args);
          if (result && typeof result === 'object') return result;
          // Gap 2 — no rewrite for this file, and undefined would throw, so hand back the source to transpile.
          return {contents: await Bun.file(args.path).text(), loader: passthroughLoader(args)};
        });

      await inner.setup?.(build);

      if (!runtimeHost) {
        signalReady();
        return;
      }
      // Drive the captured buildStart, THEN open the gate.
      try {
        for (const callback of startCallbacks) await callback();
      } catch (error) {
        startupError = error;
      } finally {
        signalReady();
      }
      // buildEnd has no runtime-host trigger, the process exiting is the teardown; referenced so a future host
      // that grows an onEnd can run them.
      void endCallbacks;
    },
  };
}

export default runtypesBunPlugin;
