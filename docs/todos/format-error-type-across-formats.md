---
type: feature
spec: guidelines
status: ready
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
- Emitters attach it through `formats.FormatTypeProp` in
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
