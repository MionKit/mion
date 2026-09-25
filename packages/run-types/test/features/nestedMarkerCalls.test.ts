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
//
// Every other marker call is not a builder either and keeps its id too:
// getRunTypeId, createX and a library's own markers (drizzle's
// `tableFromType<T>()` inside `toDrizzle<T>({...})`).
import {describe, expect, it} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import {type InferType, type InjectRunTypeId, createValidateFn, getRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {object} from '@mionjs/run-types/builders';

const base64RT = TF.string({pattern: {source: '^[A-Za-z0-9+/]*$', flags: ''}});
type Base64 = InferType<typeof base64RT>;
type Point = {x: number; y: number};

// A library-style marker that is not a builder: it only hands back its id and what it was given.
function withId<T, V>(value: V, id?: InjectRunTypeId<T>): {id: string | undefined; value: V} {
  return {id: getRunTypeId<T>(undefined, id), value};
}

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

  it('getRunTypeId<T>() nested in a non-builder marker keeps its id', () => {
    const wrapped = withId<Base64, string>(getRunTypeId<Point>());
    expect(wrapped.value).toBe(getRunTypeId<Point>());
    expect(wrapped.id).toBe(getRunTypeId<Base64>());
  });

  it('getRunTypeId(value) nested in a non-builder marker keeps its id', () => {
    const point: Point = {x: 1, y: 2};
    const wrapped = withId<Base64, string>(getRunTypeId(point));
    expect(wrapped.value).toBe(getRunTypeId<Point>());
  });

  it('a createX factory nested in a non-builder marker keeps its id', () => {
    const wrapped = withId<Base64, (value: unknown) => boolean>(createValidateFn<Point>());
    expect(wrapped.value({x: 1, y: 2})).toBe(true);
    expect(wrapped.value({x: 1})).toBe(false);
  });
});
