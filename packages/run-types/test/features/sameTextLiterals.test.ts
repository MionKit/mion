// A string literal and the number / boolean / bigint literal spelled the same way are different types.
// They once shared one type id, so the project-wide cache gave both the validator compiled first.

import {describe, test, expect} from 'vitest';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

enum E0 {
  M0,
}

describe('same-text literals keep their own validators', () => {
  test("'0' and 0", () => {
    const isStr = createValidateFn<'0'>();
    const isNum = createValidateFn<0>();
    expect(isStr('0')).toBe(true);
    expect(isStr(0)).toBe(false);
    expect(isNum(0)).toBe(true);
    expect(isNum('0')).toBe(false);
  });

  test("'true' and true", () => {
    const isStr = createValidateFn<'true'>();
    const isBool = createValidateFn<true>();
    expect(isStr('true')).toBe(true);
    expect(isStr(true)).toBe(false);
    expect(isBool(true)).toBe(true);
    expect(isBool('true')).toBe(false);
  });

  test("'1n' and 1n", () => {
    const isStr = createValidateFn<'1n'>();
    const isBig = createValidateFn<1n>();
    expect(isStr('1n')).toBe(true);
    expect(isStr(1n)).toBe(false);
    expect(isBig(1n)).toBe(true);
    expect(isBig('1n')).toBe(false);
  });

  // The elision fuzz case (seed 0x2f70c658): a one-member enum converts to `RT.literal(0)`.
  test('a one-member enum and its builder accept 0 next to a compiled "0"', () => {
    const isStr = createValidateFn<'0'>();
    const zeroRT = RT.literal(0);
    type Zero = InferType<typeof zeroRT>;
    const isEnum = createValidateFn<E0>();
    const isStatic = createValidateFn<Zero>();
    const isValue = createValidateFn(zeroRT);
    expect(isStr('0')).toBe(true);
    for (const isZero of [isEnum, isStatic, isValue]) {
      expect(isZero(E0.M0)).toBe(true);
      expect(isZero('0')).toBe(false);
    }
  });
});
