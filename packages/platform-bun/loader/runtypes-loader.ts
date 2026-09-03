/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BunPlugin} from 'bun';
import runtypesBunPlugin from '@mionjs/devtools/runtypes/bun';

export interface RunTypesLoaderOptions {
  /** Path to the tsconfig.json whose program the resolver scans (absolute, or relative to cwd). */
  tsConfig?: string;
  /** RunTypes generated-output root (defaults to <cwd>/.mion). */
  genDir?: string;
  /** Halt the load on Error-severity mion diagnostics. Default false for the Bun preload
   *  lane so a single diagnostic doesn't abort the whole `bun test`/`bun run` process; genuine
   *  missing injections still surface at runtime as MissingRtFnsError during route registration. */
  failOnError?: boolean;
}

/**
 * Bun plugin that injects mion precompiled type functions into `route()`/`middleFn()` call
 * sites at load time, so mion route registration finds its build-time metadata under Bun. This is
 * the Bun counterpart of `mionVitePlugin` (@mionjs/devtools): both wrap @mionjs/devtools.
 *
 * Everything Bun-specific lives upstream in `@mionjs/devtools/runtypes/bun` (0.12.1+), which serves
 * both of Bun's plugin hosts: the `Bun.build` bundler and the `Bun.plugin` runtime preload. mion
 * used to carry its own shims for the runtime host's missing `onStart` and its refusal of an
 * `undefined` `onLoad` result; upstream owns those now, and also unrefs the resolver child so a
 * plain `bun run` exits instead of hanging on the live process.
 */
export function runTypesLoader(options: RunTypesLoaderOptions = {}): BunPlugin {
  return runtypesBunPlugin({
    tsconfig: options.tsConfig,
    genDir: options.genDir,
    transformMode: 'go',
    failOnError: options.failOnError ?? false,
  }) as unknown as BunPlugin;
}
