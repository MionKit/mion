// Enforced by `typecheck:test` (vitest erases types); the runtime `it` keeps the file in the suite.

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
type _customJoins = Expect<
  Equal<Extract<MockGeneratorName, 'testCode' | keyof BuiltinMockGenerators>, 'testCode' | keyof BuiltinMockGenerators>
>;
type _customAccepted = Str<{maxLength: 16; generator: 'testCode'}>;
// Refinement merges a generator like any other string param.
type _refines = Expect<Equal<MergeFormat<Str<{maxLength: 120}>, {generator: 'city'}>, Str<{maxLength: 120; generator: 'city'}>>>;

// A generator or mockSamples, never both, at the top level or nested; a disallowed set needs one of them.
// @ts-expect-error both pick the mock value
type _bothTop = Str<{generator: 'city'; mockSamples: ['Rome']}>;
// @ts-expect-error both pick the mock value
type _bothNested = Str<{generator: 'city'; disallowedChars: {val: '@'; mockSamples: 'x'}}>;
type _generatorOnly = Str<{generator: 'city'; disallowedValues: {val: ['Rome']}}>;
type _samplesOnly = Str<{disallowedChars: {val: '@'; mockSamples: 'x'}}>;
// @ts-expect-error a disallowed set needs mockSamples or a generator
type _neither = Str<{disallowedChars: {val: '@'}}>;
// @ts-expect-error the preset types follow the rule too
type _presetBoth = TF.Alpha<{generator: 'firstName'; mockSamples: ['Ann']}>;
// @ts-expect-error and so do the builders
const _builderBoth = TF.string({generator: 'city', mockSamples: ['Rome']});
// @ts-expect-error a string preset builder too
const _presetBuilderBoth = TF.alpha({generator: 'firstName', mockSamples: ['Ann']});
const _builderGeneratorOnly = TF.string({generator: 'city', disallowedChars: {val: '@'}});

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
