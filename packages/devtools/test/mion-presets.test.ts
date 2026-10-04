// The mion PRESETS: the shared option mapping, withMion, and the package's own
// exports map.
//
// The anti-drift property is the point of the first block. The vite preset and the
// Next preset used to be one package apart, and the option mapping existed only in
// the vite one; a knob added there simply did not reach any other host. Both now go
// through toRunTypesOptions, and these tests fail if that stops being true.
import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {toRunTypesOptions} from '../src/options.ts';
import {withMion} from '../src/next/index.ts';
import {mionVitePlugin} from '../src/vite/index.ts';
import runtypesVite from '../src/runtypes/vite.ts';

describe('toRunTypesOptions — the mapping both presets share', () => {
  it('rejects emitMode functions, which mion can never support', () => {
    // mion's client serializes compiled fns as code strings; 'functions' omits the
    // code, so every client would fail on its first validate. A plain JS config can
    // still pass it, hence a runtime check rather than types alone.
    expect(() => toRunTypesOptions({runTypes: {emitMode: 'functions' as never}})).toThrow(
      /emitMode: 'functions' is not supported/
    );
  });

  it('accepts the two modes mion does support', () => {
    expect(toRunTypesOptions({runTypes: {emitMode: 'code'}}).emitMode).toBe('code');
    expect(toRunTypesOptions({runTypes: {emitMode: 'both'}}).emitMode).toBe('both');
  });

  it('downgrades nothing by default so Error diagnostics halt the build', () => {
    // Passed through UNDEFINED rather than defaulted, so a tsconfig-only
    // `downgradeErrors` still reaches the host: the echo can only win over an
    // absent option.
    expect(toRunTypesOptions({}).downgradeErrors).toBeUndefined();
    expect(toRunTypesOptions({runTypes: {downgradeErrors: '*'}}).downgradeErrors).toBe('*');
    expect(toRunTypesOptions({runTypes: {downgradeErrors: ['validate-symbol-root']}}).downgradeErrors).toEqual([
      'validate-symbol-root',
    ]);
  });

  it('passes levels through, undefined when unset so a tsconfig-only value still reaches the host', () => {
    expect(toRunTypesOptions({}).levels).toBeUndefined();
    expect(toRunTypesOptions({runTypes: {levels: 'all'}}).levels).toBe('all');
  });

  it('passes logStyle through, undefined when unset so a tsconfig-only value still reaches the host', () => {
    expect(toRunTypesOptions({}).logStyle).toBeUndefined();
    expect(toRunTypesOptions({runTypes: {logStyle: 'lines'}}).logStyle).toBe('lines');
  });

  it('maps derivedPayloadLimits onto the resolver jsonMaxBytes key, undefined passing through', () => {
    expect(toRunTypesOptions({}).jsonMaxBytes).toBeUndefined();
    expect(toRunTypesOptions({runTypes: {derivedPayloadLimits: false}}).jsonMaxBytes).toBe(false);
    expect(toRunTypesOptions({runTypes: {derivedPayloadLimits: true}}).jsonMaxBytes).toBe(true);
  });

  it('passes patternSampleCount through as given', () => {
    expect(toRunTypesOptions({}).patternSampleCount).toBeUndefined();
    expect(toRunTypesOptions({runTypes: {patternSampleCount: 7}}).patternSampleCount).toBe(7);
  });

  it('maps tsConfig onto the resolver tsconfig key', () => {
    expect(toRunTypesOptions({tsConfig: '/p/tsconfig.json'}).tsconfig).toBe('/p/tsconfig.json');
  });
});

// The drift guard, checked at the seam rather than through a fake capture: BOTH
// presets must derive their resolver options from toRunTypesOptions and nowhere
// else. Before the merge the mapping existed only in the vite preset, so a knob
// added there reached no other host. A second literal mapping is exactly how that
// comes back, and it is invisible to a behavioural test that only calls one lane.
describe('neither preset maps resolver options on its own', () => {
  const read = (file: string): string => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

  // The two preset entry points, which now live in sibling directories rather than
  // one shared `mion/`. Named by path so a preset moving again fails loudly here.
  for (const file of ['vite/mionVitePlugin.ts', 'next/index.ts']) {
    it(`${file} builds resolver options through toRunTypesOptions`, () => {
      expect(read(file)).toMatch(/toRunTypesOptions\(/);
    });

    it(`${file} does not re-derive keys toRunTypesOptions already owns`, () => {
      // These are the keys the shared mapping sets. A preset assigning one itself is
      // either a duplicate or a divergence; both are the failure this guards.
      const source = read(file);
      for (const key of ['binary:', 'tsconfig:', 'downgradeErrors:', 'patternSampleCount:', 'jsRuntime:']) {
        expect(source, `${file} assigns ${key} itself instead of via toRunTypesOptions`).not.toContain(`    ${key}`);
      }
    });
  }
});

describe('client.routes — how the client gets each route', () => {
  it('maps client.routes onto the resolver clientRoutes option', () => {
    expect(toRunTypesOptions({client: {routes: 'fetch'}}).clientRoutes).toBe('fetch');
    expect(toRunTypesOptions({client: {routes: 'bundle'}}).clientRoutes).toBe('bundle');
    // unset forwards nothing, so the resolver's own default (bundle) applies
    expect(toRunTypesOptions({}).clientRoutes).toBeUndefined();
    expect(toRunTypesOptions({client: {}}).clientRoutes).toBeUndefined();
  });

  it('refuses moduleMode allSingle, whose shared modules would carry server types into the client', () => {
    expect(() => toRunTypesOptions({runTypes: {moduleMode: 'allSingle' as never}})).toThrow(
      /moduleMode: 'allSingle' is not supported/
    );
    expect(() => mionVitePlugin({runTypes: {moduleMode: 'allSingle' as never}})).toThrow(/allSingle/);
  });

  it('refuses a server entry that names no file', () => {
    expect(() => mionVitePlugin({server: {entry: ''}})).toThrow(/server.entry must name the server entry file/);
    expect(() => mionVitePlugin({server: {entry: 42 as never}})).toThrow(/server.entry must name the server entry file/);
  });

  it('has no server block on Next: the API is a route handler there', async () => {
    await expect(withMion({}, {server: {entry: 'src/server.ts'}, cwd: '/tmp'} as never)).rejects.toThrow(
      /there is no `server` option/
    );
  });

  it('rejects an unknown mode', () => {
    expect(() => toRunTypesOptions({client: {routes: 'all' as never}})).toThrow(
      /unknown client routes "all", expected 'bundle' \| 'fetch'/
    );
  });

  it('is refused by the plain adapters too, before any resolver starts', async () => {
    const plugin = runtypesVite({clientRoutes: 'all' as never}) as unknown as {buildStart: () => Promise<void>};
    await expect(plugin.buildStart()).rejects.toThrow(/unknown client routes "all", expected 'bundle' \| 'fetch'/);
  });

  it('is reached through BOTH presets', async () => {
    await expect(withMion({}, {client: {routes: 'all' as never}, cwd: '/tmp'})).rejects.toThrow(/client routes/);
    expect(() => mionVitePlugin({client: {routes: 'all' as never}})).toThrow(/client routes/);
  });
});

describe('withMion — composed onto the Next lane, never nested', () => {
  // next.config is loaded by more than the process that bundles: Next's detached
  // telemetry flush loads it too. Such a process must get the RULES but start no
  // resolver — one there would never serve a loader and would linger after the
  // build. Driving that path is also what keeps this test from spawning a real
  // resolver, so the rules shape is checked without a broker.
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
    const config = (await withoutBroker(() => withMion({reactStrictMode: true}, {cwd: '/tmp'}))) as {
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
    const config = (await withoutBroker(() => withMion({turbopack: {rules: existing}}, {cwd: '/tmp'}))) as {
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
      const config = (await withMion(
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
      // The webpack lane has a real plugin host with its own buildStart, so it needs
      // no broker and gets no turbopack rules.
      expect(config.turbopack).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.TURBOPACK;
      else process.env.TURBOPACK = previous;
    }
  });
});

// The exports map is a runtime contract no typecheck covers: a subpath that stops
// resolving fails only when a consumer imports it. `runtypes/next/loader` is the
// sharp one — Turbopack resolves a loader specifier with CJS require conditions, so
// an `import`-only entry is invisible to it and the build dies with
// "Package subpath is not defined by exports".
describe('the published exports map', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };

  it('declares every entry both presets and every bundler lane need', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [
        '.',
        './eslint',
        './next',
        './oxlint',
        './runtypes/bun',
        './runtypes/esbuild',
        './runtypes/next',
        './runtypes/next/loader',
        './runtypes/rolldown',
        './runtypes/rollup',
        './runtypes/rspack',
        './runtypes/vite',
        './runtypes/webpack',
        './unplugin',
        './vite',
      ].sort()
    );
  });

  it('resolves every declared subpath', async () => {
    for (const subpath of Object.keys(manifest.exports)) {
      const specifier = subpath === '.' ? '@mionjs/devtools' : `@mionjs/devtools/${subpath.slice(2)}`;
      await expect(
        Promise.resolve(import.meta.resolve(specifier)),
        `${specifier} does not resolve — the exports map and dist/ disagree`
      ).resolves.toBeTruthy();
    }
  });

  it('gives the Turbopack loader a `default` condition, not `import`', () => {
    // See ../src/runtypes/next/CLAUDE.md invariant 5. This one broke a real build.
    const loader = manifest.exports['./runtypes/next/loader'];
    expect(loader.default).toBeDefined();
    expect(loader.import).toBeUndefined();
  });

  it('gives the lint entry no `require` condition', () => {
    // src/lint/index.ts top-level-awaits prewarmSession(), which has no CommonJS
    // spelling and is load bearing: the resolver launcher must fork before oxlint
    // reserves its address space, or fork() fails with ENOMEM on Linux.
    expect(manifest.exports['./eslint'].require).toBeUndefined();
    expect(manifest.exports['./oxlint'].require).toBeUndefined();
  });
});
