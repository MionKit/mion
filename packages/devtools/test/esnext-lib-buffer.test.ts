// Reflecting a Buffer field on the ESNext lib — the JS-side pin of the MKR009 fix.
//
// A project compiled against lib.esnext could not reflect any type whose data
// reached Node's Buffer: the walk descended into the Uint8Array members Buffer
// inherits, ESNext's iterator methods return IteratorObject, and that
// re-instantiates itself at every level, so the site was refused with MKR009
// and the build halted. ES2023 was fine only because its iterator methods
// return the non-self-instantiating IterableIterator, which is why the bug hid
// behind whatever lib the consumer happened to compile against.
//
// The lib is written into a real tsconfig here rather than inherited, so the
// lib version is part of the test instead of an accident of the repo config.
//
// Marker coverage rule (CLAUDE.md): both getRunTypeId call shapes, with id
// equality asserted between them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BIN, hasBinary, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

// Node's Buffer as @types/node declares it: a global interface extending
// Uint8Array. Declared inline so the suite needs no @types/node install.
const BUFFER_DTS = `declare interface Buffer extends Uint8Array<ArrayBuffer> {
  write(text: string): number;
  toString(encoding?: string): string;
}
`;

const CONSUMER_SRC = `import {getRunTypeId, createValidateFn} from '@mionjs/run-types';

// static getRunTypeId<T>()
getRunTypeId<{id: number; blob: Buffer}>();

// value-first getRunTypeId(value)
declare const row: {id: number; blob: Buffer};
getRunTypeId(row);

export const validateRow = createValidateFn<{id: number; blob: Buffer}>();
`;

const tsconfigFor = (lib: string): string =>
  JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
      target: 'ESNext',
      lib: [lib],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    },
  });

async function scanUnderLib(lib: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-esnext-buffer-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfigFor(lib));
  fs.writeFileSync(path.join(dir, 'node.d.ts'), BUFFER_DTS);
  const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
  try {
    await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': CONSUMER_SRC});
    return await resolver.scanFiles(['consumer.ts'], {includeRunTypes: true, includeRtDiagnostics: true});
  } finally {
    resolver.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe.runIf(hasBinary())('ESNext lib — a Buffer field reflects', () => {
  it('resolves on lib.esnext with no MKR009, both getRunTypeId shapes sharing one id', async () => {
    const result = await scanUnderLib('esnext');
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain('MKR009');
    expect(result.sites).toHaveLength(3);
    const reflectIds = result.sites.filter((site) => !site.fnId).map((site) => site.id);
    expect(reflectIds).toHaveLength(2);
    expect(reflectIds[0]).toBe(reflectIds[1]);
    expect(new Set(result.sites.map((site) => site.id)).size).toBe(1);
  });

  it('lands on the same id under lib.es2023, so the lib version does not change the type', async () => {
    const [esnext, es2023] = await Promise.all([scanUnderLib('esnext'), scanUnderLib('es2023')]);
    expect(esnext.sites[0].id).toBe(es2023.sites[0].id);
  });
});
