// Ambient declarations without import edges must survive setSources edits; unresolved names must report diagnostics.
// AGENTS.md requires both marker forms and equal ids.

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
  it('an ambient .d.ts in the include set resolves after setSources edits: no marker-any-from-unresolved-name, both getRunTypeId shapes share one id', async () => {
    const result = await scanAmbientProject(true);
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain('marker-any-from-unresolved-name');
    expect(result.sites).toHaveLength(3);
    const reflectIds = result.sites.filter((site) => !site.fnId).map((site) => site.id);
    expect(reflectIds).toHaveLength(2);
    expect(reflectIds[0]).toBe(reflectIds[1]);
    // The validate site is over the same T — one id across all three sites.
    expect(new Set(result.sites.map((site) => site.id)).size).toBe(1);
  });

  it('without the ambient file the same edit fails LOUDLY with marker-any-from-unresolved-name naming the reference, never silently as any', async () => {
    const result = await scanAmbientProject(false);
    const markerAnyFromUnresolvedName = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.code === 'marker-any-from-unresolved-name'
    );
    expect(markerAnyFromUnresolvedName.length).toBeGreaterThan(0);
    expect(markerAnyFromUnresolvedName[0].args).toContain('AmbientMeta');
  });
});
