// `TypeFormatError.type` — the optional failure MODE a format reports when it
// has more than one way to fail. General RunTypes functionality, not a
// credit-card feature: any format emitter can attach it via
// `formats.FormatTypeProp`, and a format whose constraint either holds or does
// not simply leaves it unset.
//
// Credit card is the first format to use it, so it is what these tests read.
//
// Marker coverage rule: both call shapes (static `createGetValidationErrorsFn<T>()`
// and reflect `createGetValidationErrorsFn(value)`) are exercised as paired tests.

import {describe, it, expect} from 'vitest';
import {createGetValidationErrorsFn, type TypeFormatError} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';

const VISA = '4111111111111111';
const AMEX = '378282246310005';
const VISA_TYPO = '4111111111111112';

// The format detail of the first error, or undefined when the value passed.
function formatErrorOf(errors: {format?: TypeFormatError}[]): TypeFormatError | undefined {
  return errors[0]?.format;
}

describe('TypeFormatError.type — which way the format failed', () => {
  it('(static) tells a malformed value from a broken checksum from a wrong network', () => {
    const getErrors = createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa']}>>();

    expect(getErrors(VISA)).toEqual([]);

    // Not shaped like a card number at all.
    expect(formatErrorOf(getErrors('not-a-card'))?.type).toBe('format');
    // Right shape, digits do not add up. This is the mistyped-digit case, and
    // the reason the format runs a checksum rather than a length check.
    expect(formatErrorOf(getErrors(VISA_TYPO))?.type).toBe('checksum');
    // A perfectly good card, just not one this field takes.
    expect(formatErrorOf(getErrors(AMEX))?.type).toBe('network');
  });

  it('(reflect) reports the same modes when the type is inferred from a value', () => {
    const value: TF.CreditCard<{networks: ['visa']}> = VISA;
    const getErrors = createGetValidationErrorsFn(value);

    expect(getErrors(VISA)).toEqual([]);
    expect(formatErrorOf(getErrors('not-a-card'))?.type).toBe('format');
    expect(formatErrorOf(getErrors(VISA_TYPO))?.type).toBe('checksum');
    expect(formatErrorOf(getErrors(AMEX))?.type).toBe('network');
  });

  it('carries the format name and, for a network miss, what the field does accept', () => {
    const getErrors = createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa', 'mastercard']}>>();
    const error = formatErrorOf(getErrors(AMEX));

    expect(error?.name).toBe('creditCard');
    expect(error?.type).toBe('network');
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
    expect(error?.type).toBeUndefined();
  });
});
