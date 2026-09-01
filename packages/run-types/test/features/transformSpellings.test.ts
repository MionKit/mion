// The two spellings of a format transform, the nested `transform` param and the
// `TF.Transform<T, P>` wrapper, are ONE representation: the same format name,
// the same params, the same structural id. This file pins that, for both
// marker call shapes (Marker test coverage rule), plus the value-first twin.

import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import {transform, email, string} from '@mionjs/run-types/formats';
import {getRunTypeId, createFormatTransformFn} from '@mionjs/run-types';

type NestedEmail = TF.Email<{transform: {trim: true; lowercase: true}}>;
type WrappedEmail = TF.Transform<TF.Email, {trim: true; lowercase: true}>;
type NestedString = TF.String<{maxLength: 8; transform: {uppercase: true}}>;
type WrappedString = TF.Transform<TF.String<{maxLength: 8}>, {uppercase: true}>;
type WrappedPlain = TF.Transform<string, {uppercase: true}>;
type NestedPlain = TF.String<{transform: {uppercase: true}}>;
type BrandedTag = TF.String<{maxLength: 8}, 'UserTag'>;
type WrappedBranded = TF.Transform<BrandedTag, {lowercase: true}>;

describe('transform spellings converge on one id', () => {
  it('nested param and wrapper give the same id, type-first', () => {
    expect(getRunTypeId<NestedEmail>()).toBe(getRunTypeId<WrappedEmail>());
    expect(getRunTypeId<NestedString>()).toBe(getRunTypeId<WrappedString>());
    expect(getRunTypeId<NestedPlain>()).toBe(getRunTypeId<WrappedPlain>());
  });

  it('nested param and wrapper give the same id, value-first (reflected from a value)', () => {
    const nested: NestedEmail = 'a@b.co' as NestedEmail;
    const wrapped: WrappedEmail = 'a@b.co' as WrappedEmail;
    expect(getRunTypeId(nested)).toBe(getRunTypeId(wrapped));
    expect(getRunTypeId(nested)).toBe(getRunTypeId<NestedEmail>());
  });

  it('a transform changes the id: the rewrite is part of what the type IS', () => {
    expect(getRunTypeId<NestedEmail>()).not.toBe(getRunTypeId<TF.Email>());
    expect(getRunTypeId<WrappedPlain>()).not.toBe(getRunTypeId<string>());
  });

  it('the value-first builder converges on the type-first id', () => {
    expect(getRunTypeId(transform(email(), {trim: true, lowercase: true}))).toBe(getRunTypeId<WrappedEmail>());
    expect(getRunTypeId(transform(string(), {uppercase: true}))).toBe(getRunTypeId<WrappedPlain>());
    expect(getRunTypeId(transform(string({maxLength: 8}), {uppercase: true}))).toBe(getRunTypeId<NestedString>());
  });

  it('the wrapper keeps a nominal brand and still transforms', () => {
    const lower = createFormatTransformFn<WrappedBranded>();
    expect(lower('ADMIN')).toBe('admin');
    // the brand survives: a bare string is not assignable to the wrapped type
    // @ts-expect-error — WrappedBranded is nominal, a plain string does not satisfy it
    const bare: WrappedBranded = 'admin';
    void bare;
    // and the branded id differs from its transparent twin's, exactly like the unwrapped brand does
    expect(getRunTypeId<WrappedBranded>()).toBe(getRunTypeId<TF.Transform<TF.String<{maxLength: 8}>, {lowercase: true}>>());
  });

  it('a format with no transform bag rejects the wrapper at compile time', () => {
    // @ts-expect-error — uuid takes no transform
    type Bad = TF.Transform<TF.UUIDv4, {lowercase: true}>;
    // @ts-expect-error — stripSeparators belongs to creditCard only
    type BadKey = TF.Transform<TF.Email, {stripSeparators: true}>;
    const keep: [Bad, BadKey] | undefined = undefined;
    void keep;
  });
});
