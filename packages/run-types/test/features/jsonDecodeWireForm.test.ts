// Pins that the JSON restore arms rebuild a value ONLY from its wire form: the engine coerces (`new Date(null)` is
// the epoch, `BigInt(true)` is 1n, `new Set(null)` an empty set), so anything else is left for validate to refuse.
// A WHOLE number for a bigint stays accepted. Seed-free repros of the secjson fuzz lane (wrong-type matrix, `date.nan`).

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createValidateFn} from '@mionjs/run-types';

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
  const validate = createValidateFn<Wire>();
  const decoders = [
    createJsonDecoderFn<Wire>(undefined, {strategy: 'clone'}),
    createJsonDecoderFn<Wire>(undefined, {strategy: 'mutate'}),
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

  // A missing compact slot holds the first of `0` / `null` / `false` its type cannot be; it maps to absent BEFORE any
  // constructor runs, and a foreign marker is left for validate to refuse.
  it('the compact decoder maps only its own placeholder to absent', () => {
    const optionalDate = createJsonDecoderFn<{when?: Date}>(undefined, {strategy: 'compact'});
    const validateOptionalDate = createValidateFn<{when?: Date}>();
    expect(optionalDate('[0]')).toEqual({});
    expect(validateOptionalDate(optionalDate('[null]'))).toBe(false);

    const requiredString = createJsonDecoderFn<{s: string}>(undefined, {strategy: 'compact'});
    expect(createValidateFn<{s: string}>()(requiredString('[0]'))).toBe(false);

    type Merged = {k: 'a'; when?: Date} | {k: 'b'; n: number};
    const merged = createJsonDecoderFn<Merged>(undefined, {strategy: 'compact'});
    const validateMerged = createValidateFn<Merged>();
    expect(merged('["a",0,null]')).toEqual({k: 'a'});
    expect(validateMerged(merged('["a",null,null]'))).toBe(false);
    expect(validateMerged(merged('["a",1704067200000,null]'))).toBe(false);
  });

  it('the wire form still restores', () => {
    const value = decoders[1](JSON.stringify(valid));
    expect(value.when).toBeInstanceOf(Date);
    expect(value.big).toBe(12345678901234567890n);
    expect(value.tags).toEqual(new Set(['a']));
    expect(value.lookup.get('k')).toBe(1);
    expect(value.instant.epochMilliseconds).toBe(0);
  });
});
