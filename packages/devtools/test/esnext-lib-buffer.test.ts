// ESNext Buffer iterators reinstantiate IteratorObject recursively; ES2023 IterableIterator hid this failure.
// An explicit tsconfig lib keeps coverage independent of repo defaults; see AGENTS.md marker coverage.

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
  it('resolves on lib.esnext with no marker-self-instantiating-generic, both getRunTypeId shapes sharing one id', async () => {
    const result = await scanUnderLib('esnext');
    expect((result.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain('marker-self-instantiating-generic');
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
