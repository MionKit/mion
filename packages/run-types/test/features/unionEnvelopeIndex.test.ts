// Pins the one decode-time refusal the validator can never make: the union
// envelope's index. Validation runs on the decoded value, after the
// `[index, value]` envelope is gone, so an index that matches no member is
// refused by the decoder itself, and the message names what arrived.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createParseFn, isSerializationError, RTParseError} from '@mionjs/run-types';

interface Holder {
  when: Date | bigint;
}

describe('union envelope index', () => {
  const decode = createJsonDecoderFn<Holder>();
  const parse = createParseFn<Holder>();

  it('a valid index restores the member', () => {
    const encode = createJsonEncoderFn<Holder>();
    const value = decode(encode({when: new Date('2024-01-01T00:00:00.000Z')}) as string);
    expect(value.when).toBeInstanceOf(Date);
    expect(decode(encode({when: 5n}) as string).when).toBe(5n);
  });

  for (const [index, rendered] of [
    [7, '7'],
    [-1, '-1'],
    [1.5, '1.5'],
    ['0', '0'],
    [true, 'true'],
    [null, 'null'],
  ] as const) {
    it(`index ${JSON.stringify(index)} is refused by the decoder, naming it`, () => {
      const text = JSON.stringify({when: [index, '1']});
      expect(() => decode(text)).toThrow(`[mion] Can not json decode union: invalid union index ${rendered}`);
      let caught: unknown;
      try {
        parse(JSON.parse(text));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(RTParseError);
      const {issues} = caught as RTParseError;
      expect(isSerializationError(issues) && issues.deserializeError).toBe(
        `[mion] Can not json decode union: invalid union index ${rendered}`
      );
    });
  }
});
