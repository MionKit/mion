// The variable-width string formats (Email / Domain / Url) accept a partial
// options object that OVERRIDES their built-in bounds while keeping the built-in
// pattern: `TF.email({minLength: 10})` is still the email pattern, just with a
// different minimum. The JSON Schema door rides the SAME merge — a
// `format: 'email'` + `minLength` sibling lowers to `Email<{minLength}>` — so the
// three authoring modes (type-first alias, value-first builder, JSON Schema door)
// fold to ONE structural id, across both getRunTypeId call shapes (marker rule).

import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import * as TF from '@ts-runtypes/core/formats';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import '@ts-runtypes/core/formats';

describe('variable-width format length overrides converge across authoring modes', () => {
  it('email: minLength sibling ≡ type-first ≡ value-first ≡ door', () => {
    const typeFirst = getRunTypeId<TF.Email<{minLength: 10}>>();
    // reflection form (marker rule)
    const value: TF.Email<{minLength: 10}> = 'a@example.com' as TF.Email<{minLength: 10}>;
    expect(getRunTypeId(value)).toBe(typeFirst);
    // value-first builder
    expect(getRunTypeId(TF.email({minLength: 10}))).toBe(typeFirst);
    // JSON Schema door
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'email', minLength: 10}))).toBe(typeFirst);
  });

  it('email: an override keeps the built-in pattern (distinct from a plain string bound)', () => {
    // A bounded email is NOT the same as a bounded plain string — the email
    // pattern still rides along, so the ids differ.
    expect(getRunTypeId(TF.email({maxLength: 100}))).not.toBe(getRunTypeId(TF.string({maxLength: 100})));
    // Bare email still resolves and validates.
    expect(getRunTypeId(TF.email())).toBe(getRunTypeId<TF.Email>());
    const isEmail = createValidateFn(TF.email({maxLength: 100}));
    expect(isEmail('john@example.com')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
  });

  it('domain: maxLength sibling converges (type-first + reflection + builder + door)', () => {
    const typeFirst = getRunTypeId<TF.Domain<{maxLength: 100}>>();
    const value: TF.Domain<{maxLength: 100}> = 'example.com' as TF.Domain<{maxLength: 100}>;
    expect(getRunTypeId(value)).toBe(typeFirst);
    expect(getRunTypeId(TF.domain({maxLength: 100}))).toBe(typeFirst);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'hostname', maxLength: 100}))).toBe(typeFirst);
  });

  it('url: minLength + maxLength siblings converge', () => {
    const typeFirst = getRunTypeId<TF.Url<{minLength: 12; maxLength: 200}>>();
    expect(getRunTypeId(TF.url({minLength: 12, maxLength: 200}))).toBe(typeFirst);
    expect(getRunTypeId(runTypeFromJsonSchema({type: 'string', format: 'uri', minLength: 12, maxLength: 200}))).toBe(typeFirst);
  });
});
