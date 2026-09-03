// Pins that the JSON restore arms rebuild a value ONLY from its wire form.
// `new Date(null)` is the epoch, `new Date(true)` is 1 ms past it,
// `BigInt(true)` is 1n, `new Set(null)` is an empty set: the engine coerces,
// (a WHOLE number for a bigint stays accepted: that lenient spelling is a
// promise `parse` already made, see parse.test.ts)
// so a body such as `{"expires": null}` used to come out of `parse` as a
// valid Date and `{"tags": null}` as a valid empty Set. Every arm now
// transforms the string (or array) the encoder writes and leaves anything
// else untouched, so validate refuses it and `parse` throws.
//
// Found by the secjson fuzz lane (wrong-type matrix + `date.nan`); these are
// its seed-free repros.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createParseFn, createValidateFn, RTParseError} from '@mionjs/run-types';

interface Wire {
  when: Date;
  big: bigint;
  tags: Set<string>;
  lookup: Map<string, number>;
  instant: Temporal.Instant;
}

const valid = {
  when: '2024-01-01T00:00:00.000Z',
  big: '12345678901234567890',
  tags: ['a'],
  lookup: [['k', 1]],
  instant: '1970-01-01T00:00:00Z',
};

describe('JSON restore arms rebuild only from the wire form', () => {
  const parse = createParseFn<Wire>();
  const validate = createValidateFn<Wire>();
  const decoders = [
    createJsonDecoderFn<Wire>(undefined, {strategy: 'strip'}),
    createJsonDecoderFn<Wire>(undefined, {strategy: 'preserve'}),
  ];

  const cases: Array<[keyof Wire, unknown]> = [
    ['when', null],
    ['when', 0],
    ['when', true],
    ['when', 1704067200000],
    ['big', true],
    ['big', 1.5],
    ['tags', null],
    ['tags', {}],
    ['tags', 'a'],
    ['lookup', null],
    ['lookup', {k: 1}],
    ['instant', 0],
    ['instant', null],
  ];

  for (const [field, wrong] of cases) {
    it(`${String(field)} = ${JSON.stringify(wrong)} never becomes a valid value`, () => {
      const body = {...valid, [field]: wrong};
      expect(() => parse(structuredClone(body))).toThrow(RTParseError);
      for (const decode of decoders) {
        let value: unknown;
        try {
          value = decode(JSON.stringify(body));
        } catch {
          continue; // a throw is a refusal too
        }
        expect(validate(value)).toBe(false);
      }
    });
  }

  it('the compact decoder leaves a non-array where an object goes, instead of rebuilding an empty one', () => {
    // Every prop optional: an empty object validates, so a bare number that
    // used to rebuild as `{}` slipped through as a valid value.
    interface AllOptional {
      a?: number;
      b?: string;
    }
    interface Holder {
      o: AllOptional;
    }
    const compact = createJsonDecoderFn<Holder>(undefined, {strategy: 'compact'});
    const validateHolder = createValidateFn<Holder>();
    expect(validateHolder(compact('[[1,"x"]]'))).toBe(true);
    for (const junk of ['[12345]', '[true]', '["x"]', '[null]']) {
      let value: unknown;
      try {
        value = compact(junk);
      } catch {
        continue;
      }
      expect(validateHolder(value), junk).toBe(false);
    }
  });

  it('the wire form still restores', () => {
    const value = parse(structuredClone(valid));
    expect(value.when).toBeInstanceOf(Date);
    expect(value.big).toBe(12345678901234567890n);
    expect(value.tags).toEqual(new Set(['a']));
    expect(value.lookup.get('k')).toBe(1);
    expect(value.instant.epochMilliseconds).toBe(0);
  });
});
