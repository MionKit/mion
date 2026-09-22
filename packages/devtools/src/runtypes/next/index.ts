// Turbopack has no plugin API and does not run webpack PLUGINS, so no unplugin entry reaches it; it does run
// webpack-style LOADERS, so `next.config` (plain Node, evaluated before any bundler worker exists) starts the
// broker and a loader registered through `turbopack.rules` asks that broker to rewrite each file. The pieces
// are exported individually because downstream tools (mion's devtools) compose them rather than nest wrappers.
// ⚠️ READ ./CLAUDE.md BEFORE CHANGING ANYTHING HERE: it records the invariants that look like cleanups and are
// not, and why the real `next build` coverage lives in the e2e container rather than in the vitest suite.
import path from 'node:path';
import {unplugin} from '../../core/unplugin.ts';
import {startBroker, socketPathFor, ownsBroker, isNextDev, type BrokerHandle, type NextOptions} from './broker.ts';

export {startBroker, socketPathFor, ownsBroker, isNextDev};
export type {BrokerHandle, NextOptions};

/** The loader specifier to put in `turbopack.rules`. */
export const RUNTYPES_LOADER = '@mionjs/devtools/runtypes/next/loader';

// `condition: {not: 'foreign'}` below keeps the loader off node_modules and Next's own internals: a large
// speed-up, and the documented way to scope a Turbopack rule.
const RULE_GLOBS = ['*.ts', '*.tsx', '*.mts', '*.cts'];

// A structural view of the NextConfig bits this touches, so the package needs no dependency on `next`.
interface TurbopackRule {
  loaders: Array<string | {loader: string; options?: Record<string, unknown>}>;
  condition?: unknown;
  as?: string;
}
interface NextConfigLike {
  turbopack?: {rules?: Record<string, unknown>; resolveAlias?: Record<string, unknown>; [key: string]: unknown};
  webpack?: (config: WebpackConfigLike, context: unknown) => WebpackConfigLike;
  [key: string]: unknown;
}
interface WebpackConfigLike {
  plugins?: unknown[];
  [key: string]: unknown;
}

/** Builds the `turbopack.rules` entries that point Turbopack at the broker. */
export function runTypesTurbopackRules(socketPath: string): Record<string, TurbopackRule> {
  const rule: TurbopackRule = {
    // Loader options cross into the worker as plain JSON, no functions, so `onPureFnReport` is set on the broker.
    loaders: [{loader: RUNTYPES_LOADER, options: {socketPath}}],
    condition: {not: 'foreign'},
  };
  return Object.fromEntries(RULE_GLOBS.map((glob) => [glob, rule]));
}

// Next 16 makes Turbopack the default and `--webpack` the opt-out, so the check is for the opt-out.
export function isTurbopack(): boolean {
  if (process.env.TURBOPACK === '0') return false;
  if (process.env.TURBOPACK) return true;
  return !process.argv.includes('--webpack');
}

/**
 * Wraps a Next config so RunTypes runs on both bundlers: the Turbopack loader
 * plus the broker, and the existing unplugin webpack plugin for `next --webpack`.
 *
 * `next.config.ts` must await it, because the whole-program scan has to finish
 * before Turbopack starts handing files to loader workers:
 *
 * ```ts
 * import {withRunTypes} from '@mionjs/devtools/runtypes/next';
 * export default await withRunTypes({reactStrictMode: true});
 * ```
 */
export async function withRunTypes(nextConfig: NextConfigLike = {}, options: NextOptions = {}): Promise<NextConfigLike> {
  const root = options.cwd ?? process.cwd();

  // The webpack lane has a real plugin host with its own buildStart; a broker there would spawn a second resolver.
  if (!isTurbopack()) return withWebpackPlugin(nextConfig, options);

  // The artifact lands in Next's output dir like any bundler's, written by the broker: Turbopack has no hook.
  const artifactDir =
    options.artifactDir ?? path.resolve(root, typeof nextConfig.distDir === 'string' ? nextConfig.distDir : '.next');
  // A process that loads the config without bundling (Next's detached telemetry flush) never calls a loader.
  const socketPath = ownsBroker()
    ? (await startBroker(root, {...options, artifactDir})).socketPath
    : (options.socketPath ?? socketPathFor(root));

  return {
    ...nextConfig,
    turbopack: {
      ...nextConfig.turbopack,
      rules: {
        ...nextConfig.turbopack?.rules,
        ...runTypesTurbopackRules(socketPath),
      },
    },
  };
}

// withWebpackPlugin composes onto whatever webpack function the user already had, rather than replacing it.
function withWebpackPlugin(nextConfig: NextConfigLike, options: NextOptions): NextConfigLike {
  const previous = nextConfig.webpack;
  return {
    ...nextConfig,
    webpack: (config: WebpackConfigLike, context: unknown) => {
      const next = previous ? previous(config, context) : config;
      next.plugins = next.plugins ?? [];
      next.plugins.push(webpackPlugin(options));
      return next;
    },
  };
}

// socketPath is a broker-only concern; the webpack lane has no broker.
function webpackPlugin(options: NextOptions): unknown {
  const {socketPath: _socketPath, ...pluginOptions} = options;
  // webpack's config carries no `next dev` signal, so the lane is decided here, as the broker does for Turbopack.
  return unplugin.webpack({...pluginOptions, devServer: pluginOptions.devServer ?? isNextDev()});
}

export default withRunTypes;
