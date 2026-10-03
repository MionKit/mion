// Runtype data modules: a row reached by several files sits in a shared module they import, and a row two
// modules both carry (an older copy after a reload, a second build) still registers once.

import {describe, expect, it} from 'vitest';
import {initFromTuple, type EntryTuple} from '../../src/runtypes/entryTuple.ts';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';

// Data module tuple (kind 4): [entryKind, deps, ini, key, rows, rels]; a rels row's slot 0 is `child`, by row index.
function dataModule(key: string, rows: unknown[][], rels: (unknown[] | undefined)[], deps?: () => EntryTuple[]): EntryTuple {
  return [4, deps, undefined, key, rows, rels] as unknown as EntryTuple;
}

// Slot 21 of a headless row is jsonMaxBytes.
function rootRow(id: string, jsonMaxBytes: number): unknown[] {
  const row: unknown[] = [id, 5];
  row[21] = jsonMaxBytes;
  return row;
}

describe('entryTuple / per-file data modules', () => {
  it('registers a shared row once and keeps the first module wiring, cycles included', () => {
    const utils = getRTUtils();
    initFromTuple(
      dataModule(
        'rts_moduleA',
        [
          ['mod-a', 0],
          ['mod-shared', 0],
        ],
        [[1], [0]]
      )
    );
    const shared = utils.getRunType('mod-shared');
    const a = utils.getRunType('mod-a');
    expect(a?.child).toBe(shared);
    expect(shared?.child).toBe(a);

    initFromTuple(
      dataModule(
        'rts_moduleB',
        [
          ['mod-b', 0],
          ['mod-shared', 0],
        ],
        [[1], [0]]
      )
    );
    expect(utils.getRunType('mod-shared')).toBe(shared);
    expect(shared?.child).toBe(a);
    expect(utils.getRunType('mod-b')?.child).toBe(shared);
  });

  it('wires a relation to a row of an imported shared module, named by id', () => {
    const utils = getRTUtils();
    const shared = dataModule('rts_sharedModule', [['mod-shared-leaf', 0]], []);
    initFromTuple(dataModule('rts_fileModule', [['mod-file-root', 0]], [['mod-shared-leaf']], () => [shared]));
    const leaf = utils.getRunType('mod-shared-leaf');
    expect(leaf).toBeDefined();
    expect(utils.getRunType('mod-file-root')?.child).toBe(leaf);
  });

  it('takes a root size limit from a later module when the first registered the row without one', () => {
    const utils = getRTUtils();
    initFromTuple(dataModule('rts_moduleNoLimit', [['mod-limited', 5]], []));
    expect(utils.getRunType('mod-limited')?.jsonMaxBytes).toBeUndefined();
    initFromTuple(dataModule('rts_moduleLimit', [rootRow('mod-limited', 99)], []));
    expect(utils.getRunType('mod-limited')?.jsonMaxBytes).toBe(99);
  });
});
