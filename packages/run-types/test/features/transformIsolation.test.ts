// A format transform is its own operation. It never runs inside validate,
// parse, the JSON decoder or the JSON encoder: those all leave a mixed-case
// value exactly as given, and only createFormatTransformFn rewrites it. Both
// marker call shapes are covered (Marker test coverage rule).

import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';
import {
  createValidateFn,
  createParseFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createFormatTransformFn,
} from '@mionjs/run-types';

type CleanEmail = TF.Transform<TF.Email, {lowercase: true}>;
interface Signup {
  email: CleanEmail;
  tags: TF.Transform<string, {trim: true}>[];
}

const MIXED = 'John@Example.COM';

describe('transforms never run inside validate / parse / decode / encode', () => {
  it('validate accepts the raw value and does not rewrite it', () => {
    const isEmail = createValidateFn<CleanEmail>();
    const value = MIXED;
    expect(isEmail(value)).toBe(true);
    expect(value).toBe(MIXED);
  });

  it('parse, the JSON decoder and the JSON encoder round-trip the value untouched', () => {
    const parse = createParseFn<Signup>();
    const decode = createJsonDecoderFn<Signup>();
    const encode = createJsonEncoderFn<Signup>();
    const raw = {email: MIXED, tags: ['  padded  ']};
    expect(parse(structuredClone(raw))).toEqual(raw);
    expect(decode(JSON.stringify(raw))).toEqual(raw);
    expect(JSON.parse(encode(structuredClone(raw))!)).toEqual(raw);
  });

  it('only the transform fn rewrites, and it does so for both marker shapes', () => {
    const cleanStatic = createFormatTransformFn<Signup>();
    const sample: Signup = {email: MIXED as CleanEmail, tags: []};
    const cleanReflect = createFormatTransformFn(sample);
    const expected = {email: 'john@example.com', tags: ['padded']};
    expect(cleanStatic({email: MIXED, tags: ['  padded  ']})).toEqual(expected);
    expect(cleanReflect({email: MIXED, tags: ['  padded  ']})).toEqual(expected);
  });
});
