import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {toRunTypesOptions} from '../src/options.ts';
import {mionVitePlugin} from '../src/vite/index.ts';
import runtypesVite from '../src/runtypes/vite.ts';

describe('toRunTypesOptions — the preset option mapping', () => {
  it('rejects emitMode functions, which mion can never support', () => {
    // mion's client serializes compiled fns as code strings; 'functions' omits the
    // code, so every client would fail on its first validate. A plain JS config can
    // still pass it, hence a runtime check rather than types alone.
    expect(() => toRunTypesOptions({runTypes: {emitMode: 'functions' as never}})).toThrow(
      /emitMode: 'functions' is not supported/
    );
  });

  it('accepts the modes mion does support', () => {
    expect(toRunTypesOptions({runTypes: {emitMode: 'code'}}).emitMode).toBe('code');
    expect(toRunTypesOptions({runTypes: {emitMode: 'both'}}).emitMode).toBe('both');
    expect(toRunTypesOptions({runTypes: {emitMode: 'ts'}}).emitMode).toBe('ts');
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

// Read as source: a second literal mapping beside toRunTypesOptions is invisible to a behavioural test.
describe('the preset maps no resolver options on its own', () => {
  // Named by path so the preset moving fails loudly here.
  const file = 'vite/mionVitePlugin.ts';
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

  it('builds resolver options through toRunTypesOptions', () => {
    expect(source).toMatch(/toRunTypesOptions\(/);
  });

  it('does not re-derive keys toRunTypesOptions already owns', () => {
    // A key the mapping sets, assigned by the preset itself, is a duplicate or a divergence.
    for (const key of ['binary:', 'tsconfig:', 'downgradeErrors:', 'patternSampleCount:', 'jsRuntime:']) {
      expect(source, `${file} assigns ${key} itself instead of via toRunTypesOptions`).not.toContain(`    ${key}`);
    }
  });
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

  it('rejects an unknown mode', () => {
    expect(() => toRunTypesOptions({client: {routes: 'all' as never}})).toThrow(
      /unknown client routes "all", expected 'bundle' \| 'fetch'/
    );
  });

  it('is refused by the plain adapters too, before any resolver starts', async () => {
    const plugin = runtypesVite({clientRoutes: 'all' as never}) as unknown as {buildStart: () => Promise<void>};
    await expect(plugin.buildStart()).rejects.toThrow(/unknown client routes "all", expected 'bundle' \| 'fetch'/);
  });

  it('is reached through the preset', () => {
    expect(() => mionVitePlugin({client: {routes: 'all' as never}})).toThrow(/client routes/);
  });
});

// No typecheck covers the exports map: a subpath that stops resolving fails only when a consumer imports it.
// `runtypes/next/loader` is the sharp one: Turbopack resolves loaders with CJS require conditions,
// so an `import`-only entry fails the build with "Package subpath is not defined by exports".
describe('the published exports map', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };

  it('declares every entry the preset and every bundler lane need', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [
        '.',
        './eslint',
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
    // Turbopack resolves loaders with require conditions (../src/runtypes/next/AGENTS.md, 5).
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
