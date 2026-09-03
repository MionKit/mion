// Pins that the JSON restore arms rebuild a value ONLY from its wire form and
// THROW on anything else. `new Date(null)` is the epoch, `new Date(true)` is
// 1 ms past it, `BigInt(true)` is 1n, `new Set(null)` is an empty set: the
// engine coerces, so a body such as `{"expires": null}` used to come out of
// `parse` as a valid Date and `{"tags": null}` as a valid empty Set. Every arm
// now transforms the string (or array) the encoder writes and throws a plain
// Error with a fixed-shape message on anything else (a WHOLE number for a
// bigint stays accepted: that lenient spelling is a promise `parse` already
// made, see parse.test.ts). A value that is ALREADY the restored type (a live
// Date, a bigint, a Map) passes, so `parse` still accepts its own output.
// `parse` reports the throw as its deserialize arm.
//
// The message is hoisted once per generated factory, so the check on the
// happy path is the same single typeof / Array.isArray it always was.
//
// Found by the secjson fuzz lane (wrong-type matrix + `date.nan`); these are
// its seed-free repros.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createParseFn, createValidateFn, isSerializationError, RTParseError} from '@mionjs/run-types';

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

  const cases: Array<[keyof Wire, unknown, string]> = [
    ['when', null, 'Can not json decode Date: expected an ISO date string or a Date'],
    ['when', 0, 'Can not json decode Date: expected an ISO date string or a Date'],
    ['when', true, 'Can not json decode Date: expected an ISO date string or a Date'],
    ['when', 1704067200000, 'Can not json decode Date: expected an ISO date string or a Date'],
    ['big', true, 'Can not json decode bigint: expected a decimal string, a whole number or a bigint'],
    ['big', null, 'Can not json decode bigint: expected a decimal string, a whole number or a bigint'],
    ['tags', null, 'Can not json decode Set: expected an array or a Set'],
    ['tags', {}, 'Can not json decode Set: expected an array or a Set'],
    ['tags', 'a', 'Can not json decode Set: expected an array or a Set'],
    ['lookup', null, 'Can not json decode Map: expected an array of entries or a Map'],
    ['lookup', {k: 1}, 'Can not json decode Map: expected an array of entries or a Map'],
    ['instant', 0, 'Can not json decode Temporal.Instant: expected an ISO string or a Temporal.Instant'],
    ['instant', null, 'Can not json decode Temporal.Instant: expected an ISO string or a Temporal.Instant'],
  ];

  for (const [field, wrong, message] of cases) {
    it(`${String(field)} = ${JSON.stringify(wrong)} throws "${message}"`, () => {
      const body = {...valid, [field]: wrong};
      for (const decode of decoders) {
        let caught: unknown;
        try {
          decode(JSON.stringify(body));
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).constructor).toBe(Error);
        expect((caught as Error).message).toBe(message);
      }
      let parseErr: unknown;
      try {
        parse(structuredClone(body));
      } catch (err) {
        parseErr = err;
      }
      expect(parseErr).toBeInstanceOf(RTParseError);
      const {issues} = parseErr as RTParseError;
      expect(isSerializationError(issues)).toBe(true);
      if (isSerializationError(issues)) expect(issues.deserializeError).toBe(message);
    });
  }

  it('a bigint written as a fraction still throws, from BigInt itself', () => {
    // `1.5` is a number, so it reaches BigInt(), whose own RangeError is the
    // report: the arm pre-checks the wire form, never the value.
    for (const decode of decoders) expect(() => decode(JSON.stringify({...valid, big: 1.5}))).toThrow(RangeError);
    expect(() => parse(structuredClone({...valid, big: 1.5}))).toThrow(RTParseError);
  });

  it('the compact decoder throws on a non-array where an object goes, instead of rebuilding an empty one', () => {
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
      expect(() => compact(junk), junk).toThrow('Can not json decode object: expected a positional array or an object');
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
