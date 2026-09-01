---
type: feature
spec: guidelines
status: done
created: 2026-09-01
---

# Report a failure `type` from the other formats

## Intent

`TypeFormatError` now carries an optional `type`: WHICH way a format failed,
for a format with more than one way to fail. It shipped with `creditCard`,
which reports `format`, `checksum` or `network`, so a caller can tell "that is
not a card number" from "check the digits you typed".

Right now `creditCard` is the only format that sets it. Several others plausibly
have more than one failure mode and collapse them into a single opaque error
today. Work out which ones genuinely do, and give those a `type` too.

## Direction

The implementer decides the roster and the mode names. Verified pointers:

- The field is declared on `TypeFormatError` in
  `packages/run-types/src/createRTFunctions.ts`, mirrored in
  `packages/run-types/src/runtypes/pure-fns-utils.ts`.
- Emitters attach it through `formats.FormatErrorTypeProp` in
  `ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go`, which feeds
  `FormatErrCallWith`'s `extraFormatProps`. It takes a JS EXPRESSION, so a mode
  only known at runtime can be a call or a local rather than a baked-in literal.
- `creditCard` is the worked example, in
  `.../formats/string/creditcard.go`. Its pure fn returns the mode instead of a
  boolean and validate compares against `''`, so the hot path pays nothing.
- Candidates worth examining, in rough order of how much a caller would gain:
  - `email` — a bad local part vs a bad domain vs a bad address literal.
  - `domain` — a bad label vs a punycode label that does not decode vs the
    whole-name Bidi rule.
  - `url` — a bad scheme vs a bad host vs a bad path.
  - `ip` — v4 vs v6 when the format accepts either.
  - `stringFormat` — already discriminates through the `formatPath` tail
    (`minLength`, `pattern`, ...), so it may need nothing. Decide rather than
    assume.
- A format whose constraint either holds or does not (`uuid`, a plain pattern)
  must keep leaving `type` unset. Adding a filler value is worse than nothing.

## Done when

- Each format examined has either a documented `type` or a recorded reason it
  has only one failure mode.
- Every mode name is a stable documented string, and the modes for one format
  are listed where its params are documented.
- Tests pin the modes per format, in the same shape as
  `packages/run-types/test/features/formatErrorType.test.ts`.
- The website says what `type` is and how to switch on it.

## Plan — approved 2026-09-01

Three parts, one PR.

**Rename.** `TypeFormatError.type` becomes `errorType`. `type` was too generic
next to `name`, and the friendly-text renderer already uses the literal key
`'type'` for a base type-shape failure. The Go helper `formats.FormatErrorTypeProp`
becomes `FormatErrorTypeProp` and emits `errorType:`.

**Roster.** The formats that genuinely collapse more than one failure:

| Format | Modes | Where |
| --- | --- | --- |
| `email` | `format`, `localPart`, `domain`, `addressLiteral`, `length` | RFC path (`EmailAddress` / `IdnEmail`) |
| `email` | `localPart`, `domain` | decomposition path (`EmailStrict`) |
| `domain` | `label`, `tld`, `punycode`, `bidi`, `length` | IDNA path (`Hostname` / `IdnHostname`) and decomposition path (`DomainStrict`) |
| `ip` | `address`, `port` | only when `allowPort` is on |

Left unset, with the reason: `url`, `uuid`, plain-pattern `email` / `domain`,
`stringFormat` and every numeric / datetime / structural format push one error
per param and the `formatPath` tail already names it; `ip` without `allowPort`
has one way to fail; whole-value bounds on a composite format (`maxParts`, a
root `maxLength`) name themselves through `formatPath`.

The pure fns (`isIdnHostname`, `isEmailAddress`, `isIPV4`, `isIPV6`) return
the mode instead of a boolean, `''` meaning valid, the way `isCreditCard`
already does, so validate compares against `''` and pays nothing. The RFC and
IDNA paths bind the mode to one local and fold declared length bounds in as
`'length'`. The decomposition paths thread a type expression through
`stringErrorStatements`.

**Inferred generic.** `TypeFormatError<Name, Mode>` and
`RTValidationError<Format>` gain parameters with wide defaults. One exported
mode union per format (`CreditCardErrorType`, `EmailErrorType`,
`DomainErrorType`, `IpErrorType`). `FormatErrorsOf<T>` walks `T` the way
`DataOnly<T>` does and yields a union of `TypeFormatError<Name, Mode>` for
every format leaf, reading name and params through `FormatNameOf` /
`FormatParamsOf`. `GetValidationErrorsFn<T>`, `ParseError`, `ParseFn` and
`RTValidationIssue` return the narrowed type; every consumer keeps the wide
default, which the narrowed type assigns to. Result: `switch (err.format?.name)`
narrows `errorType` per format.

No fuzz suite: no cheap oracle beyond "the mode is a documented string".

## Shipped — 2026-09-01

Everything in the plan above landed, with two decisions the plan did not spell
out:

- **The validator type is parameterized over the error, not over `T`.**
  `GetValidationErrorsFn<Format extends TypeFormatError = TypeFormatError>`
  returns `RTValidationError<Format>[]`, and the factory hands back
  `GetValidationErrorsFn<FormatErrorsOf<T>>`. A parameter that only appears
  inside a conditional type (`FormatErrorsOf<T>`) is not measurably covariant,
  so a validator over `T` would not have assigned to the wide one every
  consumer takes. Over `Format` it does. The always-empty fallbacks are typed
  `GetValidationErrorsFn<never>` for the same reason.
- **The domain half of a decomposed email carries no tag.** Its errors already
  carry the `domain` format name (with `label` / `tld` for a decomposed
  domain), so `format.name` tells the halves apart and a second `'domain'`
  marker would have been redundant. `EmailErrorType` therefore covers the
  RFC path plus `format` / `localPart` on the decomposition path.

Files of record: the roster with its reasons in
`ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go`
(`FormatErrorTypeProp`), the mode unions next to their params in
`packages/run-types/src/formats/string/`, the walk in
`packages/run-types/src/runtypes/formatErrors.ts`, and the website table on
the validation guide.
