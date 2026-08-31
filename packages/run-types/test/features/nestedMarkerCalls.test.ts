// A marker call NESTED inside another marker call's arguments.
//
// The scanner deliberately drops the id of a nested value-first builder: the
// enclosing marker already reflects the whole shape, so `object({a: string()})`
// inside `createValidateFn(…)` needs no id of its own — at runtime the nested
// builder returns a carrier the enclosing marker consumes.
//
// `getRunType` is the one exception, and it used to be caught by that rule. It
// returns a `RunType<T>` like every builder but does not BUILD one: it hands
// the injected id to the runtime registry and returns what comes back. With the
// id dropped it has nothing to look up and throws "no id injected" on the first
// call. Nested is exactly where the converter emits it —
// `createValidateFn(getRunType<Named>())` is what `--to builders` prints for a
// call whose type argument names a converted declaration — so every such call
// threw until the scanner exempted it.
import {describe, expect, it} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import {type InferType, createValidateFn, getRunType, getRunTypeId} from '@mionjs/run-types';
import {object} from '@mionjs/run-types/builders';

const base64RT = TF.string({pattern: {source: '^[A-Za-z0-9+/]*$', flags: ''}});
type Base64 = InferType<typeof base64RT>;

describe('a marker call nested in another marker call', () => {
  it('getRunType nested in a factory keeps its injected id', () => {
    const isBase64 = createValidateFn(getRunType<Base64>());
    expect(isBase64('QUJD')).toBe(true);
    expect(isBase64('not base64!')).toBe(false);
  });

  it('the nested escape converges with the direct const and the type form', () => {
    // All three spellings reflect the same T, so they share one validator.
    const viaEscape = createValidateFn(getRunType<Base64>());
    expect(viaEscape).toBe(createValidateFn(base64RT));
    expect(viaEscape).toBe(createValidateFn<Base64>());
  });

  it('both getRunTypeId shapes work nested', () => {
    // The marker coverage rule at a NESTED position: static and reflection.
    const sample: Base64 = 'QUJD' as Base64;
    expect(getRunTypeId(getRunType<Base64>())).toBe(getRunTypeId<Base64>());
    expect(getRunTypeId(sample)).toBe(getRunTypeId<Base64>());
  });

  it('a nested BUILDER still needs no id of its own', () => {
    // The rule the exemption above narrows, not replaces: a nested builder is
    // pure construction, so the enclosing marker reflecting it is enough.
    const isPoint = createValidateFn(object({x: TF.number(), y: TF.number()}));
    expect(isPoint({x: 1, y: 2})).toBe(true);
    expect(isPoint({x: 1})).toBe(false);
  });
});
