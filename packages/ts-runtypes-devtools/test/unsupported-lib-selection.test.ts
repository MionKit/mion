// A tsconfig `lib` with no base ECMAScript edition, through the daemon the
// plugin drives — the JS-side pin of CFG002.
//
// Without a base edition TypeScript never declares `Array`, so `number[]`
// checks as an empty object and the generated validator would accept anything.
// Nothing else catches it: MKR013 keys on a written type NAME, and array sugar
// writes none. So the resolver refuses the selection outright, with an error
// that names what was loaded.
//
// The lib is written into a real tsconfig here rather than inherited, which is
// the only way to have the selection be part of the test.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ResolverClient} from '../src/resolver-client.ts';
import {BIN, hasBinary, MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';

const CONSUMER_SRC = `import {getRunTypeId} from '@ts-runtypes/core';

interface Basket {items: number[]; label: string}

// static getRunTypeId<T>()
getRunTypeId<Basket>();

// value-first getRunTypeId(value)
declare const basket: Basket;
getRunTypeId(basket);
`;

const tsconfigFor = (lib: string[]): string =>
  JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'bundler',
      target: 'ESNext',
      lib,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
    },
  });

async function scanUnderLib(lib: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-unsupported-lib-'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfigFor(lib));
  const resolver = new ResolverClient(BIN, dir, 'tsconfig.json', {serverMode: true, singleThreaded: true});
  try {
    await resolver.setSources({...MARKER_PACKAGE_OVERLAY, 'consumer.ts': CONSUMER_SRC});
    return await resolver.scanFiles(['consumer.ts'], {includeRunTypes: true, includeRtDiagnostics: true});
  } finally {
    resolver.close();
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const codesOf = (result: Awaited<ReturnType<typeof scanUnderLib>>): string[] =>
  (result.diagnostics ?? []).map((diagnostic) => diagnostic.code);

describe.runIf(hasBinary())('a lib with no base ECMAScript edition is refused', () => {
  it.each([
    ['lib: []', [] as string[]],
    ['a by-feature lib on its own', ['es2015.core']],
  ])('%s raises CFG002 as an error', async (_label, lib) => {
    const result = await scanUnderLib(lib);
    const cfg002 = (result.diagnostics ?? []).find((diagnostic) => diagnostic.code === 'CFG002');
    expect(cfg002, `expected CFG002, got ${codesOf(result).join(', ') || 'no diagnostics'}`).toBeDefined();
    // 1 is the wire encoding of Error (diagnostics.SeverityError); the build
    // halts on it, which is the whole point of refusing the selection.
    expect(cfg002?.severity).toBe(1);
  });

  // Both getRunTypeId call shapes, paired (marker coverage rule). A real
  // selection builds clean, and the same two call sites land on one id — the
  // proof that CFG002 refuses the broken selection and nothing else.
  it('getRunTypeId static and value-first forms both resolve under a real lib', async () => {
    const result = await scanUnderLib(['es2022']);
    expect(codesOf(result)).not.toContain('CFG002');
    expect(result.sites).toHaveLength(2);
    expect(result.sites[0].id).toBe(result.sites[1].id);
  });
});
