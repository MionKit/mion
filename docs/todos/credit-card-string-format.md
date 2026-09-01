---
type: feature
spec: guidelines
status: ready
created: 2026-09-01
---

# Credit card string format

## Intent

Add a `CreditCard` string format so a type can say "this is a card number"
and get real validation, not just a shape check. The checksum is the point:
a regex can tell `4111111111111111` from `hello`, but only the Luhn checksum
catches a typo'd digit. Useful anywhere a payment field is typed.

## Direction

The implementer plans the details. Verified pointers:

- Base type is a string format, same road as `uuid` and `email`.
  Type alias goes in `packages/run-types/src/formats/string/stringFormats.ts`
  (see `UUIDv4` at line 285 and `Email` at 476 for the two shapes:
  plain `TypeFormat<...>` vs `PresetFormat<...>`).
- The checksum cannot be a regex, so it needs a pure fn, exactly like
  `isUUID` and `isEmailAddress`. Register it in
  `packages/run-types/src/formats/string/string-formats-pure-fns.ts` with
  `registerPureFnFactory('rtFormats::isCreditCard', ...)`. Follow the
  existing rules there: tables and helpers stay inside the factory body
  (the Go extractor lifts the body alone), and reach other pure fns only
  through `utl.getPureFn(...)`, never a plain import.
- Go emitter: one new file next to
  `ts-go-runtypes/internal/cachegen/typefunctions/formats/string/uuid.go`,
  registered via the registry in `.../formats/registry.go`. The Go name and
  the JS format name must match, that lock-step is a stated invariant.
- Mock side: a `case` in the switch in
  `packages/run-types/src/mocking/mockStringFormat.ts:33`, generating
  numbers that actually pass the checksum.
- Open questions for the implementer to settle: whether to accept spaces
  and dashes as separators, whether to expose a brand/issuer param (visa,
  mastercard, amex, ...) that narrows length and prefix, and whether length
  is checked before the checksum.

## Done when

- A `CreditCard` type validates a real card number and rejects one with a
  single digit changed.
- Validation logic lives in a registered pure fn, following the existing
  import and factory conventions.
- Mock data generates values that pass the format's own validation.
- Tests on both the Go and JS sides, including both `getRunTypeId` call
  shapes per the Marker test coverage rule.
- Website docs list the new format.
