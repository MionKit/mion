// Pin for FUZZ_FORMAT_SCRATCH_PREAMBLE (typeGen.ts) — the import-free `TF`
// namespace the scratch-dir lanes (enrich / typemod) prepend because their
// temp-dir fixtures cannot resolve a relative './src/...' import.
//
// It restates the param brands' raw sentinel encoding, so it is duplication —
// an EXCEPTION to the rule that fuzz fixtures import the real shipped types
// ("Real types, never copies" in test/fuzz/README.md), tolerable ONLY where an
// import cannot resolve and ONLY under an oracle: this test pins each
// namespace spelling against the SHIPPED brand by structural id (both
// getRunTypeId call shapes, per the marker coverage rule), plus byte-equality
// between the pinned literals and the constant the renderers actually emit.
// If the sentinel encoding ever changes, this fails loudly instead of the
// enrich fuzzers silently exercising plain strings.
import {describe, expect, it} from 'vitest';
import * as TF from '@ts-runtypes/core/formats';
import {getRunTypeId} from '@ts-runtypes/core';
import {FUZZ_FORMAT_SCRATCH_PREAMBLE} from '../core/typeGen.ts';

// Byte-for-byte the spellings inside the scratch namespace, instantiated the
// way SCRATCH_FORMAT_LEAVES renders them.
type Fmt<Base, Name extends string, Params extends object> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
type ScratchString<P extends object> = Fmt<string, 'stringFormat', P>;
type ScratchNumber<P extends object> = Fmt<number, 'numberFormat', P>;
type ScratchInteger = ScratchNumber<{integer: true}>;
type ScratchNot<F extends string | number | bigint> = ([F] extends [string] ? string : [F] extends [number] ? number : bigint) & {
  readonly __rtNot?: F;
};

describe('fuzz / scratch format preamble still equals the shipped brand encodings', () => {
  it('String / Number / Integer spellings resolve to the shipped ids (static form)', () => {
    expect(getRunTypeId<ScratchString<{minLength: 50}>>()).toBe(getRunTypeId<TF.String<{minLength: 50}>>());
    expect(getRunTypeId<ScratchNumber<{min: 0; max: 100}>>()).toBe(getRunTypeId<TF.Number<{min: 0; max: 100}>>());
    expect(getRunTypeId<ScratchInteger>()).toBe(getRunTypeId<TF.Integer>());
  });

  it('the Not spelling resolves to the shipped id (reflection form)', () => {
    const negated: ScratchNot<ScratchString<{maxLength: 8}>> = 'longer than eight' as ScratchNot<ScratchString<{maxLength: 8}>>;
    expect(getRunTypeId(negated)).toBe(getRunTypeId<TF.Not<TF.String<{maxLength: 8}>>>());
  });

  it('the pinned literals are the lines the preamble actually emits', () => {
    expect(FUZZ_FORMAT_SCRATCH_PREAMBLE).toBe(
      [
        'namespace TF {',
        '  type Fmt<Base, Name extends string, Params extends object> = Base & {readonly __rtFormatName?: Name; readonly __rtFormatParams?: Params};',
        "  export type String<P extends object> = Fmt<string, 'stringFormat', P>;",
        "  export type Number<P extends object> = Fmt<number, 'numberFormat', P>;",
        '  export type Integer = Number<{integer: true}>;',
        '  export type Not<F extends string | number | bigint> = ([F] extends [string] ? string : [F] extends [number] ? number : bigint) & {readonly __rtNot?: F};',
        '}',
      ].join('\n')
    );
  });
});
