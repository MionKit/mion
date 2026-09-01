// Compile-time proof for `FormatErrorsOf<T>` — the typed format-error union a
// validator for `T` reports — and for the narrowing it buys on
// `createGetValidationErrorsFn<T>()`: `switch (err.format?.name)` narrows
// `errorType` to that format's documented modes.
//
// The bodies are type-only and never invoked; the `test` references them so lint
// doesn't flag them. The real check is tsc:
//   pnpm exec tsc --noEmit -p packages/run-types/tsconfig.test.json

import {expect, test} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import type {CreditCardErrorType, DomainErrorType, EmailErrorType, IpErrorType} from '@mionjs/run-types/formats';
import type {FormatErrorsOf, GetValidationErrorsFn, RTValidationError, TypeFormatError} from '@mionjs/run-types';

/** Asserts `S` and `T` are mutually assignable. No-arg call compiles iff equivalent. */
function assertMutual<S, T>(
  ..._proof: [S] extends [T]
    ? [T] extends [S]
      ? []
      : [error: 'T not assignable to S', T, S]
    : [error: 'S not assignable to T', S, T]
): void {
  void _proof;
}

// One format leaf: the mode union follows the format's NAME and PARAMS, so the
// same name yields modes on the path that can set them and `never` elsewhere.
function leafCases(): void {
  assertMutual<FormatErrorsOf<TF.CreditCard>, TypeFormatError<'creditCard', CreditCardErrorType>>();
  // email: the RFC engine sets modes; the plain pattern preset never does
  assertMutual<FormatErrorsOf<TF.EmailAddress>, TypeFormatError<'email', EmailErrorType>>();
  assertMutual<FormatErrorsOf<TF.IdnEmail>, TypeFormatError<'email', EmailErrorType>>();
  assertMutual<FormatErrorsOf<TF.Email>, TypeFormatError<'email', never>>();
  // domain: IDNA and the names / tld decomposition set modes; the pattern preset never does
  assertMutual<FormatErrorsOf<TF.Hostname>, TypeFormatError<'domain', DomainErrorType>>();
  assertMutual<FormatErrorsOf<TF.IdnHostname>, TypeFormatError<'domain', DomainErrorType>>();
  assertMutual<FormatErrorsOf<TF.DomainStrict>, TypeFormatError<'domain', DomainErrorType>>();
  assertMutual<FormatErrorsOf<TF.Domain>, TypeFormatError<'domain', never>>();
  // ip: only with allowPort
  assertMutual<FormatErrorsOf<TF.IPv4WithPort>, TypeFormatError<'ip', IpErrorType>>();
  assertMutual<FormatErrorsOf<TF.IPWithPort>, TypeFormatError<'ip', IpErrorType>>();
  assertMutual<FormatErrorsOf<TF.IPv4>, TypeFormatError<'ip', never>>();
  // a single-mode format never sets it
  assertMutual<FormatErrorsOf<TF.UUIDv4>, TypeFormatError<'uuid', never>>();
  assertMutual<FormatErrorsOf<TF.UrlHttp>, TypeFormatError<'url', never>>();
}

// The decomposed email also reports its domain half under the `domain` name.
function emailStrictCases(): void {
  assertMutual<
    FormatErrorsOf<TF.EmailStrict>,
    TypeFormatError<'email', EmailErrorType> | TypeFormatError<'domain', DomainErrorType>
  >();
}

// The walk: no format at all keeps the wide default; nested, optional, array,
// union, Map and recursive shapes all contribute their leaves.
function shapeCases(): void {
  assertMutual<FormatErrorsOf<{name: string; age: number}>, TypeFormatError>();
  assertMutual<FormatErrorsOf<string>, TypeFormatError>();
  assertMutual<FormatErrorsOf<unknown>, TypeFormatError>();
  assertMutual<FormatErrorsOf<any>, TypeFormatError>();

  type Form = {
    email: TF.EmailAddress;
    cards?: TF.CreditCard[];
    alt: string | TF.IPv4WithPort;
    ids: Map<string, TF.UUIDv4>;
    pair: [TF.Hostname, number];
  };
  assertMutual<
    FormatErrorsOf<Form>,
    | TypeFormatError<'email', EmailErrorType>
    | TypeFormatError<'creditCard', CreditCardErrorType>
    | TypeFormatError<'ip', IpErrorType>
    | TypeFormatError<'uuid', never>
    | TypeFormatError<'domain', DomainErrorType>
  >();

  interface Node {
    email: TF.EmailAddress;
    children: Node[];
  }
  assertMutual<FormatErrorsOf<Node>, TypeFormatError<'email', EmailErrorType>>();

  // A narrowed error array assigns to the wide one every consumer takes.
  const narrow: RTValidationError<FormatErrorsOf<Form>>[] = [];
  const wide: RTValidationError[] = narrow;
  void wide;
}

// What it buys at the call site: `format.name` discriminates, `errorType`
// narrows to that format's modes, and a single-mode format's is `undefined`.
function narrowingCases(): void {
  type Errors = FormatErrorsOf<{email: TF.EmailAddress; card: TF.CreditCard; id: TF.UUIDv4}>;
  const getErrors = null as unknown as GetValidationErrorsFn<Errors>;
  assertMutual<Extract<Errors, {name: 'email'}>['errorType'], EmailErrorType | undefined>();
  assertMutual<Extract<Errors, {name: 'creditCard'}>['errorType'], CreditCardErrorType | undefined>();
  assertMutual<Extract<Errors, {name: 'uuid'}>['errorType'], undefined>();
  // ...and the same narrowing on a real error, through `format.name`.
  const format = getErrors('x')[0]?.format;
  if (format?.name === 'email') format.errorType satisfies EmailErrorType | undefined;
  // A validator over a plain shape keeps the wide error type, and a narrowed
  // validator assigns to the wide `GetValidationErrorsFn` every consumer takes.
  const plain = null as unknown as GetValidationErrorsFn<FormatErrorsOf<{name: string}>>;
  assertMutual<ReturnType<typeof plain>, RTValidationError[]>();
  const wideFn: GetValidationErrorsFn = getErrors;
  void wideFn;
}

test('FormatErrorsOf compile-time contract', () => {
  expect(typeof leafCases).toBe('function');
  expect(typeof emailStrictCases).toBe('function');
  expect(typeof shapeCases).toBe('function');
  expect(typeof narrowingCases).toBe('function');
});
