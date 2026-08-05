// The three primitive keywords whose semantics the official JSON-Schema-Test-Suite
// lane caught us reading differently from the spec:
//   multipleOf          — any positive number, "division results in an integer"
//   minLength/maxLength — counted in CODE POINTS, not UTF-16 units
//   pattern             — compiled in unicode mode, so \p{…} means what it says
// Each keyword is pinned end-to-end through the door (the validator, the error
// reporter, and the mock generator, which has to satisfy the same rule it is
// generated from) plus the type-first spelling where one exists.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type * as TF from '@ts-runtypes/core/formats';

describe('JSON Schema multipleOf — any positive number', () => {
  it('accepts a fractional divisor and reads it as the spec does', () => {
    const cents = createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 0.0001} as const));
    // 0.0075 % 0.0001 is 9.99e-5 in IEEE 754, so a modulo check calls this
    // invalid; the spec asks whether the DIVISION is an integer, and 0.0075 /
    // 0.0001 is exactly 75.
    expect(cents(0.0075)).toBe(true);
    expect(cents(0.00751)).toBe(false);
    expect(cents(0)).toBe(true);
  });

  it('keeps the ordinary cases right', () => {
    const byOneAndAHalf = createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 1.5} as const));
    expect(byOneAndAHalf(4.5)).toBe(true);
    expect(byOneAndAHalf(-4.5)).toBe(true);
    expect(byOneAndAHalf(35)).toBe(false);

    const byTwo = createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 2} as const));
    expect(byTwo(10)).toBe(true);
    expect(byTwo(7)).toBe(false);
  });

  it('rejects instead of overflowing when the quotient is not finite', () => {
    const tiny = createValidateFn(runTypeFromJsonSchema({type: 'integer', multipleOf: 0.123456789} as const));
    // 1e308 / 0.123456789 is Infinity, which is not an integer.
    expect(tiny(1e308)).toBe(false);
  });

  it('reports the failing bound', () => {
    const errors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'number', multipleOf: 0.01} as const));
    expect(errors(0.25)).toEqual([]);
    expect(errors(0.255).length).toBe(1);
  });

  it('mocks values that satisfy their own fractional divisor', () => {
    // The snap-down used to multiply the quotient back and land on
    // 0.007500000000000001, which fails the validator it was generated for.
    const mock = createMockDataFn(runTypeFromJsonSchema({type: 'number', multipleOf: 0.0001} as const));
    const validate = createValidateFn(runTypeFromJsonSchema({type: 'number', multipleOf: 0.0001} as const));
    for (let draw = 0; draw < 200; draw++) expect(validate(mock())).toBe(true);
  });
});

describe('JSON Schema minLength / maxLength — code points', () => {
  it('counts astral characters once, not twice', () => {
    const atMostTwo = createValidateFn(runTypeFromJsonSchema({type: 'string', maxLength: 2} as const));
    // '💩💩' is two code points with a `.length` of 4.
    expect(atMostTwo('💩💩')).toBe(true);
    expect(atMostTwo('fo')).toBe(true);
    expect(atMostTwo('foo')).toBe(false);

    const atLeastTwo = createValidateFn(runTypeFromJsonSchema({type: 'string', minLength: 2} as const));
    expect(atLeastTwo('💩')).toBe(false);
    expect(atLeastTwo('💩💩')).toBe(true);
    expect(atLeastTwo('fo')).toBe(true);
    expect(atLeastTwo('f')).toBe(false);
  });

  it('applies the same rule to the type-first spelling', () => {
    const atMostTwo = createValidateFn<TF.String<{maxLength: 2}>>();
    expect(atMostTwo('💩💩')).toBe(true);
    expect(atMostTwo('foo')).toBe(false);
  });

  it('reports the failing bound on the code-point count', () => {
    const errors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'string', maxLength: 2} as const));
    expect(errors('💩💩')).toEqual([]);
    expect(errors('💩💩💩').length).toBe(1);
  });

  it('mocks strings inside the bounds', () => {
    const schema = {type: 'string', minLength: 2, maxLength: 8} as const;
    const mock = createMockDataFn(runTypeFromJsonSchema(schema));
    const validate = createValidateFn(runTypeFromJsonSchema(schema));
    for (let draw = 0; draw < 100; draw++) expect(validate(mock())).toBe(true);
  });
});

describe('JSON Schema pattern — unicode mode', () => {
  it('reads \\p{…} as the property it names', () => {
    const letters = createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: '^\\p{Letter}+$'} as const));
    expect(letters('Hello')).toBe(true);
    expect(letters('π')).toBe(true);
    expect(letters('123')).toBe(false);
  });

  it('leaves ordinary patterns alone, anchors included', () => {
    const anchored = createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: '^a*$'} as const));
    expect(anchored('aaa')).toBe(true);
    expect(anchored('abc')).toBe(false);
    // An unanchored pattern matches a substring, per the spec.
    const substring = createValidateFn(runTypeFromJsonSchema({type: 'string', pattern: 'a+'} as const));
    expect(substring('xxaayy')).toBe(true);
    expect(substring('xxyy')).toBe(false);
  });

  it('mocks values for a property-escape pattern', () => {
    // randexp cannot parse \p{…}; the sidecar expands it before generating, and
    // the pool is still gated by the real pattern.
    const schema = {type: 'string', pattern: '^\\p{Letter}+$'} as const;
    const mock = createMockDataFn(runTypeFromJsonSchema(schema));
    const validate = createValidateFn(runTypeFromJsonSchema(schema));
    for (let draw = 0; draw < 50; draw++) expect(validate(mock())).toBe(true);
  });
});
