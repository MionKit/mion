// The mion PRESETS: the shared option mapping, withMion, and the package's own
// exports map.
//
// The anti-drift property is the point of the first block. The vite preset and the
// Next preset used to be one package apart, and the option mapping existed only in
// the vite one; a knob added there simply did not reach any other host. Both now go
// through toRunTypesOptions, and these tests fail if that stops being true.
import {describe, expect, it} from 'vitest';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {toRunTypesOptions, resolveGenDir, createBatchHarvest, assertNoRemovedOptions} from '../src/options.ts';
import {withMion} from '../src/next/index.ts';
import {mionVitePlugin} from '../src/vite/index.ts';

describe('toRunTypesOptions — the mapping both presets share', () => {
  it('rejects emitMode functions, which mion can never support', () => {
    // mion's client serializes compiled fns as code strings; 'functions' omits the
    // code, so every client would fail on its first validate. A plain JS config can
    // still pass it, hence a runtime check rather than types alone.
    expect(() => toRunTypesOptions({emitMode: 'functions' as never})).toThrow(/emitMode: 'functions' is not supported/);
  });

  it('accepts the two modes mion does support', () => {
    expect(toRunTypesOptions({emitMode: 'code'}).emitMode).toBe('code');
    expect(toRunTypesOptions({emitMode: 'both'}).emitMode).toBe('both');
  });

  it('defaults failOnError to true so Error diagnostics halt the build', () => {
    expect(toRunTypesOptions({}).failOnError).toBe(true);
    expect(toRunTypesOptions({failOnError: false}).failOnError).toBe(false);
  });

  it('maps tsConfig onto the resolver tsconfig key and accepts the outDir alias', () => {
    expect(toRunTypesOptions({tsConfig: '/p/tsconfig.json'}).tsconfig).toBe('/p/tsconfig.json');
    expect(toRunTypesOptions({outDir: 'gen'}).genDir).toBe('gen');
    // genDir wins when both are given — outDir is the pre-0.10 spelling.
    expect(toRunTypesOptions({genDir: 'a', outDir: 'b'}).genDir).toBe('a');
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
      for (const key of ['binary:', 'tsconfig:', 'failOnError:', 'patternSampleCount:', 'jsRuntime:']) {
        expect(source, `${file} assigns ${key} itself instead of via toRunTypesOptions`).not.toContain(`    ${key}`);
      }
    });
  }
});

describe('assertNoRemovedOptions — both presets reject the same retired keys', () => {
  it('names the replacement instead of silently ignoring the key', () => {
    expect(() => assertNoRemovedOptions({runTypes: {reflectionMode: 'never'}} as never)).toThrow(/runTypes.reflectionMode/);
    expect(() => assertNoRemovedOptions({aotCaches: true} as never)).toThrow(/aotCaches/);
  });

  it('is reached through withMion, not only through the vite plugin', async () => {
    await expect(withMion({}, {aotCaches: true} as never)).rejects.toThrow(/aotCaches/);
    expect(() => mionVitePlugin({aotCaches: true} as never)).toThrow(/aotCaches/);
  });
});

describe('resolveGenDir — where the resolver wrote its tree', () => {
  it('defaults to .mion under the root', () => {
    expect(resolveGenDir('/p')).toBe('/p/.mion');
    expect(resolveGenDir('/p', {genDir: '/abs/gen'})).toBe('/abs/gen');
  });
});

describe('createBatchHarvest — the batch half that DOES reach Turbopack', () => {
  it('is inert when emit is unset, so pipelines that only import route types are untouched', () => {
    const {manifestPath, harvestMappers, harvestBatches} = createBatchHarvest(undefined, () => '/p/.mion');
    expect(manifestPath).toBeUndefined();
    expect(() => harvestMappers([], 'build')).not.toThrow();
    expect(() => harvestBatches([], 'build')).not.toThrow();
  });

  it('writes the batch table and the inputFrom mappers into one manifest', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mion-harvest-'));
    const manifest = path.join(root, 'batches.json');
    const {harvestMappers, harvestBatches} = createBatchHarvest(manifest, () => path.join(root, '.mion'));
    harvestMappers(
      [
        {key: 'rt::abc', calleeName: 'inputFrom', calleeModule: '@mionjs/client', module: 'pf/rt/abc'},
        {key: 'rt::other', calleeName: 'registerAnonymousPureFn', calleeModule: 'app'},
      ] as never,
      'build'
    );
    harvestBatches(
      [
        {
          file: '/app/a.ts',
          batchId: 'b_one',
          routeIds: ['orders/getById', 'users/getById'],
          mappings: [{fromId: 'orders/getById', toId: 'users/getById', paramIndex: 0, mapperKey: 'rt::abc'}],
        },
      ] as never,
      'build'
    );
    const written = JSON.parse(readFileSync(manifest, 'utf8'));
    expect(written.batches).toEqual({
      b_one: {
        routes: ['orders/getById', 'users/getById'],
        mappings: [{fromId: 'orders/getById', toId: 'users/getById', paramIndex: 0, mapperKey: 'rt::abc'}],
      },
    });
    // only @mionjs/client's inputFrom sites are mappers; the module path is resolved under genDir/types
    expect(written.mappers).toEqual([{key: 'rt::abc', module: path.join(root, '.mion', 'types', 'pf/rt/abc.js')}]);
    rmSync(root, {recursive: true, force: true});
  });

  it('keeps same routes with different mappings as two batches, and fails only on an id collision', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mion-harvest-'));
    const manifest = path.join(root, 'batches.json');
    const {harvestBatches} = createBatchHarvest(manifest, () => root);
    const routeIds = ['orders/getById', 'users/getById'];
    const mapping = {fromId: routeIds[0], toId: routeIds[1], paramIndex: 0, mapperKey: 'rt::x'};
    // the build hashes the mappings into the id, so these are two entries, never a conflict
    harvestBatches(
      [
        {file: '/app/a.ts', batchId: 'b_plain', routeIds, mappings: []},
        {file: '/app/b.ts', batchId: 'b_mapped', routeIds, mappings: [mapping]},
      ] as never,
      'build'
    );
    expect(Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).batches)).toEqual(['b_mapped', 'b_plain']);
    // the same call site re-reported (an edit) replaces its own entry
    expect(() =>
      harvestBatches([{file: '/app/a.ts', batchId: 'b_plain', routeIds, mappings: [mapping]}] as never, 'update')
    ).not.toThrow();
    // two different definitions under one id can only be a hash collision: a build error, never a silent pick
    expect(() =>
      harvestBatches([{file: '/app/c.ts', batchId: 'b_plain', routeIds: ['users/getById'], mappings: []}] as never, 'update')
    ).toThrow(/hash collision/);
    rmSync(root, {recursive: true, force: true});
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
