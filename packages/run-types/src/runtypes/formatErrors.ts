// `FormatErrorsOf<T>` — the format errors a validator for `T` can report, as a
// TYPED union: one `TypeFormatError<Name, Mode>` per format `T` contains, so
// `switch (err.format?.name)` narrows `errorType` to that format's documented
// modes. What `createGetValidationErrorsFn<T>()` and friends return.
//
// A bounded, depth-8 walk of `T` in the same shape as `DataOnly<T>`
// (./dataOnly.ts): primitives contribute nothing, a format leaf contributes its
// error type (read through `FormatNameOf` / `FormatParamsOf`), and arrays,
// tuples, objects, Map and Set recurse into their members. The union is over the
// WHOLE type, not per path — `format.name` is the discriminant.
//
// Modes come from the format's name AND its params, so the pattern-path `Email`
// (one way to fail per param) contributes `errorType?: never` while
// `EmailAddress` (the RFC engine) contributes the full `EmailErrorType`. That
// keeps the wider unions honest: a mode is offered only where the emitter can
// actually produce it.

import type {TypeFormatError} from '../createRTFunctions.ts';
import type {FormatNameOf, FormatParamsOf} from './typeFormat.ts';
import type {__rtFormatName} from './sentinelKeys.ts';
import type {CreditCardErrorType} from '../formats/string/credit-card-pure-fns.ts';
import type {DomainErrorType, EmailErrorType, IpErrorType} from '../formats/string/stringFormats.ts';

/** Recursion budget decrement, same ladder `DataOnly` uses. */
type _FormatErrorsDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The modes a `domain` format with these params can set. IDNA and the
 *  names / tld decomposition set them; the plain pattern path sets none. */
type DomainModes<Params> = 'idna' extends keyof Params ? DomainErrorType : 'names' extends keyof Params ? DomainErrorType : never;

/** The modes an `email` format with these params can set: the RFC engine and
 *  the localPart / domain decomposition do; the plain pattern path does not. */
type EmailModes<Params> = 'emailRfc' extends keyof Params
  ? EmailErrorType
  : 'localPart' extends keyof Params
    ? EmailErrorType
    : 'domain' extends keyof Params
      ? EmailErrorType
      : never;

/** The modes an `ip` format with these params can set: only with `allowPort`. */
type IpModes<Params> = Params extends {allowPort: true} ? IpErrorType : never;

/** The error(s) ONE format leaf contributes. An `email` with a `domain`
 *  sub-format also reports that half under the `domain` name, so both appear. */
type FormatLeafErrors<Name extends string, Params> = Name extends 'creditCard'
  ? TypeFormatError<'creditCard', CreditCardErrorType>
  : Name extends 'email'
    ?
        | TypeFormatError<'email', EmailModes<Params>>
        | ('domain' extends keyof Params ? TypeFormatError<'domain', DomainModes<Params['domain' & keyof Params]>> : never)
    : Name extends 'domain'
      ? TypeFormatError<'domain', DomainModes<Params>>
      : Name extends 'ip'
        ? TypeFormatError<'ip', IpModes<Params>>
        : TypeFormatError<Name, never>;

/** The typed format errors for `T`: a union of `TypeFormatError<Name, Mode>`,
 *  one per format `T` carries anywhere in its shape. Falls back to the wide
 *  `TypeFormatError` when `T` carries no format (or is `any` / `unknown`), so a
 *  validator over a plain shape keeps today's type. */
export type FormatErrorsOf<T> = [CollectFormatErrors<T, 8>] extends [never] ? TypeFormatError : CollectFormatErrors<T, 8>;

// The outer `T extends unknown` forces distribution over a union BEFORE the
// sentinel probe: `keyof (string | Email)` is the common keys and would hide
// the format, while each member alone is probed correctly.
type CollectFormatErrors<T, Depth extends number> = T extends unknown ? CollectOne<T, Depth> : never;

type CollectOne<T, Depth extends number> = Depth extends 0
  ? never // budget exhausted — best effort, nothing more to collect
  : unknown extends T
    ? never // any / unknown — no format to read
    : typeof __rtFormatName extends keyof T
      ? FormatLeafErrors<FormatNameOf<T>, FormatParamsOf<T>> // a format leaf (string, number, bigint or Date base)
      : T extends string | number | boolean | bigint | symbol | null | undefined | Date | RegExp | ((...args: never[]) => unknown)
        ? never // primitive / native / function — nothing to collect
        : T extends ReadonlyMap<infer K, infer V>
          ? CollectFormatErrors<K, _FormatErrorsDepth[Depth]> | CollectFormatErrors<V, _FormatErrorsDepth[Depth]>
          : T extends ReadonlySet<infer U>
            ? CollectFormatErrors<U, _FormatErrorsDepth[Depth]>
            : T extends readonly (infer E)[]
              ? CollectFormatErrors<E, _FormatErrorsDepth[Depth]> // array + tuple: every slot's type
              : T extends object
                ? {[K in keyof T]-?: CollectFormatErrors<T[K], _FormatErrorsDepth[Depth]>}[keyof T] // plain object: every property
                : never;
