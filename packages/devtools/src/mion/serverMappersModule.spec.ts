/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mionVitePlugin} from './mionVitePlugin.ts';

// The serverMapFrom transport used to be a `virtual:mion/server-mappers` module. Virtual modules lose
// to rollupOptions.external — rollup tests external against the RESOLVED id, and `\0virtual:…` still
// matches a catch-all like /^[^./]/ — so the import was externalized and survived verbatim into
// production bundles, where nothing resolves it, and the documented build-time inlining never
// happened. It is a real generated file now, and the plugin injects the import itself.

const ENTRY = `import {Routes, initMionRouter, route} from '@mionjs/router';\nawait initMionRouter({} as Routes);\n`;
const MAPPER = {key: 'rt::abc123', code: 'return (order) => order.userId;'};
// A harvested row as it looks since the transport stopped copying bodies: it points at the pure-fn
// module @ts-runtypes generated in the CLIENT build, and the server imports the tuple out of it.
const MAPPER_WITH_MODULE = {
  ...MAPPER,
  module: '/abs/client/__runtypes/types/pf/rt/abc123.js',
};

/** Drives the plugin's hooks the way vite would, and returns what it generated/injected. */
function run(root: string, manifest: string, command: 'build' | 'serve', entryCode = ENTRY, injectInto?: string | string[]) {
  const plugins = mionVitePlugin({serverMappers: {consume: manifest, injectInto}}) as any[];
  const plugin = plugins.flat().find((p) => p?.name === 'mion-server-mappers');
  plugin.configResolved({root, command});
  plugin.buildStart.call({});
  const generatedFile = path.resolve(root, '.mion/server-mappers.generated.js');
  const entryId = path.resolve(root, 'src', 'server.ts');
  return {
    plugin,
    generatedFile,
    generated: existsSync(generatedFile) ? readFileSync(generatedFile, 'utf8') : undefined,
    transformed: plugin.transform.call({}, entryCode, entryId),
  };
}

describe('serverMapFrom generated module', () => {
  let root: string;
  let manifest: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-mappers-'));
    manifest = path.join(root, 'harvested.json');
    writeFileSync(manifest, JSON.stringify([MAPPER]));
    mkdirSync(path.join(root, 'src'), {recursive: true});
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  it('writes a real file rather than serving a virtual module', () => {
    const {plugin, generated} = run(root, manifest, 'build');
    expect(generated).toBeDefined();
    // the failure mode being designed out: nothing to externalize, nothing to declare
    expect(plugin.resolveId).toBeUndefined();
    expect(plugin.load).toBeUndefined();
    expect(generated).not.toContain('virtual:');
  });

  it('imports the generated pure-fn module and registers its tuple in build mode', () => {
    writeFileSync(manifest, JSON.stringify([MAPPER_WITH_MODULE]));
    const {generated} = run(root, manifest, 'build');
    // the body is @ts-runtypes' to own: mion imports the module it already generated rather than
    // shipping a second copy of the same source, so the entry carries its real bodyHash
    expect(generated).toContain(`import * as __mionMapper0 from "${MAPPER_WITH_MODULE.module}"`);
    expect(generated).toContain('registerServerMapperTuple');
    expect(generated).not.toContain(MAPPER.code);
    // an artifact that reads a cache off disk at boot is not edge/lambda deployable
    expect(generated).not.toContain('node:fs');
  });

  it('matches the tuple by key slot, not by the mangled export name', () => {
    writeFileSync(manifest, JSON.stringify([MAPPER_WITH_MODULE]));
    const {generated} = run(root, manifest, 'build');
    // The export name encodes the module's logical path (`__rt_pf$2Frt$2Fabc123`) with an escaping
    // rule that is not public, and "take the single export" holds only until someone sets
    // moduleMode: 'allSingle', which puts every pure fn in ONE module. PURE_FN_TUPLE_KEYS[3] is
    // `key` in every mode, so the slot is the stable handle.
    expect(generated).toContain(`t[3] === "${MAPPER.key}"`);
    expect(generated).not.toContain('__rt_pf');
  });

  it('falls back to the code payload for a row with no module path', () => {
    // older @ts-runtypes reports, or a hand-written manifest: dropping the mapper would only
    // surface as a rejected flow at request time, so the old lane still registers it
    const {generated} = run(root, manifest, 'build');
    expect(generated).toContain('registerServerMappers');
    expect(generated).toContain(MAPPER.code);
    expect(generated).not.toContain('node:fs');
  });

  it('installs the lazy re-reader in serve mode, covering the client-build race', () => {
    const {generated} = run(root, manifest, 'serve');
    expect(generated).toContain('installServerMapperReader');
    expect(generated).toContain(manifest);
    // the body must NOT be frozen in at config time — the client build may not have run yet
    expect(generated).not.toContain(MAPPER.code);
  });

  it('injects the import into the module that calls initMionRouter', () => {
    const {transformed, generatedFile} = run(root, manifest, 'build');
    expect(transformed.code).toContain("import '../.mion/server-mappers.generated.js';");
    expect(transformed.code).toContain('initMionRouter');
    expect(existsSync(generatedFile)).toBe(true);
  });

  it('appends rather than prepends, so map: null does not lie about moved code', () => {
    const {transformed} = run(root, manifest, 'build');
    // ESM imports are hoisted and evaluated before the module body wherever they sit, so appending
    // still registers the mappers first — while every original line keeps its number, which is the
    // only thing that makes `map: null` ("this transform did not move code") true.
    expect(transformed.code.startsWith(ENTRY)).toBe(true);
    expect(transformed.map).toBeNull();
  });

  it.each([
    ['namespace import', `import * as router from '@mionjs/router';\nawait router.initMionRouter({});\n`],
    ['aliased named import', `import {initMionRouter as init} from '@mionjs/router';\nawait init({});\n`],
    [
      'multi-line import list',
      `import {\n    Routes,\n    route,\n    initMionRouter,\n} from '@mionjs/router';\nawait initMionRouter({});\n`,
    ],
  ])('detects the router entry through a %s', (_label, code) => {
    // each of these silently got NO injection, and no warning, when detection required one
    // specific braced-named-import shape
    expect(run(root, manifest, 'build', code).transformed?.code).toContain('server-mappers.generated.js');
  });

  it('injects into an explicit injectInto target, whatever it imports', () => {
    const opaque = `export const routes = buildFromSomeLocalBarrel();\n`;
    const {transformed} = run(root, manifest, 'build', opaque, 'src/server.ts');
    expect(transformed.code).toContain('server-mappers.generated.js');
  });

  it('fails the build when nothing was injected, instead of shipping mappers nobody registers', () => {
    const plugins = mionVitePlugin({serverMappers: {consume: manifest}}) as any[];
    const plugin = plugins.flat().find((p: any) => p?.name === 'mion-server-mappers');
    plugin.configResolved({root, command: 'build'});
    plugin.buildStart.call({});
    plugin.transform.call({}, 'export const x = 1;\n', path.resolve(root, 'src/unrelated.ts'));
    expect(() => plugin.buildEnd.call({})).toThrow(/injectInto/);
  });

  it('stays quiet in serve mode, where a miss surfaces immediately as a rejected flow', () => {
    const plugins = mionVitePlugin({serverMappers: {consume: manifest}}) as any[];
    const plugin = plugins.flat().find((p: any) => p?.name === 'mion-server-mappers');
    plugin.configResolved({root, command: 'serve'});
    plugin.buildStart.call({});
    expect(() => plugin.buildEnd.call({})).not.toThrow();
  });

  it('leaves modules that never touch the router alone', () => {
    const unrelated = `import {route} from '@mionjs/router';\nexport const r = route(() => 'x');\n`;
    expect(run(root, manifest, 'build', unrelated).transformed).toBeUndefined();
    // a mention in a comment is not an import
    expect(run(root, manifest, 'build', '// initMionRouter lives in @mionjs/router\n').transformed).toBeUndefined();
  });

  it('is not wired at all when no manifest is consumed', () => {
    const plugins = mionVitePlugin({}) as any[];
    expect(plugins.flat().find((p) => p?.name === 'mion-server-mappers')).toBeUndefined();
  });

  it('fails the build loudly when a consumed manifest is missing', () => {
    const plugins = mionVitePlugin({serverMappers: {consume: path.join(root, 'absent.json')}}) as any[];
    const plugin = plugins.flat().find((p) => p?.name === 'mion-server-mappers');
    plugin.configResolved({root, command: 'build'});
    // silently shipping a bundle with no mappers would only fail at request time
    expect(() => plugin.buildStart.call({})).toThrow(/manifest not found/);
  });
});
