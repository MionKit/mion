// scripts/core/test-skip.mjs skips a vitest file whose key already passed. These pin what
// the key sees, what it deliberately ignores, and which files it refuses to cache at all.
import {describe, expect, it} from 'vitest';
import {
  fileKey,
  isProven,
  recordPass,
  stableCode,
  // @ts-expect-error plain ESM dev script, no types
} from '../../../scripts/core/test-skip.mjs';

const graph = (modules: Record<string, string>, externals: string[] = []) => ({
  modules: new Map(Object.entries(modules)),
  externals: new Set(externals),
  reasons: new Set<string>(),
});

describe('test-skip — the key of one test file', () => {
  const base = {'/repo/packages/a/test/a.test.ts': 'import "./x"', '/repo/packages/a/.mion/types/t.js': 'export const t = 1'};

  it('is a pure function of the loaded code, whatever order the graph was walked in', () => {
    const reversed = Object.fromEntries(Object.entries(base).reverse());
    expect(fileKey(graph(base), 'salt')).toBe(fileKey(graph(reversed), 'salt'));
  });

  it('changes when any loaded module, the compiler output included, changes', () => {
    const key = fileKey(graph(base), 'salt');
    expect(fileKey(graph({...base, '/repo/packages/a/.mion/types/t.js': 'export const t = 2'}), 'salt')).not.toBe(key);
    expect(fileKey(graph({...base, '/repo/packages/a/src/new.ts': ''}), 'salt')).not.toBe(key);
  });

  it('changes with an external package version and with the salt', () => {
    const key = fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js']), 'salt');
    expect(fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.6/node_modules/zod/index.js']), 'salt')).not.toBe(key);
    expect(fileKey(graph(base, ['node_modules/.pnpm/zod@4.1.5/node_modules/zod/index.js']), 'other')).not.toBe(key);
  });
});

describe('test-skip — the randomly drawn pattern samples', () => {
  // With no mock.seed the compiler draws new samples on every build, on purpose.
  it('ignores drawn samples in generated code, in both the JSON and the quoted form', () => {
    const one = `{"mockSamples":["ab","cd"],"source":"^x$"} f({pattern: {mockSamples: [\\'ac-23\\', \\'db-14\\'], flags: \\'u\\'}})`;
    const two = `{"mockSamples":["zz"],"source":"^x$"} f({pattern: {mockSamples: [\\'bb-07\\'], flags: \\'u\\'}})`;
    expect(stableCode('/repo/packages/a/.mion/types/t.js', one)).toBe(stableCode('/repo/packages/a/.mion/types/t.js', two));
    expect(stableCode('/repo/packages/a/.mion/types/t.js', one)).toContain('"source":"^x$"');
  });

  it('keeps samples declared in source, which a person wrote and a change must re-run', () => {
    const code = 'const f = {mockSamples: ["ab"]};';
    expect(stableCode('/repo/packages/a/src/formats.ts', code)).toBe(code);
  });

  it('never strips past the end of the list, so a sample holding `]` costs a skip, not a missed change', () => {
    expect(stableCode('/repo/.mion/types/t.js', '{"mockSamples":["a]b"],"after":1}')).toBe('{"mockSamples":[]b"],"after":1}');
  });
});

describe('test-skip — the passed list', () => {
  it('keeps the newest keys per file, so switching branches back and forth still hits', () => {
    const store: Record<string, string[]> = {};
    for (const key of ['k1', 'k2', 'k3', 'k4', 'k2']) recordPass(store, 'a.test.ts', key);
    expect(store['a.test.ts']).toEqual(['k2', 'k4', 'k3']);
  });

  it('proves a file only at a recorded key, and never one that reaches outside its graph', () => {
    const store = {'a.test.ts': ['k1']};
    expect(isProven(store, 'a.test.ts', {key: 'k1', reason: ''})).toBe(true);
    expect(isProven(store, 'a.test.ts', {key: 'k2', reason: ''})).toBe(false);
    expect(isProven(store, 'a.test.ts', {key: 'k1', reason: 'imports node:fs'})).toBe(false);
    expect(isProven(store, 'b.test.ts', {key: 'k1', reason: ''})).toBe(false);
  });
});
