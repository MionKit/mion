// The mock `generator` param at the type level: GEN members are the same literals in type and value positions,
// the name list is the Go table's, a custom name joins through CustomMockGenerators, and only string formats take it.
// Enforced by the `typecheck:test` pass (vitest erases types); the runtime `it` keeps the file in the suite.

import {describe, it, expect} from 'vitest';
import * as TF from '@mionjs/run-types/formats';
import {GEN} from '@mionjs/run-types/formats';
import type {BuiltinMockGenerators, MergeFormat, MockGeneratorName, String as Str} from '@mionjs/run-types/formats';

declare module '@mionjs/run-types/formats' {
  interface CustomMockGenerators {
    testCode: true;
  }
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// GEN.x is the literal 'x', as a type and as a value.
type _typePosition = Expect<Equal<GEN.lastName, 'lastName'>>;
const lastName: 'lastName' = GEN.lastName;
type _sameFormat = Expect<Equal<Str<{generator: GEN.lastName}>, Str<{generator: 'lastName'}>>>;
// Every GEN member is a built-in name, and every built-in name has a GEN member.
type _genIsTheTable = Expect<Equal<(typeof GEN)[keyof typeof GEN], keyof BuiltinMockGenerators>>;
// A name declared on CustomMockGenerators is accepted next to the built-ins.
type _customJoins = Expect<Equal<MockGeneratorName, keyof BuiltinMockGenerators | 'testCode'>>;
type _customAccepted = Str<{maxLength: 16; generator: 'testCode'}>;
// Refinement merges a generator like any other string param.
type _refines = Expect<Equal<MergeFormat<Str<{maxLength: 120}>, {generator: 'city'}>, Str<{maxLength: 120; generator: 'city'}>>>;

// @ts-expect-error a typo is not a generator name
type _typo = Str<{generator: 'lastname'}>;
// @ts-expect-error only string formats take a generator
type _onNumber = TF.Number<{generator: 'firstName'}>;
// @ts-expect-error named families keep their own mock: no generator on Email
type _onEmail = TF.Email<{generator: 'email'}>;

describe('mock generator types', () => {
  it('GEN members are the name literals at run time', () => {
    expect(lastName).toBe('lastName');
    expect(Object.keys(GEN).sort()).toContain('phoneNumberLocal');
  });
});
