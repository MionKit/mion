// Program roots vs ambient declarations — the JS-side pin of
// docs/done/program-roots-lose-ambient-declarations.md on the daemon surface.
//
// Production's per-edit shape (handleHotUpdate, the lint worker) pushes ONE
// file into setSources; anything tsc would include WITHOUT an import — an
// ambient `.d.ts` in the tsconfig include set — used to vanish from the
// rebuilt program, silently degrading the type to `any` and changing the
// site's id. The daemon now unions the config's declaration files into every
// setSources-built program's roots, and when a written name still cannot
// resolve, MKR013 fires instead of silence.
//
// Marker coverage rule (CLAUDE.md): the fixture uses BOTH getRunTypeId call
// shapes — static getRunTypeId<T>() and value-first getRunTypeId(value) —
// with id equality asserted between them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BIN, hasBinary, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

const AMBIENT_DTS = `declare interface AmbientMeta {
  a: string;
  b: number;
}
`;

const AMBIENT_CONSUMER_SRC = `import {getRunTypeId, createValidateFn} from '@mionjs/run-types';

// static getRunTypeId<T>()
getRunTypeId<{value: AmbientMeta}>();

// value-first getRunTypeId(value)
declare const sample: {value: AmbientMeta};
getRunTypeId(sample);

export const validateAmbient = createValidateFn<{value: AmbientMeta}>();
`;

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    target: 'ES2022',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
});

// scanAmbientProject drives the production per-edit shape: the tsconfig and
// the ambient .d.ts (when present) live on REAL disk; setSources carries only
// the consumer buffer (plus the marker overlay, which never rides the roots).
// Two setSources model the HMR pivot — the second edit is where the sticky
// re-rooting used to lose the ambient for the rest of the session.
async function scanAmbientProject(withAmbientOnDisk: boolean) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-ambient-decls-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  if (withAmbientOnDisk) fs.writeFileSync(path.join(dir, 'ambient.d.ts'), AMBIENT_DTS);
  const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
  try {
    await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': 'export const before = 1;\n'});
    await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': AMBIENT_CONSUMER_SRC});
    return await resolver.scanFiles(['consumer.ts'], {includeRunTypes: true, includeRtDiagnostics: true});
  } finally {
    resolver.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe.runIf(hasBinary())('daemon surface — ambient declarations survive the per-edit rebuild', () => {
  it('an ambient .d.ts in the include set resolves after setSources edits: no MKR013, both getRunTypeId shapes share one id', async () => {
    const result = await scanAmbientProject(true);
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain('MKR013');
    expect(result.sites).toHaveLength(3);
    const reflectIds = result.sites.filter((site) => !site.fnId).map((site) => site.id);
    expect(reflectIds).toHaveLength(2);
    expect(reflectIds[0]).toBe(reflectIds[1]);
    // The validate site is over the same T — one id across all three sites.
    expect(new Set(result.sites.map((site) => site.id)).size).toBe(1);
  });

  it('without the ambient file the same edit fails LOUDLY with MKR013 naming the reference, never silently as any', async () => {
    const result = await scanAmbientProject(false);
    const mkr013 = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.code === 'MKR013');
    expect(mkr013.length).toBeGreaterThan(0);
    expect(mkr013[0].args).toContain('AmbientMeta');
  });
});
