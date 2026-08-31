// Runtime end-to-end for the unused-builder-const elision, through the REAL
// vitest plugin (this file is transformed by ts-runtypes-devtools like any
// consumer file):
//
//   - a builder const used only via `InferType<typeof …>` registers NO runtype
//     graph at runtime, the module still executes (the builder returns its
//     harmless carrier), and the static-form validator works;
//   - a builder const passed to createValidateFn (a value use) keeps its graph
//     registered and the validator works identically.
//
// The two lanes use DIFFERENT shapes on purpose: equivalent shapes share one
// structural id, so the value-form lane registering its graph must not mask
// the static-form lane's absence assertion.
//
// (Marker coverage rule: both getRunTypeId call shapes with a convergence
// assert, on a third unrelated shape.)

import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, getRTUtils, getRTFnCaches, type InferType} from '@mionjs/run-types';
import {object} from '@mionjs/run-types/builders';
import {string, number} from '@mionjs/run-types/formats';
import {FN_HASH_LEN} from '../../src/runtypes/entryTuple.ts';

// Static-form lane: the const's only reference is the type query below.
const elidedRT = object({elidedProp: string()});
type ElidedShape = InferType<typeof elidedRT>;
const isElidedShape = createValidateFn<ElidedShape>();

// Value-form lane: the const IS the createValidateFn argument.
const keptRT = object({keptProp: number()});
const isKeptShape = createValidateFn(keptRT);

// Type ids are recovered from the registered val entries (`<hash>_<typeId>`)
// rather than getRunTypeId — reflecting the shapes here would itself register
// the very graphs the assertions are about.
function valEntryTypeIds(): string[] {
  const {rtFnsCache} = getRTFnCaches();
  const ids: string[] = [];
  for (const key of Object.keys(rtFnsCache)) {
    const entry = rtFnsCache[key];
    if (entry && entry.familyTag === 'val') ids.push(key.slice(FN_HASH_LEN + 1));
  }
  return ids;
}

// NOTE: `elidedRT` is deliberately referenced NOWHERE below — any value
// reference (even `expect(elidedRT).toBeTruthy()`) would itself count as a use
// and keep the graph. Its harmlessness at runtime is proven indirectly: this
// module executed (the builder call ran and returned its carrier without
// throwing), or no test in this file could run at all.

describe('unused-builder-const elision (real plugin pipeline)', () => {
  it('static form validates correctly with NO runtype graph registered', () => {
    expect(isElidedShape({elidedProp: 'x'})).toBe(true);
    expect(isElidedShape({elidedProp: 1})).toBe(false);
    expect(isElidedShape(undefined)).toBe(false);
    // Exactly one of this file's two val entries belongs to a graph-less type
    // (the elided lane); the other (kept lane) has its graph registered.
    const ids = valEntryTypeIds();
    expect(ids.length).toBe(2);
    const graphless = ids.filter((id) => getRTUtils().getRunType(id) === undefined);
    expect(graphless.length).toBe(1);
  });

  it('value form validates correctly WITH its runtype graph registered', () => {
    expect(isKeptShape({keptProp: 2})).toBe(true);
    expect(isKeptShape({keptProp: 'nope'})).toBe(false);
    const ids = valEntryTypeIds();
    const registered = ids.filter((id) => getRTUtils().getRunType(id) !== undefined);
    expect(registered.length).toBe(1);
    // And the value-used builder const IS the live node for that id.
    expect((keptRT as {id?: string}).id).toBe(registered[0]);
  });

  it('getRunTypeId static and reflect forms converge (marker coverage pair)', () => {
    interface UnrelatedDto {
      label: string;
    }
    const staticId = getRunTypeId<UnrelatedDto>();
    const value: UnrelatedDto = {label: 'x'};
    expect(getRunTypeId(value)).toBe(staticId);
  });
});
