/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {build, type Plugin, type RollupOutput} from 'vite';
import {mionVitePlugin} from './mionVitePlugin.ts';

// serverMappersModule.spec.ts asserts what the generated module SAYS. This one asserts that a real
// rollup can act on it: build mode emits `import * as __mionMapper0 from "<abs path into the CLIENT
// build's __runtypes/types/ tree>"`, and whether that import resolves — and inlines the tuple into a
// self-contained artifact — is a property only an actual build can show.
//
// That check used to exist only as a side effect of `packages/test-server`'s .dist build, which is
// why it also made `pnpm run build` fail on a clean tree (the manifest it consumed was written by the
// CLIENT's test run). See docs/done/pnpm-build-fails-on-clean-tree.md. Coverage by accident is what
// this whole PR is about removing, so the check lives here now, deterministic and self-contained.

const MAPPER_KEY = 'rt::abc123';
// The two bodies are deliberately DIFFERENT. A row carrying `module` must be served by importing that
// module; the `code` field is only the fallback lane for a row without one. Identical strings would
// let this spec pass either way, proving nothing about resolution.
const GENERATED_BODY = 'return (order) => order.idFromGeneratedModule;';
const FALLBACK_CODE = 'return (order) => order.idFromManifestCopy;';
// Shaped like a real generated pure-fn module: PURE_FN_TUPLE_KEYS is
// [entryKind, deps, ini, key, bodyHash, paramNames, code, pureFnDependencies, createPureFn],
// so slot 3 is the key the generated module matches on and slot 6 carries the body.
const PURE_FN_MODULE =
  `export const __rt_pf$2Frt$2Fabc123=[2,,,'${MAPPER_KEY}','BodyHash01',['order'],` + `'${GENERATED_BODY}',[]];\n`;
const ENTRY = `import {initMionRouter} from '@mionjs/router';\nawait initMionRouter({});\n`;

/** The transport plugin on its own — the mion plugin needs a real program and is not under test. */
function mapperPlugin(manifest: string): Plugin {
  const plugins = mionVitePlugin({serverMappers: {consume: manifest}}) as unknown as Plugin[];
  const plugin = plugins.flat().find((p) => (p as Plugin)?.name === 'mion-server-mappers');
  if (!plugin) throw new Error('mion-server-mappers plugin not found');
  return plugin as Plugin;
}

describe('serverMapFrom transport through a real vite build', () => {
  let root: string;
  let manifest: string;
  let mapperModule: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mion-mappers-build-'));
    // the CLIENT build's generated tree, exactly where a harvested row points
    const generated = path.join(root, 'client', '__runtypes', 'types', 'pf', 'rt');
    mkdirSync(generated, {recursive: true});
    mapperModule = path.join(generated, 'abc123.js');
    writeFileSync(mapperModule, PURE_FN_MODULE);

    manifest = path.join(root, 'harvested.json');
    writeFileSync(manifest, JSON.stringify([{key: MAPPER_KEY, module: mapperModule, code: FALLBACK_CODE}]));

    mkdirSync(path.join(root, 'src'), {recursive: true});
    writeFileSync(path.join(root, 'src', 'server.ts'), ENTRY);
  });
  afterEach(() => rmSync(root, {recursive: true, force: true}));

  /** Builds the fixture server and returns the single emitted chunk's code. */
  async function buildServer(): Promise<string> {
    const result = await build({
      root,
      logLevel: 'silent',
      plugins: [mapperPlugin(manifest)],
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

  it('resolves the generated pure-fn module and inlines its tuple into the artifact', async () => {
    const code = await buildServer();
    // the GENERATED module's body is in the artifact and the manifest's copy is not — the only way
    // that happens is rollup resolving the absolute path into the client's tree and inlining it
    expect(code).toContain(GENERATED_BODY);
    expect(code).not.toContain(FALLBACK_CODE);
    // upstream's real bodyHash rides along, which the old copy-the-body lane could not carry
    expect(code).toContain('BodyHash01');
    expect(code).toContain('registerServerMapperTuple');
  });

  it('leaves the artifact self-contained — no manifest read at runtime', async () => {
    const code = await buildServer();
    // the client's generated tree is a BUILD-time input only; an artifact that reads a cache off
    // disk at boot is not deployable to lambda or the edge
    expect(code).not.toContain('node:fs');
    expect(code).not.toContain(manifest);
    expect(code).not.toContain('installServerMapperReader');
  });

  it('fails the build when the pure-fn module the manifest points at is gone', async () => {
    rmSync(mapperModule);
    // a stale manifest pointing at a pruned module must not yield a bundle whose mapper silently
    // never registers — that would only surface as a rejected flow at request time
    await expect(buildServer()).rejects.toThrow();
  });
});
