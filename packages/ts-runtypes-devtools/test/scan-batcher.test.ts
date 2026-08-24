// Unit tests for the transform-scan batcher: same-tick coalescing,
// per-file projection of the flat batch response, duplicate-file
// dedupe, pass-through of multi-file calls, and the per-file fallback
// when a batch fails. The fixture sites cover both marker forms
// (static getRunTypeId<T>() and reflection getRunTypeId(value)
// shapes — a bare-id site and a value-first site).
import {describe, expect, it} from 'vitest';
import {createScanBatcher} from '../src/scan-batcher.ts';
import type {ScanFilesResult} from '../src/resolver-client.ts';
import type {Site} from '../src/protocol.ts';

function site(file: string, pos: number, argsCount = 0): Site {
  // argsCount 0 = static form (getRunTypeId<T>()); argsCount 1 = the
  // reflection form's value argument (getRunTypeId(value)).
  return {file, pos, id: 'AbC123', argsCount} as Site;
}

function result(sites: Site[], extra: Partial<ScanFilesResult> = {}): ScanFilesResult {
  return {sites, ...extra};
}

describe('createScanBatcher', () => {
  it('coalesces same-tick single-file requests into one dispatch and projects per file', async () => {
    const calls: string[][] = [];
    const batcher = createScanBatcher(async (files) => {
      calls.push([...files]);
      return result([site('a.ts', 10), site('a.ts', 20, 1), site('b.ts', 5)], {
        replacements: [{file: 'b.ts', start: 1, end: 2, text: 'x'}],
        addedRunTypes: true,
      });
    });

    const [forA, forB] = await Promise.all([batcher.scanFiles(['a.ts']), batcher.scanFiles(['b.ts'])]);
    expect(calls).toEqual([['a.ts', 'b.ts']]);
    expect(forA.sites.map((s) => s.pos)).toEqual([10, 20]);
    expect(forA.replacements).toEqual([]);
    expect(forB.sites.map((s) => s.pos)).toEqual([5]);
    expect(forB.replacements).toEqual([{file: 'b.ts', start: 1, end: 2, text: 'x'}]);
    // Batch-scoped signals ride along on every member.
    expect(forA.addedRunTypes).toBe(true);
    expect(forB.addedRunTypes).toBe(true);
  });

  it('dedupes the same file requested twice in one window', async () => {
    const calls: string[][] = [];
    const batcher = createScanBatcher(async (files) => {
      calls.push([...files]);
      return result([site('a.ts', 10)]);
    });
    const [first, second] = await Promise.all([batcher.scanFiles(['a.ts']), batcher.scanFiles(['a.ts'])]);
    expect(calls).toEqual([['a.ts']]);
    expect(first.sites).toHaveLength(1);
    expect(second.sites).toHaveLength(1);
  });

  it('starts a fresh batch after the window closes', async () => {
    const calls: string[][] = [];
    const batcher = createScanBatcher(async (files) => {
      calls.push([...files]);
      return result(files.map((f) => site(f, 1)));
    });
    await batcher.scanFiles(['a.ts']);
    await batcher.scanFiles(['b.ts']);
    expect(calls).toEqual([['a.ts'], ['b.ts']]);
  });

  it('falls back to per-file scans when the batch dispatch fails', async () => {
    const calls: string[][] = [];
    const batcher = createScanBatcher(async (files) => {
      calls.push([...files]);
      if (files.length > 1) throw new Error('missing.ts not in program');
      if (files[0] === 'missing.ts') throw new Error('missing.ts not in program');
      return result([site(files[0], 7)]);
    });
    const settled = await Promise.allSettled([batcher.scanFiles(['good.ts']), batcher.scanFiles(['missing.ts'])]);
    expect(calls[0]).toEqual(['good.ts', 'missing.ts']);
    expect(settled[0].status).toBe('fulfilled');
    if (settled[0].status === 'fulfilled') expect(settled[0].value.sites.map((s) => s.pos)).toEqual([7]);
    expect(settled[1].status).toBe('rejected');
  });

  it('passes multi-file calls through unbatched', async () => {
    const calls: string[][] = [];
    const batcher = createScanBatcher(async (files) => {
      calls.push([...files]);
      return result([]);
    });
    await batcher.scanFiles(['a.ts', 'b.ts']);
    expect(calls).toEqual([['a.ts', 'b.ts']]);
  });
});
