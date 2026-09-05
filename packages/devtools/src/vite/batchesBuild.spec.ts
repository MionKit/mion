/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build, type Plugin} from 'vite';
// vite 8 stopped re-exporting rollup's RollupOutput; derive it from build() itself so
// this cannot drift with the vite version again.
type RollupOutput = Extract<Awaited<ReturnType<typeof build>>, {output: unknown}>;
import {mionVitePlugin} from './mionVitePlugin.ts';
import {batchesModulePath, writeBatchesModule} from '../options.ts';

// batchesModule.spec.ts asserts what the generated module SAYS. This one asserts that a real
// rollup can act on it with NO option on the server side: the module emits `import * as
// __mionMapper0 from "<abs path into the CLIENT build's .mion/types/ tree>"`, and whether that
// import resolves — and inlines the tuple into a self-contained artifact — is a property only an
// actual build can show.
//
// That check used to exist only as a side effect of `packages/test-server`'s .dist build, which is
// why it also made `pnpm run build` fail on a clean tree (the module it imported was written by the
// CLIENT's test run). The check lives here now, deterministic and self-contained.

const MAPPER_KEY = 'rt::abc123';
const GENERATED_BODY = 'return (order) => order.idFromGeneratedModule;';
// Shaped like a real generated pure-fn module: PURE_FN_TUPLE_KEYS is
// [entryKind, deps, ini, key, bodyHash, paramNames, code, pureFnDependencies, createPureFn],
// so slot 3 is the key the generated module matches on and slot 6 carries the body.
const PURE_FN_MODULE =
  `export const __rt_pf$2Frt$2Fabc123=[2,,,'${MAPPER_KEY}','BodyHash01',['order'],` + `'${GENERATED_BODY}',[]];\n`;
const ENTRY = `import {createMionRouter} from '@mionjs/router';\ncreateMionRouter().initRoutes({});\n`;

/** The server-side plugin on its own — the mion plugin needs a real program and is not under test. */
function importPlugin(): Plugin {
  const plugins = mionVitePlugin({}) as unknown as Plugin[];
  const plugin = plugins.flat().find((p) => (p as Plugin)?.name === 'mion-batches');
  if (!plugin) throw new Error('mion-batches plugin not found');
  return plugin as Plugin;
}

describe('batch transport through a real vite build', () => {
  let root: string;
  let mapperModule: string;
  let batchesModule: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-batches-build-'));
    // the CLIENT build's generated tree, exactly where a harvested mapper points
    const generated = path.join(root, 'client', '.mion', 'types', 'pf', 'rt');
    mkdirSync(generated, {recursive: true});
    mapperModule = path.join(generated, 'abc123.js');
    writeFileSync(mapperModule, PURE_FN_MODULE);

    // what the client build's harvest writes into THIS (server) root
    writeBatchesModule(
      root,
      path.join(root, 'client'),
      new Map([
        [
          'b_test123',
          {
            routes: ['orders/getById', 'users/getById'],
            mappings: [{fromId: 'orders/getById', toId: 'users/getById', paramIndex: 0, mapperKey: MAPPER_KEY}],
          },
        ],
      ]),
      new Map([[MAPPER_KEY, {key: MAPPER_KEY, module: mapperModule}]])
    );
    batchesModule = batchesModulePath(root);

    mkdirSync(path.join(root, 'src'), {recursive: true});
    writeFileSync(path.join(root, 'src', 'server.ts'), ENTRY);
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  /** Builds the fixture server and returns the single emitted chunk's code. */
  async function buildServer(): Promise<string> {
    const result = await build({
      root,
      logLevel: 'silent',
      plugins: [importPlugin()],
      build: {
        write: false,
        minify: false,
        lib: {entry: path.join(root, 'src', 'server.ts'), formats: ['es'], fileName: 'server'},
        rollupOptions: {external: ['@mionjs/router', '@mionjs/core']},
      },
    });
    // vite 7 hands back one RollupOutput per built environment; older shapes hand back just one
    const outputs = (Array.isArray(result) ? result : [result]) as RollupOutput[];
    const chunk = outputs.flatMap((out) => out.output ?? []).find((o) => o.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw new Error('no chunk emitted');
    return chunk.code;
  }

  it('picks the module up with no option and inlines the generated tuple into the artifact', async () => {
    const code = await buildServer();
    // the GENERATED module's body is in the artifact — the only way that happens is rollup
    // resolving the absolute path into the client's tree and inlining it
    expect(code).toContain(GENERATED_BODY);
    // upstream's real bodyHash rides along, which the old copy-the-body lane could not carry
    expect(code).toContain('BodyHash01');
    expect(code).toContain('registerInputMapperTuple');
    // the batch table rides as static data next to the mappers, replacing the whole table
    expect(code).toContain('replaceBatches');
    expect(code).toContain('orders/getById');
  });

  it('leaves the artifact self-contained — nothing read off disk at runtime', async () => {
    const code = await buildServer();
    // the client's generated tree and the rpc module are BUILD-time inputs only; an artifact that
    // reads a cache off disk at boot is not deployable to lambda or the edge
    expect(code).not.toContain('node:fs');
    expect(code).not.toContain('readFileSync');
    // the checksum is checked at BUILD time and does not ride along
    expect(code).not.toContain('checksum');
  });

  it('fails the build when the pure-fn module the table points at is gone', async () => {
    rmSync(mapperModule);
    // a stale module pointing at a pruned tree must not yield a bundle whose mapper silently
    // never registers — that would only surface as an unknown batch id at request time
    await expect(buildServer()).rejects.toThrow();
  });

  it('fails the build on a checksum mismatch, before anything imports the module', async () => {
    writeFileSync(batchesModule, readFileSync(batchesModule, 'utf8').replace('"b_test123"', '"b_edited"'));
    await expect(buildServer()).rejects.toThrow(/checksum/);
  });

  it('builds a server without batches when no module was written', async () => {
    rmSync(batchesModule);
    const code = await buildServer();
    expect(code).not.toContain('replaceBatches');
  });
});
