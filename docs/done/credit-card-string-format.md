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

## Plan — as built (approved 2026-09-01)

Shipped as `TF.CreditCard`, format name `creditCard`, builder `TF.creditCard()`.

### Decisions taken during planning

- **One type, no per-network presets.** Everything rides the one params object,
  so every call site reads the same way. There is no `TF.Visa` / `TF.Amex`.
- **`networks` is a LIST**, so one field can accept several. Omitting it means
  any network.
- **`separators` is a string of the characters allowed between digits**, and it
  DEFAULTS to `' -'` (`DEFAULT_CREDIT_CARD_PARAMS`, the same shape as
  `DEFAULT_IP_PARAMS`). Spaces and dashes are how a card number is printed and
  typed, so accepting them is the useful default rather than an opt-in. A
  leading or trailing separator, or two in a row, is still rejected, and
  `separators: ''` is the digits-only opt-out.

```ts
type Card  = TF.CreditCard;                                  // 4111 1111 1111 1111 too
type Card2 = TF.CreditCard<{networks: ['visa']}>;
type Card3 = TF.CreditCard<{separators: ''}>;                // digits only
```

### What landed

- `packages/run-types/src/formats/string/stringFormats.ts` — `CardNetwork`,
  `CreditCardParams`, `CreditCard<P>`, and the `creditCard` builder; exported
  from `packages/run-types/src/formats/index.ts`.
- `packages/run-types/src/formats/string/string-formats-pure-fns.ts` — TWO
  registrations with NO `getPureFn` edge between them:
  - `rtFormats::isCreditCard` — digits, length 12 to 19, the Luhn checksum, in
    one right-to-left pass with no intermediate string.
  - `rtFormats::matchesCardNetwork` — the per-network prefix and length table.

  The split is the point: the Go emitter references the second only when the
  format names `networks`, so a bare `TF.CreditCard` never ships the table. A
  dependency edge would have defeated it, since the extractor records transitive
  deps. Each strips separators itself, which is what buys the independence.
- `ts-go-runtypes/internal/cachegen/typefunctions/formats/string/creditcard.go`
  — the emitter. Validate, errors (payload carries the declared networks, or
  `any`), a format transform that strips the declared separators, and
  `ValidateParams` rejecting an unknown network, an empty list, and a digit used
  as a separator. `mockSamples` is deliberately dropped from the emitted params.
- `packages/run-types/src/mocking/mockStringFormat.ts` — a `creditCard` case
  drawing from the publicly published gateway test numbers, one pool per
  network, so a mock re-passes the network check too.
- `ts-go-runtypes/internal/schemadoc/leaf.go` — a `creditCard` row so
  `mion convert` prints the type, same treatment as `email` / `ip` / `url`.
- Both generated mirrors regenerated (`typeFormats.generated.ts`,
  `table.generated.go`).

### Tests

- `test/suites/format-validation/StringFormat.ts` — five cases (`creditCard`,
  `creditCard_noSeparators`, `creditCard_dotSeparator`, `creditCard_network`,
  `creditCard_multiNetwork`), 60 tests, covering both marker call shapes plus
  the mock-re-validates check.
- `test/suites/format-transform/StringFormat.ts` — two cases: the default
  separators are stripped, and `separators: ''` is identity.
- `formats/string/creditcard_test.go` — including the load-bearing one: a
  format with no networks reaches for `isCreditCard` ALONE.
- `test/fuzz/type/creditCardLuhn.unit.test.ts` — the property fuzz. Over
  thousands of generated numbers, changing any single digit must be rejected;
  grouped input round-trips; a number the network check accepts always passes
  the base check. Rides the existing `unit` lane, so no new lane or workflow.

### Docs

- `container/website/sites/runtypes/content/02.guide/02.type-formats.md` — the
  format table row plus a paragraph and a `<code-import>` example.
- `packages/examples/src/guide/type-formats-credit-card.ts` — the imported
  example, compiled by the root typecheck so it cannot drift.

## Follow-up landed in the same change: `TypeFormatError.type`

A card number has THREE ways to fail and a caller usually wants to say something
different about each, which the single opaque format error could not express.
So the error envelope grew a general field rather than a card-specific one:

- `TypeFormatError.type?: string` — WHICH way the format failed, for a format
  with more than one way to fail. Declared in
  `packages/run-types/src/createRTFunctions.ts`, mirrored in
  `packages/run-types/src/runtypes/pure-fns-utils.ts`.
- `formats.FormatTypeProp` in
  `ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go` is the door
  any emitter attaches it through. It takes a JS EXPRESSION, so a mode only
  known at runtime needs no baked-in literal.
- `creditCard` is the first user: `format`, `checksum`, `network`.
  `isCreditCard` returns the mode instead of a boolean, so validate compares
  against `''` and the hot path pays nothing; the errors lane emits a block with
  one local and branches.
- Pinned by `packages/run-types/test/features/formatErrorType.test.ts`, both
  marker call shapes, including that `uuid` (a single failure mode) leaves
  `type` unset.
- `docs/todos/format-error-type-across-formats.md` tracks reviewing the other
  formats for modes worth naming.

## The network table has ONE copy

The prefix / length table is fiddly (prefix ranges per network, the lengths each
issues) and it was written twice: once in the validator's pure fn, once in the
mock generator. Two copies could drift into a mock that generates cards its own
format rejects, so it moved behind a third pure fn:

- `rtFormats::cardNetworkRules` holds the table and returns it, frozen.
- `rtFormats::matchesCardNetwork` reaches it through `utl.getPureFn`. The
  extractor records the dep edge on its own, so the table ships as its own
  module and only when a format declares `networks`; `isCreditCard` still has no
  deps at all.
- The mock is ordinary code and looks it up through `getRTUtils()`, lazily, so
  importing the mock module before the registrations run cannot bite.

A plain module export would be simpler and does NOT work: a pure-fn factory body
is inlined without its lexical environment, so a factory referencing an imported
const fails the build with PFE9011 (`purity.go` seeds the scope from the
factory's params and its own body declarations only). A pure fn is the one thing
a factory can reach out to.

Pinned by a test asserting both sides get the same object by IDENTITY, not by
deep equality.

## The mock file only mocks

A follow-up pass moved everything that describes what a card number IS out of
`mockStringFormat.ts` and into the format's own module, so the mock file holds
only picking and shuffling:

- `CARD_NETWORKS` is now a runtime list in `stringFormats.ts` and the
  `CardNetwork` union is DERIVED from it, so a list and a union cannot disagree.
- `rtFormats::luhnSum` is a new pure fn holding the doubling rule once. The
  validator asks whether the sum is a multiple of 10; the mock generator asks
  which final digit would make it one. Both used to spell the loop out.
- `getCardNetworkRules()` and `luhnCheckDigit()` are exported from
  `string-formats-pure-fns.ts` as the doors for code OUTSIDE a factory. The
  string keys and casts live there once instead of at every call site. A pure-fn
  registration cannot be exported and called directly: it returns a
  `CompiledPureFunction` descriptor and materialising it is private to
  `rtUtils.ts`, so `getPureFn` is the only door — these functions just wrap it.
- The fuzz lane uses `luhnCheckDigit` too, so it is no longer grading the
  validator against a second implementation of the same rule.

Dep graph after the move, with the isolation intact:

| pure fn | deps |
|---|---|
| `luhnSum` | none |
| `isCreditCard` | `luhnSum` |
| `matchesCardNetwork` | `cardNetworkRules` |
| `cardNetworkRules` | none |

## The whole format lives in one module

`packages/run-types/src/formats/string/credit-card-pure-fns.ts` holds the entire
feature: the public `CreditCard` type, `CreditCardParams`, `CARD_NETWORKS`, the
`creditCard` builder, all four pure fns, and the two doors ordinary code uses.
The card format carries more machinery than any other string format, and this is
the shape to copy for the next one that outgrows the shared files.

Re-exported from `src/formats/index.ts` (the barrel), NOT from
`stringFormats.ts`: the card module imports `presetFormatBuilder` and `Override`
from there, so re-exporting back would be a value-level import cycle. One
direction only, and the barrel joins them. Those two helpers had to become
exported; they were module-private before.

Merging the files also removed a real duplicate — `CreditCardParams` was declared
twice, once public and once as a private wire-shape mirror.

Two things had to follow the file:

- `src/formats/index.ts` side-effect imports it, so the registrations still
  happen before any user code touches the format.
- The Go emitter records the source path the resolver registers the fns under,
  now `creditCardPureFnFilePath` with its own `cardPureFnAlias` binding, and
  `cmd/gen-builtin-purefns/main.go` lists the module in its scan set. Miss either
  and the fns silently stop being delivered to published consumers.

Two things still have to follow the file, and both are silent if missed:

- `src/formats/index.ts` side-effect imports it, so the registrations happen
  before any user code touches the format.
- The Go emitter records the source path the resolver registers the fns under
  (`creditCardPureFnFilePath` with its own `cardPureFnAlias` binding), and
  `cmd/gen-builtin-purefns/main.go` lists the module in its scan set. Miss either
  and the fns stop being delivered to published consumers.

