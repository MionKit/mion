// `TypeFormatError.errorType` — the optional failure MODE a format reports when it
// has more than one way to fail. General RunTypes functionality, not a
// credit-card feature: any format emitter can attach it via
// `formats.FormatErrorTypeProp`, and a format whose constraint either holds or does
// not simply leaves it unset.
//
// Credit card was the first format to use it; email, domain and ip followed. Every
// mode each format documents is pinned here, and the formats with a single way to
// fail are pinned as leaving the field unset.
//
// Marker coverage rule: both call shapes (static `createGetValidationErrorsFn<T>()`
// and reflect `createGetValidationErrorsFn(value)`) are exercised as paired tests.

import {describe, it, expect} from 'vitest';
import {createGetValidationErrorsFn, type TypeFormatError} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';
import type {CreditCardErrorType, DomainErrorType, EmailErrorType, IpErrorType} from '@mionjs/run-types/formats';

const VISA = '4111111111111111';
const AMEX = '378282246310005';
const VISA_TYPO = '4111111111111112';

// The format detail of the first error, or undefined when the value passed.
function formatErrorOf(errors: {format?: TypeFormatError}[]): TypeFormatError | undefined {
  return errors[0]?.format;
}

describe('TypeFormatError.errorType — which way the format failed', () => {
  it('(static) tells a malformed value from a broken checksum from a wrong network', () => {
    const getErrors = createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa']}>>();

    expect(getErrors(VISA)).toEqual([]);

    // Not shaped like a card number at all.
    expect(formatErrorOf(getErrors('not-a-card'))?.errorType).toBe('format');
    // Right shape, digits do not add up. This is the mistyped-digit case, and
    // the reason the format runs a checksum rather than a length check.
    expect(formatErrorOf(getErrors(VISA_TYPO))?.errorType).toBe('checksum');
    // A perfectly good card, just not one this field takes.
    expect(formatErrorOf(getErrors(AMEX))?.errorType).toBe('network');
  });

  it('(reflect) reports the same modes when the type is inferred from a value', () => {
    const value: TF.CreditCard<{networks: ['visa']}> = VISA;
    const getErrors = createGetValidationErrorsFn(value);

    expect(getErrors(VISA)).toEqual([]);
    expect(formatErrorOf(getErrors('not-a-card'))?.errorType).toBe('format');
    expect(formatErrorOf(getErrors(VISA_TYPO))?.errorType).toBe('checksum');
    expect(formatErrorOf(getErrors(AMEX))?.errorType).toBe('network');
  });

  it('carries the format name and, for a network miss, what the field does accept', () => {
    const getErrors = createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa', 'mastercard']}>>();
    const error = formatErrorOf(getErrors(AMEX));

    expect(error?.name).toBe('creditCard');
    expect(error?.errorType).toBe('network');
    // `type` says WHICH check failed; `val` and `formatPath` still carry the
    // detail, here the networks the field takes.
    expect(error?.val).toEqual(['visa', 'mastercard']);
    expect(error?.formatPath[error.formatPath.length - 1]).toBe('networks');
  });

  it('is left unset by a format with a single failure mode', () => {
    // A UUID either matches the layout or it does not — there is no second mode
    // to name, so the field stays absent rather than carrying a filler value.
    const getErrors = createGetValidationErrorsFn<TF.UUIDv4>();
    const error = formatErrorOf(getErrors('not-a-uuid'));

    expect(error?.name).toBe('uuid');
    expect(error?.errorType).toBeUndefined();
  });
});

// ── email ─────────────────────────────────────────────────────────────

describe('email — which PART of the address is wrong', () => {
  const cases: [value: string, mode: EmailErrorType | undefined][] = [
    ['joe@example.com', undefined],
    ['no-at-sign', 'format'],
    ['@example.com', 'localPart'],
    ['a..b@example.com', 'localPart'],
    ['joe@', 'domain'],
    ['joe@example', 'domain'],
    ['joe@-bad-.com', 'domain'],
    ['joe@[999.1.1.1]', 'addressLiteral'],
    ['joe@[IPv6:zzz]', 'addressLiteral'],
    // The whole address over the declared bound folds in as 'length'.
    ['a'.repeat(250) + '@example.com', 'length'],
  ];

  it('(static) reports the part on the RFC path', () => {
    const getErrors = createGetValidationErrorsFn<TF.EmailAddress>();
    for (const [value, mode] of cases) {
      const error = formatErrorOf(getErrors(value));
      expect(error?.errorType, value).toBe(mode);
      if (mode !== undefined) expect(error?.name).toBe('email');
    }
  });

  it('(reflect) reports the same parts when the type is inferred from a value', () => {
    const value: TF.EmailAddress = 'joe@example.com';
    const getErrors = createGetValidationErrorsFn(value);
    for (const [input, mode] of cases) expect(formatErrorOf(getErrors(input))?.errorType, input).toBe(mode);
  });

  it('accepts an internationalized address and still names the part', () => {
    const getErrors = createGetValidationErrorsFn<TF.IdnEmail>();
    expect(getErrors('δοκιμή@example.com')).toEqual([]);
    expect(formatErrorOf(getErrors('δοκιμή@παράδειγμα'))?.errorType).toBe('domain');
  });

  it('names the half on the decomposition path, and the domain half by its own format name', () => {
    const getErrors = createGetValidationErrorsFn<TF.EmailStrict>();
    expect(getErrors('joe.bloggs@example.com')).toEqual([]);
    expect(formatErrorOf(getErrors('joe'))?.errorType).toBe('format');
    const local = formatErrorOf(getErrors('jo e@example.com'));
    expect(local?.name).toBe('email');
    expect(local?.errorType).toBe('localPart');
    // The domain half reports under `domain`, with that format's own modes.
    const label = formatErrorOf(getErrors('joe@a.com'));
    expect(label?.name).toBe('domain');
    expect(label?.errorType).toBe('label');
    const tld = formatErrorOf(getErrors('joe@example.c'));
    expect(tld?.name).toBe('domain');
    expect(tld?.errorType).toBe('tld');
  });

  it('is left unset by the plain pattern preset, which has one way to fail per param', () => {
    const getErrors = createGetValidationErrorsFn<TF.Email>();
    const error = formatErrorOf(getErrors('not-an-email'));
    expect(error?.name).toBe('email');
    expect(error?.errorType).toBeUndefined();
  });
});

// ── domain ────────────────────────────────────────────────────────────

describe('domain — which rule the name broke', () => {
  const cases: [value: string, mode: DomainErrorType | undefined][] = [
    ['example.com', undefined],
    ['bad_label.com', 'label'],
    ['-bad.com', 'label'],
    ['xn--!.com', 'punycode'],
    ['a.'.repeat(130) + 'com', 'length'],
  ];

  it('(static) reports the rule on the IDNA path', () => {
    const getErrors = createGetValidationErrorsFn<TF.Hostname>();
    for (const [value, mode] of cases) {
      const error = formatErrorOf(getErrors(value));
      expect(error?.errorType, value).toBe(mode);
      if (mode !== undefined) expect(error?.name).toBe('domain');
    }
  });

  it('(reflect) reports the same rules when the type is inferred from a value', () => {
    const value: TF.Hostname = 'example.com';
    const getErrors = createGetValidationErrorsFn(value);
    for (const [input, mode] of cases) expect(formatErrorOf(getErrors(input))?.errorType, input).toBe(mode);
  });

  it('reports the right-to-left rule on an internationalized name', () => {
    const getErrors = createGetValidationErrorsFn<TF.IdnHostname>();
    expect(getErrors('実例.テスト')).toEqual([]);
    // A right-to-left label may carry European OR Arabic-Indic digits, never both.
    expect(formatErrorOf(getErrors('א1٣.com'))?.errorType).toBe('bidi');
  });

  it('names the label or the tld on the decomposition path, and nothing for a whole-name bound', () => {
    const getErrors = createGetValidationErrorsFn<TF.DomainStrict>();
    expect(getErrors('example.com')).toEqual([]);
    expect(formatErrorOf(getErrors('a.com'))?.errorType).toBe('label');
    expect(formatErrorOf(getErrors('-ab.com'))?.errorType).toBe('label');
    expect(formatErrorOf(getErrors('example.c'))?.errorType).toBe('tld');
    // Too many parts: formatPath already names the bound, no part to blame.
    const parts = formatErrorOf(getErrors('aa.bb.cc.dd.ee.ff.com'));
    expect(parts?.formatPath).toEqual(['maxParts']);
    expect(parts?.errorType).toBeUndefined();
  });

  it('is left unset by the plain pattern preset', () => {
    const getErrors = createGetValidationErrorsFn<TF.Domain>();
    expect(formatErrorOf(getErrors('not a domain'))?.errorType).toBeUndefined();
  });
});

// ── ip ────────────────────────────────────────────────────────────────

describe('ip — the address or the port', () => {
  const cases: [value: string, mode: IpErrorType | undefined][] = [
    ['192.168.0.1:8080', undefined],
    ['nope:80', 'address'],
    ['192.168.0.1:99999', 'port'],
    ['192.168.0.1:abc', 'port'],
    // Both wrong: the address outranks the port.
    ['nope:99999', 'address'],
  ];

  it('(static) tells a bad address from a bad port', () => {
    const getErrors = createGetValidationErrorsFn<TF.IPv4WithPort>();
    for (const [value, mode] of cases) {
      const error = formatErrorOf(getErrors(value));
      expect(error?.errorType, value).toBe(mode);
      if (mode !== undefined) expect(error?.name).toBe('ip');
    }
  });

  it('(reflect) reports the same modes when the type is inferred from a value', () => {
    const value: TF.IPv4WithPort = '192.168.0.1:8080';
    const getErrors = createGetValidationErrorsFn(value);
    for (const [input, mode] of cases) expect(formatErrorOf(getErrors(input))?.errorType, input).toBe(mode);
  });

  it('lets a port complaint from either parser win when any version is accepted', () => {
    const getErrors = createGetValidationErrorsFn<TF.IPWithPort>();
    expect(getErrors('[2001:db8::1]:443')).toEqual([]);
    expect(getErrors('10.0.0.1:443')).toEqual([]);
    expect(formatErrorOf(getErrors('[2001:db8::1]:99999'))?.errorType).toBe('port');
    expect(formatErrorOf(getErrors('10.0.0.1:99999'))?.errorType).toBe('port');
    expect(formatErrorOf(getErrors('zzz'))?.errorType).toBe('address');
  });

  it('is left unset without allowPort, where there is one way to fail', () => {
    const getErrors = createGetValidationErrorsFn<TF.IPv4>();
    const error = formatErrorOf(getErrors('999.1.1.1'));
    expect(error?.name).toBe('ip');
    expect(error?.errorType).toBeUndefined();
  });
});

// ── the rest ──────────────────────────────────────────────────────────

describe('formats with one way to fail per param leave errorType unset', () => {
  it('url', () => {
    expect(formatErrorOf(createGetValidationErrorsFn<TF.UrlHttp>()('not a url'))?.errorType).toBeUndefined();
  });
  it('a plain string format', () => {
    expect(formatErrorOf(createGetValidationErrorsFn<TF.String<{maxLength: 2}>>()('abc'))?.errorType).toBeUndefined();
  });
});

// ── typed at the call site ────────────────────────────────────────────

describe('errorType is typed per format from T', () => {
  it('narrows on format.name', () => {
    const getErrors = createGetValidationErrorsFn<{email: TF.EmailAddress; card: TF.CreditCard; id: TF.UUIDv4}>();
    const seen: string[] = [];
    for (const error of getErrors({email: 'joe@', card: VISA_TYPO, id: 'nope'})) {
      // Each arm's `errorType` is that format's documented union (a compile-time
      // check: the `satisfies` fails to build if the narrowing stops working).
      switch (error.format?.name) {
        case 'email':
          seen.push(String(error.format.errorType satisfies EmailErrorType | undefined));
          break;
        case 'creditCard':
          seen.push(String(error.format.errorType satisfies CreditCardErrorType | undefined));
          break;
        case 'uuid':
          seen.push(String(error.format.errorType satisfies undefined));
          break;
      }
    }
    expect(seen).toEqual(['domain', 'checksum', 'undefined']);
  });
});
