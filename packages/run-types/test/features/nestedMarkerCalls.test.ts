// The scanner drops a nested marker-package builder's id, since the enclosing marker reflects the whole shape.
// Every other nested marker call keeps its id, since it throws "no id injected" without one: getRunType (convert
// emits `createValidateFn(getRunType<Named>())`), getRunTypeId, createX and library markers like drizzle's tableFromType.
import {describe, expect, it} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import {type InferType, type InjectRunTypeId, createValidateFn, getRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {object} from '@mionjs/run-types/builders';

const base64RT = TF.string({pattern: {source: '^[A-Za-z0-9+/]*$', flags: ''}});
type Base64 = InferType<typeof base64RT>;
type Point = {x: number; y: number};

// A library-style marker that is not a builder.
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
