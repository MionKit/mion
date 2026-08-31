// Kind-0 (standalone per-node runtype module — moduleMode: 'allModules')
// runtime registration: initFromTuple must walk the deps thunks (undefined
// for dep-less entries — self never rides the array), register each node
// from its tuple fields, and run the per-entry ini footers so ref slots
// resolve through the registry — including the self-referential cycle case
// the bundle's combined footer normally covers.

import {describe, expect, it} from 'vitest';
import {initFromTuple, type EntryTuple, type RunTypeIni} from '../../src/runtypes/entryTuple.ts';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';

// Tuple layout (kind 0): [entryKind, deps|undefined, ini, id, kind, ...trimmed scalars].
function runTypeTuple(id: string, kind: number, deps?: () => readonly EntryTuple[], ini?: RunTypeIni): EntryTuple {
  return [0, deps, ini, id, kind] as unknown as EntryTuple;
}

describe('entryTuple / kind-0 per-node runtype registration (allModules)', () => {
  it('registers a node graph and patches refs through the per-entry inis', () => {
    const childId = 'k0test-child';
    const rootId = 'k0test-root';
    const child: EntryTuple = runTypeTuple(childId, 5 /* number */);
    const root: EntryTuple = runTypeTuple(
      rootId,
      30 /* objectLiteral */,
      () => [child],
      (rtu) => {
        rtu.useRunType(rootId).child = rtu.useRunType(childId);
      }
    );

    initFromTuple(root);

    const utils = getRTUtils();
    expect(utils.hasRunType(rootId)).toBe(true);
    expect(utils.hasRunType(childId)).toBe(true);
    expect(utils.getRunType(rootId)!.child).toBe(utils.getRunType(childId));
  });

  it('handles a self-referential cycle without TDZ or infinite recursion', () => {
    const cycleId = 'k0test-cycle';
    // Self never rides the deps thunk — the cycle is expressed purely
    // through the ini's registry self-patch.
    const cycle: EntryTuple = runTypeTuple(cycleId, 30, undefined, (rtu) => {
      rtu.useRunType(cycleId).child = rtu.useRunType(cycleId);
    });

    initFromTuple(cycle);

    const utils = getRTUtils();
    const entry = utils.getRunType(cycleId)!;
    expect(entry.child).toBe(entry);
  });

  it('registers a dep-less leaf whose deps slot is undefined', () => {
    const leafId = 'k0test-leaf';
    const leaf: EntryTuple = runTypeTuple(leafId, 5);

    initFromTuple(leaf);

    expect(getRTUtils().hasRunType(leafId)).toBe(true);
  });
});
