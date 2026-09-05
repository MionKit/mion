/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach, vi} from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {mionVitePlugin} from './mionVitePlugin.ts';
import {
  batchChecksum,
  batchesModulePath,
  readBatchesModule,
  renderBatchesModule,
  writeBatchesModule,
  type BatchMapperEntry,
  type BatchTableEntry,
} from '../options.ts';

// The batch transport is ONE generated module, `<serverRoot>/.mion/rpc/batches.generated.js`,
// written by the client build and imported by the server build from the module that calls
// createMionRouter. A real file, never a virtual module (virtual modules lose to
// rollupOptions.external and survived verbatim into production bundles), and a STABLE name: once
// imported it is a node in vite's graph, so a rewrite is an ordinary change vite invalidates by
// itself. The checksum lives inside the file and is verified before the import is injected.

const ENTRY = `import {Routes, createMionRouter} from '@mionjs/router';\nexport const mion = createMionRouter();\nexport const api = mion.initRoutes({} as Routes);\n`;
// A harvested mapper points at the pure-fn module RunTypes generated in the CLIENT build; the
// server imports the tuple out of it, so mion never keeps a copy of the body.
const MAPPER: BatchMapperEntry = {key: 'rt::abc123', module: '/abs/client/.mion/types/pf/rt/abc123.js'};
const BATCH: BatchTableEntry = {
  routes: ['orders/getById', 'users/getById'],
  mappings: [{fromId: 'orders/getById', toId: 'users/getById', paramIndex: 0, mapperKey: MAPPER.key}],
};
const TABLE = {b_test123: BATCH};

/** Writes the module the way the client build's harvest does, and returns its path. */
function writeModule(
  root: string,
  table: Record<string, BatchTableEntry> = TABLE,
  mappers = [MAPPER],
  clientRoot = root
): string {
  writeBatchesModule(root, clientRoot, new Map(Object.entries(table)), new Map(mappers.map((mapper) => [mapper.key, mapper])));
  return batchesModulePath(root);
}

/** The server-side plugin on its own — the mion plugin needs a real program and is not under test. */
function importPlugin(): any {
  const plugins = mionVitePlugin({}) as any[];
  const plugin = plugins.flat().find((p) => p?.name === 'mion-batches');
  if (!plugin) throw new Error('mion-batches plugin not found');
  return plugin;
}

/** Drives the plugin's hooks the way vite would, and returns what it injected. */
function run(root: string, command: 'build' | 'serve', entryCode = ENTRY, entryId = path.resolve(root, 'src', 'server.ts')) {
  const plugin = importPlugin();
  plugin.configResolved({root, command});
  plugin.buildStart.call({});
  return {plugin, transformed: plugin.transform.call({}, entryCode, entryId)};
}

describe('batch generated module', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-batches-'));
    mkdirSync(path.join(root, 'src'), {recursive: true});
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  it('renders a self-contained module: mapper import, tuple by key slot, checksum, whole-table replace', () => {
    const generated = renderBatchesModule('/abs/client', TABLE, [MAPPER]);
    // the body is RunTypes' to own: mion imports the module it already generated rather than
    // shipping a second copy of the same source, so the entry carries its real bodyHash
    expect(generated).toContain(`import * as __mionMapper0 from "${MAPPER.module}"`);
    expect(generated).toContain('registerInputMapperTuple');
    // The export name encodes the module's logical path (`__rt_pf$2Frt$2Fabc123`) with an escaping
    // rule that is not public, and "take the single export" holds only until someone sets
    // moduleMode: 'allSingle', which puts every pure fn in ONE module. PURE_FN_TUPLE_KEYS[3] is
    // `key` in every mode, so the slot is the stable handle.
    expect(generated).toContain(`t[3] === "${MAPPER.key}"`);
    expect(generated).not.toContain('__rt_pf');
    expect(generated).toContain(`export const checksum = "${batchChecksum(['b_test123'])}";`);
    // who wrote it, so an empty harvest from ANOTHER project never removes it
    expect(generated).toContain('export const clientRoot = "/abs/client";');
    // the WHOLE table, replaced: a re-evaluation after a dev rewrite must leave nothing from before
    expect(generated).toContain(`replaceBatches(${JSON.stringify(TABLE)});`);
    expect(generated).not.toContain('registerBatches(');
    // an artifact that reads anything off disk at boot is not edge/lambda deployable
    expect(generated).not.toContain('node:fs');
  });

  it('writes the module under <root>/.mion/rpc with a stable name, leaving no temp file behind', () => {
    const file = writeModule(root);
    expect(file).toBe(path.join(root, '.mion', 'rpc', 'batches.generated.js'));
    expect(readFileSync(file, 'utf8')).toBe(renderBatchesModule(root, TABLE, [MAPPER]));
    expect(readdirSync(path.dirname(file))).toEqual(['batches.generated.js']);
  });

  it('skips a byte-identical rewrite, so vite sees no spurious change', () => {
    const file = writeModule(root);
    const past = new Date(Date.now() - 60_000);
    utimesSync(file, past, past);
    writeModule(root);
    expect(statSync(file).mtimeMs).toBe(past.getTime());
  });

  it('rewrites in place when the table changes', () => {
    const file = writeModule(root);
    writeModule(root, {b_other: {routes: ['users/getById']}}, []);
    const generated = readFileSync(file, 'utf8');
    expect(generated).toContain('b_other');
    expect(generated).not.toContain('b_test123');
    expect(generated).toContain(`export const checksum = "${batchChecksum(['b_other'])}";`);
  });

  it('removes the module for an empty table: a server without batches must import nothing', () => {
    const file = writeModule(root);
    writeBatchesModule(root, root, new Map(), new Map());
    expect(existsSync(file)).toBe(false);
  });

  it("leaves a module another client root wrote alone: a separate server project's harvest sees no batches", () => {
    const file = writeModule(root, TABLE, [MAPPER], '/abs/client');
    writeBatchesModule(root, root, new Map(), new Map());
    expect(existsSync(file)).toBe(true);
  });

  it('imports only the mappers the batches reference', () => {
    const file = writeModule(root, TABLE, [MAPPER, {key: 'rt::unused', module: '/abs/client/.mion/types/pf/rt/unused.js'}]);
    expect(readFileSync(file, 'utf8')).not.toContain('rt::unused');
  });

  it('verifies the checksum against the ids in the file before anything imports it', () => {
    const file = writeModule(root);
    expect(readBatchesModule(root)).toEqual({file, checksum: batchChecksum(['b_test123']), clientRoot: root});
    // a hand edit that renames an id leaves the declared checksum stale
    writeFileSync(file, readFileSync(file, 'utf8').replace('"b_test123"', '"b_edited"'));
    expect(() => readBatchesModule(root)).toThrow(/checksum/);
    // something that is not ours at all
    writeFileSync(file, 'export {};\n');
    expect(() => readBatchesModule(root)).toThrow(/not a module the mion client build wrote/);
    rmSync(file);
    expect(readBatchesModule(root)).toBeUndefined();
  });

  it('injects the import into the module that calls createMionRouter', () => {
    writeModule(root);
    const {transformed} = run(root, 'build');
    expect(transformed.code).toContain("import '../.mion/rpc/batches.generated.js';");
    expect(transformed.code).toContain('createMionRouter');
  });

  it('prefixes the import for a root-level importer, since .mion/… is a bare specifier', () => {
    // A server entry beside the .mion folder relates to the generated file as
    // `.mion/rpc/batches.generated.js`: it starts with a dot but is not `./`-relative, so it
    // must still be prefixed or the bundler resolves it as a package name.
    writeModule(root);
    const {transformed} = run(root, 'build', ENTRY, path.resolve(root, 'server.ts'));
    expect(transformed.code).toContain("import './.mion/rpc/batches.generated.js';");
  });

  it('appends rather than prepends, so map: null does not lie about moved code', () => {
    writeModule(root);
    const {transformed} = run(root, 'build');
    // ESM imports are hoisted and evaluated before the module body wherever they sit, so appending
    // still registers the batches first — while every original line keeps its number, which is the
    // only thing that makes `map: null` ("this transform did not move code") true.
    expect(transformed.code.startsWith(ENTRY)).toBe(true);
    expect(transformed.map).toBeNull();
  });

  it.each([
    ['namespace import', `import * as router from '@mionjs/router';\nexport const mion = router.createMionRouter();\n`],
    ['aliased named import', `import {createMionRouter as create} from '@mionjs/router';\nexport const mion = create();\n`],
    [
      'multi-line import list',
      `import {\n    Routes,\n    createMionRouter,\n} from '@mionjs/router';\nexport const mion = createMionRouter();\n`,
    ],
  ])('detects the router entry through a %s', (_label, code) => {
    // each of these silently got NO injection, and no warning, when detection required one
    // specific braced-named-import shape
    writeModule(root);
    expect(run(root, 'build', code).transformed?.code).toContain('batches.generated.js');
  });

  it('leaves modules that never touch the router alone', () => {
    writeModule(root);
    const unrelated = `import {resetRouter} from '@mionjs/router';\nresetRouter();\n`;
    expect(run(root, 'build', unrelated).transformed).toBeUndefined();
    // a mention in a comment is not an import
    expect(run(root, 'build', '// createMionRouter lives in @mionjs/router\n').transformed).toBeUndefined();
  });

  it('injects nothing when no module was written, so a server without batches is untouched', () => {
    const {plugin, transformed} = run(root, 'build');
    expect(transformed).toBeUndefined();
    expect(() => plugin.buildEnd.call({})).not.toThrow();
  });

  it('fails the build when the module exists but was injected nowhere', () => {
    writeModule(root);
    const {plugin} = run(root, 'build', 'export const x = 1;\n', path.resolve(root, 'src/unrelated.ts'));
    // silently shipping a bundle whose batches never register would only fail at request time
    expect(() => plugin.buildEnd.call({})).toThrow(/createMionRouter/);
  });

  it('stays quiet in serve mode, where a miss surfaces immediately as an unknown batch id', () => {
    writeModule(root);
    const {plugin} = run(root, 'serve', 'export const x = 1;\n', path.resolve(root, 'src/unrelated.ts'));
    expect(() => plugin.buildEnd.call({})).not.toThrow();
  });

  it('a corrupted module fails the build, and is logged without registering in serve', () => {
    const file = writeModule(root);
    writeFileSync(file, readFileSync(file, 'utf8').replace('"b_test123"', '"b_edited"'));
    expect(() => run(root, 'build')).toThrow(/checksum/);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(run(root, 'serve').transformed).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/checksum/));
    error.mockRestore();
  });

  it('is always wired: there is no option to turn the transport on', () => {
    const plugins = mionVitePlugin({}) as any[];
    expect(plugins.flat().find((p) => p?.name === 'mion-batches')).toBeDefined();
  });
});
