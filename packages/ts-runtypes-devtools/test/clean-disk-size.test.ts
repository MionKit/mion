// The hard clean prints what it is about to delete BEFORE deleting anything, so a crash
// while measuring took the whole clean down with it. Measuring used
// `readdirSync(path, {recursive: true})`, which materializes a Dirent for every entry
// under the path first: over a hoisted node_modules (hundreds of thousands of files) that
// exhausted even a 4 GB heap, so `pnpm run clean` and `fresh-start` both died — and with
// them the first step of the release preflight. The walk is bounded now; these pin its
// arithmetic.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error — a plain .mjs script, no types
import {diskSize} from '../../../scripts/core/clean.mjs';

const size = diskSize as (path: string) => number;

describe('the hard clean measures a tree without loading it all at once', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'rt-clean-size-'));
    writeFileSync(join(root, 'top.txt'), 'a'.repeat(100));
    mkdirSync(join(root, 'nested', 'deeper'), {recursive: true});
    writeFileSync(join(root, 'nested', 'mid.txt'), 'b'.repeat(20));
    writeFileSync(join(root, 'nested', 'deeper', 'leaf.txt'), 'c'.repeat(3));
    mkdirSync(join(root, 'empty'));
  });

  afterAll(() => rmSync(root, {recursive: true, force: true}));

  it('sums every file at every depth', () => {
    expect(size(root)).toBe(123);
  });

  it('counts a file path as its own size', () => {
    expect(size(join(root, 'top.txt'))).toBe(100);
  });

  it('reports zero for a directory with no files', () => {
    expect(size(join(root, 'empty'))).toBe(0);
  });

  it('reports zero for a path that does not exist', () => {
    expect(size(join(root, 'gone'))).toBe(0);
  });
});
