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

// The named VARIANTS of those families (urlHttp, emailPunycode, domainStrict,
// ipv4, base64, …) used to be take-it-or-leave-it presets: the type accepted no
// override and the builder took no params. They now ride the same merge as their
// generic sibling, so the preset's own defaults survive whatever the caller
// leaves out.
describe('every predefined string format accepts an override', () => {
  it('urlHttp: the override retunes the bound and KEEPS the http(s) pattern', () => {
    const typeFirst = getRunTypeId<TF.UrlHttp<{maxLength: 100}>>();
    const value: TF.UrlHttp<{maxLength: 100}> = 'https://example.com' as TF.UrlHttp<{maxLength: 100}>;
    expect(getRunTypeId(value)).toBe(typeFirst);
    expect(getRunTypeId(TF.urlHttp({maxLength: 100}))).toBe(typeFirst);
    // Overriding a bound must NOT silently degrade to the generic Url pattern.
    expect(typeFirst).not.toBe(getRunTypeId(TF.url({maxLength: 100})));
    const isHttpUrl = createValidateFn(TF.urlHttp({maxLength: 100}));
    expect(isHttpUrl('https://example.com/path')).toBe(true);
    expect(isHttpUrl('file:///etc/hosts')).toBe(false);
  });

  it('urlFile / emailPunycode / domainUnicode take an override too', () => {
    expect(getRunTypeId(TF.urlFile({maxLength: 300}))).toBe(getRunTypeId<TF.UrlFile<{maxLength: 300}>>());
    expect(getRunTypeId(TF.emailPunycode({minLength: 9}))).toBe(getRunTypeId<TF.EmailPunycode<{minLength: 9}>>());
    expect(getRunTypeId(TF.domainUnicode({maxLength: 120}))).toBe(getRunTypeId<TF.DomainUnicode<{maxLength: 120}>>());
  });

  it('domainStrict / emailStrict keep their decomposition while bounds retune', () => {
    expect(getRunTypeId(TF.domainStrict({maxLength: 120}))).toBe(getRunTypeId<TF.DomainStrict<{maxLength: 120}>>());
    expect(getRunTypeId(TF.emailStrict({maxLength: 120}))).toBe(getRunTypeId<TF.EmailStrict<{maxLength: 120}>>());
    const isStrict = createValidateFn(TF.domainStrict({maxLength: 120}));
    expect(isStrict('sub.example.com')).toBe(true);
    expect(isStrict('-bad-.example.com')).toBe(false);
  });

  it('ipv4: the override adds a port while the version stays pinned', () => {
    const typeFirst = getRunTypeId<TF.IPv4<{allowPort: true}>>();
    expect(getRunTypeId(TF.ipv4({allowPort: true}))).toBe(typeFirst);
    // …which is exactly the standalone alias that existed for this case.
    expect(typeFirst).toBe(getRunTypeId<TF.IPv4WithPort>());
    const isIPv4Port = createValidateFn(TF.ipv4({allowPort: true}));
    expect(isIPv4Port('192.168.0.1:8080')).toBe(true);
    expect(isIPv4Port('not-an-ip')).toBe(false);
  });

  it('base64 and the case transformers take bounds', () => {
    expect(getRunTypeId(TF.base64({maxLength: 64}))).toBe(getRunTypeId<TF.Base64<{maxLength: 64}>>());
    expect(getRunTypeId(TF.lowercase({maxLength: 8}))).toBe(getRunTypeId<TF.Lowercase<{maxLength: 8}>>());
    const isShortBase64 = createValidateFn(TF.base64({maxLength: 8}));
    expect(isShortBase64('QUJD')).toBe(true);
    expect(isShortBase64('QUJDREVGR0hJSg==')).toBe(false); // over the bound
  });

  it('the bare spelling of every preset is unchanged by gaining the override', () => {
    expect(getRunTypeId(TF.urlHttp())).toBe(getRunTypeId<TF.UrlHttp>());
    expect(getRunTypeId(TF.emailStrict())).toBe(getRunTypeId<TF.EmailStrict>());
    expect(getRunTypeId(TF.ipv4())).toBe(getRunTypeId<TF.IPv4>());
    expect(getRunTypeId(TF.base32())).toBe(getRunTypeId<TF.Base32>());
    expect(getRunTypeId(TF.domainPunycode())).toBe(getRunTypeId<TF.DomainPunycode>());
  });
});
