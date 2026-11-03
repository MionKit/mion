// The broker itself is covered in next-broker.test.ts.
import {describe, expect, it} from 'vitest';
import {withRunTypes} from '../src/runtypes/next/index.ts';

describe('withRunTypes — the Next config wrapper', () => {
  // Next's telemetry flush loads next.config too: it gets rules, no resolver (that would serve no loader, then linger).
  // Faking that process is also what keeps these tests from spawning a real resolver.
  async function withoutBroker<T>(run: () => Promise<T>): Promise<T> {
    const previous = process.argv[1];
    process.argv[1] = '/fake/next/dist/telemetry/detached-flush.js';
    try {
      return await run();
    } finally {
      process.argv[1] = previous;
    }
  }

  it('registers the Turbopack rules the loader is reached through', async () => {
    const config = (await withoutBroker(() => withRunTypes({reactStrictMode: true}, {cwd: '/tmp'}))) as {
      reactStrictMode: boolean;
      turbopack?: {rules?: Record<string, {loaders: {loader: string; options: {socketPath: string}}[]; condition: unknown}>};
    };
    // The caller's own config survives.
    expect(config.reactStrictMode).toBe(true);
    const rules = config.turbopack?.rules ?? {};
    expect(Object.keys(rules).sort()).toEqual(['*.cts', '*.mts', '*.ts', '*.tsx']);
    for (const rule of Object.values(rules)) {
      expect(rule.loaders[0].loader).toBe('@mionjs/devtools/runtypes/next/loader');
      // Loader options cross into the worker as plain JSON — a socket path, nothing else.
      expect(Object.keys(rule.loaders[0].options)).toEqual(['socketPath']);
      // `not: foreign` keeps the loader off node_modules and Next's own internals.
      expect(rule.condition).toEqual({not: 'foreign'});
    }
  });

  it('keeps turbopack rules the caller already had', async () => {
    const existing = {'*.svg': {loaders: [{loader: 'svg-loader'}]}};
    const config = (await withoutBroker(() => withRunTypes({turbopack: {rules: existing}}, {cwd: '/tmp'}))) as {
      turbopack: {rules: Record<string, unknown>};
    };
    expect(config.turbopack.rules['*.svg']).toEqual(existing['*.svg']);
    expect(config.turbopack.rules['*.ts']).toBeDefined();
  });

  it('falls back to a webpack plugin under `next --webpack`, composing onto an existing webpack fn', async () => {
    // Next 16 makes Turbopack the default, so the opt-out is what is detected.
    const previous = process.env.TURBOPACK;
    process.env.TURBOPACK = '0';
    try {
      let callerRan = false;
      const config = (await withRunTypes(
        {
          webpack: (webpackConfig: {plugins?: unknown[]}) => {
            callerRan = true;
            return webpackConfig;
          },
        },
        {cwd: '/tmp'}
      )) as {webpack: (config: {plugins?: unknown[]}, ctx: unknown) => {plugins: unknown[]}; turbopack?: unknown};
      const built = config.webpack({plugins: []}, {});
      expect(callerRan).toBe(true);
      expect(built.plugins).toHaveLength(1);
      // The webpack lane has a real plugin host with its own buildStart, so no broker and no turbopack rules.
      expect(config.turbopack).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.TURBOPACK;
      else process.env.TURBOPACK = previous;
    }
  });

  it('picks the webpack plugin in the `next dev --webpack` server, which Next forks without the flag', async () => {
    const saved = {turbopack: process.env.TURBOPACK, devServer: process.env.__NEXT_DEV_SERVER};
    const restore = (key: 'TURBOPACK' | '__NEXT_DEV_SERVER', value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    process.env.__NEXT_DEV_SERVER = '1';
    try {
      delete process.env.TURBOPACK;
      const webpackLane = (await withoutBroker(() => withRunTypes({}, {cwd: '/tmp'}))) as {
        webpack?: unknown;
        turbopack?: unknown;
      };
      expect(typeof webpackLane.webpack).toBe('function');
      expect(webpackLane.turbopack).toBeUndefined();

      // A Turbopack dev server gets TURBOPACK from Next, so it keeps the loader rules.
      process.env.TURBOPACK = '1';
      const turbopackLane = (await withoutBroker(() => withRunTypes({}, {cwd: '/tmp'}))) as {turbopack?: {rules?: object}};
      expect(turbopackLane.turbopack?.rules).toBeDefined();
    } finally {
      restore('TURBOPACK', saved.turbopack);
      restore('__NEXT_DEV_SERVER', saved.devServer);
    }
  });
});
