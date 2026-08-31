// parse / Parse — every case is checked on the four axes the suite exists for:
//
//   ROUND-TRIP   encode → JSON.parse → parse gives back what went in
//   RESTORATION  a declared wire form comes back as the real value
//   TOTALITY     nothing escapes as anything but RTParseError
//   AGREEMENT    a value parse accepted reports no validation errors
//
// The last one is the oracle. `createGetValidationErrorsFn<T>()` is the
// independent judge of "does this match T", so running it over parse's OWN
// output is what stops the restore walk and the check walk drifting apart.

import {describe, expect, it} from 'vitest';
import {isSerializationError, RTParseError} from '@mionjs/run-types';
import {PARSE, PARSE_STRATEGIES} from './Parse.ts';

describe('parse / Parse', () => {
  for (const testCase of Object.values(PARSE)) {
    describe(testCase.title, () => {
      it('round-trips every live value through encode and parse', () => {
        const parse = testCase.parse();
        const encode = testCase.encode();
        for (const value of testCase.roundTrip) {
          const json = encode(structuredClone(value));
          expect(json).toBeTypeOf('string');
          expect(parse(JSON.parse(json as string))).toEqual(value);
        }
      });

      it('restores every wire sample into its typed value', () => {
        const parse = testCase.parse();
        for (const {input, expect: expected} of testCase.wire) {
          expect(parse(structuredClone(input))).toEqual(expected);
        }
      });

      it('throws RTParseError, and only RTParseError, on every invalid sample', () => {
        const parse = testCase.parse();
        for (const value of testCase.invalid) {
          // Labelled BEFORE the call: parse restores leaves in place, so a
          // half-restored input can hold a bigint that JSON.stringify refuses.
          const label = JSON.stringify(value) ?? String(value);
          let thrown: unknown;
          try {
            parse(value);
          } catch (error) {
            thrown = error;
          }
          // A raw TypeError / SyntaxError here means an unguarded restore arm.
          expect(thrown, `expected a throw for ${label}`).toBeInstanceOf(RTParseError);
          // Either arm is fine here; an EMPTY one is not, since the caller
          // would then have a throw with no account of why.
          const {issues} = thrown as RTParseError;
          if (isSerializationError(issues)) expect(issues.deserializeError).not.toBe('');
          else expect(issues.length).toBeGreaterThan(0);
        }
      });

      it('reports no validation errors for anything it accepted', () => {
        const parse = testCase.parse();
        const encode = testCase.encode();
        const errorsOf = testCase.errors();
        const accepted = [
          ...testCase.roundTrip.map((value) => parse(JSON.parse(encode(structuredClone(value)) as string))),
          ...testCase.wire.map((sample) => parse(structuredClone(sample.input))),
        ];
        for (const value of accepted) expect(errorsOf(value)).toEqual([]);
      });
    });
  }

  // The strategies get their own block: each needs its own compiled function, so
  // they are keyed by strategy rather than by shape like the cases above.
  describe('undeclared keys, per strategy', () => {
    const withExtras = () => ({id: 1, extra: 'x', nested: {a: 'a', alsoExtra: 2}});

    it('strip drops them at every level', () => {
      expect(PARSE_STRATEGIES.strip(withExtras())).toEqual({id: 1, nested: {a: 'a'}});
    });

    // The bare call is LOOSE. Pinned separately from `preserve` so a change to
    // the default cannot pass by only updating the option-carrying case.
    it('the default keeps them, same as preserve', () => {
      expect(PARSE_STRATEGIES.default(withExtras())).toEqual(withExtras());
    });

    it('fail rejects a value carrying them', () => {
      expect(() => PARSE_STRATEGIES.fail(withExtras())).toThrow(RTParseError);
      // Nested-only, to prove the check is not root-scoped.
      expect(() => PARSE_STRATEGIES.fail({id: 1, nested: {a: 'a', alsoExtra: 2}})).toThrow(RTParseError);
      expect(PARSE_STRATEGIES.fail({id: 1, nested: {a: 'a'}})).toEqual({id: 1, nested: {a: 'a'}});
    });

    it('preserve keeps them', () => {
      expect(PARSE_STRATEGIES.preserve(withExtras())).toEqual(withExtras());
    });

    it('all three still reject a value that does not match the type', () => {
      for (const parse of Object.values(PARSE_STRATEGIES)) {
        expect(() => parse({id: 'one', nested: {a: 'a'}})).toThrow(RTParseError);
      }
    });
  });
});
