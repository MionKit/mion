---
type: fix
spec: full-plan
status: ready
created: 2026-10-01
---

# Generate Each Format's Error Keys From Its Validation Code

## Problem

A FriendlyText `rt$errors` key must match the key a validation error carries (`format.formatPath`, always
one segment, built only by `FormatErrCallWith`, `ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go:15-22`).
No code knows those keys today. Go and TS both guess them as "every param key minus a hand list"
(`nonFailingParams`, `ts-go-runtypes/internal/enrichment/enrich.go:196`; `NON_FAILING_PARAMS`,
`packages/run-types/src/enrich/friendlyText.ts:33`). The guess is wrong in both directions:

- **Keys that are not params, so never scaffolded or allowed:** creditCard `creditCard` (creditcard.go:98),
  date/time `format` when omitted (date.go:41-51,104; time.go:96), dateTime `splitChar`/`date`/`time` when
  omitted (datetime.go:142-150), ip `version` when omitted (ip.go:22-26,82), domain `hyphen` (domain.go:221),
  email `@` (email.go:155), `isRegex` (stringformat.go:207).
- **Params that never fail, so scaffolded or required for nothing:** creditCard `separators`, ip `allowPort`
  and `allowLocalHost`, stringFormat `contentEncoding`, email `localPart`/`domain`, domain `names`/`tld`,
  formattedObject `closedPatterns`/`additionalOwn`, plus the five on the hand list.
- **Renamed params:** Go renames `minimum/maximum/exclusiveMinimum/exclusiveMaximum` to `min/max/gt/lt`
  (`internal/cachegen/runtype/typeid/formats.go:141-163`) before the emitters run, so the error key is `gt`.
  The TS type still requires `exclusiveMinimum` (raw `keyof P`) and then rejects the `gt` key the scaffold writes.
- **Mode-dependent keys:** email with `emailRfc` emits only `emailRfc`, domain with `idna` only `idna`;
  their `maxLength`/`minLength` fold into `errorType: 'length'` (email.go:77-86, domain.go:133-142), yet both
  are scaffolded and required. `integer` and `uniqueItems` error only when `true`.

A hand list also rots silently: a new param or a new format joins it only if someone remembers.

## Plan

### Design rule

No hand list of keys. Where a hand-maintained input is unavoidable (step 3's sample params), a new format or a
new param must FAIL a check until its author adds it or excludes it on purpose with a written reason.

### 1. Go: read the keys out of the error code

All error code goes through `FormatErrCallWith`, which always writes `formatPath:['<key>']` (emit.go:21).

- Add `ScanErrorKeys(code string) []string` in `formats/emit.go`, beside `FormatErrCallWith`: every
  `formatPath:['x']` in the code, sorted and deduped. A unit test builds calls with `FormatErrCallWith` and
  scans them back, so the two cannot drift.
- Add `ErrorKeysFor(rt *reflection.RunType) []string` in the formats package: `LookupForRunType(rt)`
  (registry.go:130), run its `EmitValidationErrorsCheck` with a key-collection `EmitContext` (no engine,
  no pure-fn registration side effects), and scan the result. Exact per field: renames, modes and
  "only when true" come for free.
- The few errors built outside the registry (`typefunctions/validationerrors.go:113-166`: `pattern`,
  `propertyNames`, `minContains`, `maxContains`) belong to structural sentinels, out of scope below.

### 2. Go: enrichment uses the scanned keys, the hand list goes

- `formatConstraintKeys` (enrich.go:179-194) becomes `formats.ErrorKeysFor(rt)`; the enrichment package
  blank-imports `formats/all`. Delete `nonFailingParams`. This drives the scaffold (emit.go:91-100), the sync /
  reconcile, and FT003 (validate.go:340-351).
- `knownConstraintKeys` (mirror/merge.go:325-335) becomes `type` plus the union of every format's keys from
  step 3, so a stale key of any format is orphaned on sync (17 real keys are missing from it today).
- New warning, "missing message key": a format field's `rt$errors` lacks a scanned key and has no
  `rt$default`. Warning, like FT003; next free FT code. Follow the add-diagnostic skill and run
  `pnpm miondevx core codegen diag`. Needed because the TS type stops requiring keys (step 4).

### 3. Sample params: the one hand-maintained input, hard-failing

The TS type needs each format's keys over ALL its params, not one field. Compute them by scanning the error
code of a set of sample param maps per format.

- New `formats/errorkeys_samples.go`: `map[formatName][]map[string]any`, one entry per branch (every mode,
  alias, "only when true", omitted defaults), plus `excludedParams map[formatName]map[param]reason` for a param
  deliberately left out (the reason string is required and non-empty).
- `AllErrorKeys(name)` = union of `ScanErrorKeys` over that format's samples, after `canonicalizeBoundAliases`.
- **Hard fail, new format (Go):** a test loops `formats.Registered()` and fails for any format with no samples:
  "format X has no error-key samples; add them in errorkeys_samples.go".
- **Hard fail, new param (TS):** codegen also emits the param keys each format's samples cover
  (`FORMAT_SAMPLED_PARAMS`, sampled plus excluded). A compile test in `packages/run-types/test/types/` maps
  every generated `FormatName` to its params type:

      const paramsByFormat = {...} satisfies Record<FormatName, unknown>  // new format: compile error until added

  and asserts per format `Exclude<keyof Params, SampledParams[Name]>` is `never`. A new param on
  `NumberParams` (`src/formats/numberFormats.ts:12-35`) fails it until it is sampled or excluded.

### 4. Codegen: the keys reach TS

Extend `cmd/gen-type-formats` (walks `formats.Registered()`, writes
`packages/run-types/src/go-generated/typeFormats.generated.ts`) to also emit:

    export type FormatErrorKeys = {numberFormat: 'integer' | 'max' | ...; creditCard: 'creditCard' | 'networks'; ...};
    export const FORMAT_ERROR_KEYS = {...} as const;
    export type FormatSampledParams = {...};   // step 3

It stays under `pnpm miondevx core codegen typeformats [--check]` (scripts/miondevx.mjs:161), already checked
in CI (`.github/workflows/ci.yml:200`). Extend `TestTypeFormatsFileInSync` (`cmd/gen-type-formats/gen_test.go`).

### 5. TS: the type allows only real keys, requires none

In `friendlyText.ts`, `ErrorTemplates<F>` (58-64) reads both sentinels, `__rtFormatName` and
`__rtFormatParams` (`src/runtypes/typeFormat.ts:33-36`), and `ConstraintTemplates` becomes:

    {type: FriendlyTemplate} & {[K in FormatErrorKeys[Name]]?: K extends CountBearingKeys ? TemplateLeaf : FriendlyTemplate} & {rt$default?: never}

- Keys are optional; an unknown key stays an excess-property error. Delete `NON_FAILING_PARAMS` and
  `NonFailingParams`. A format name missing from the table falls back to `BareTemplates`.
- `#region friendlytext-extract` must stay self-contained, so `test/types/enrichHarness.ts` adds the generated
  `FormatErrorKeys` declaration to `FRIENDLY_PREAMBLE`, the way `SENTINEL_KEYS_PREAMBLE` is added; the source
  imports the type outside the region.
- `CountBearingKeys` stays as is.

### 6. Tests that used the hand list

- Delete `packages/run-types/test/suites/enrich/nonFailingParams.test.ts`.
- `packages/devtools/test/bench-lane-contracts.test.ts:100-131` loads `FORMAT_ERROR_KEYS` by path (devtools
  must not depend on run-types) and checks every `formatPathTail` in the shared bench cases is a real key.

## Tests

- **Go scan:** `ScanErrorKeys` round-trips `FormatErrCallWith`; `ErrorKeysFor` on CreditCard (`creditCard`),
  `{exclusiveMinimum: 0}` (`gt`), Hostname (`idna` only), EmailAddress (`emailRfc` only), IP with no version
  (`version`), `{integer: false}` (none), float/isCurrency (none).
- **Go coverage:** every registered format has samples; every `excludedParams` reason is non-empty.
- **Go enrichment:** scaffold and FT003 use the scanned keys (FT003 on `separators`); the missing-key warning
  fires, and not when `rt$default` is set. Update `emit_test.go`, `validate_test.go`, `mirror/translate_test.go`.
- **TS coverage compile test** (step 3): fails on an unmapped format or an unsampled param. Prove it once by
  adding a throwaway param locally and watching it fail.
- **TS FriendlyText compile test** (`test/types/friendlyText.compile.test.ts`): the `Fmt` helper also brands
  `__rtFormatName`; `creditCard` key accepted, `isCurrency`/`separators` rejected, a missing key is NOT a type
  error, `gt` accepted on an `exclusiveMinimum` field. Re-measure every budget; any raise needs the maintainer's OK.
- **Scaffold cases:** update the authored literals in `test/suites/enrich/cases/*.ts`; `enrichGen.test.ts`,
  `enrichCheck.test.ts`, `enrichReconcile.test.ts` pass.
- Gate: `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm test`, `pnpm miondevx core codegen all --check`.

## Docs

`container/website/content/02.runtypes/05.ai-integration/02.friendly-text.md`, existing section
"Error Message Keys" (lines 66-83): say the editor accepts only keys your type can fail, and the compiler warns
about a missing or unknown one (the sync fills missing ones). Add the non-param keys to the table (`creditCard`,
`format`, `networks`, `emailRfc`, `idna`, `@`, `hyphen`); fix the `date`/`time` row to say dateTime.

The contributor rule for adding a format or a param (samples or a written exclusion) goes in
`ts-go-runtypes/CLAUDE.md`, next to the format emitter notes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

Optional, via the fuzzy-testing skill: random param maps per format, checking the scan never yields a key
outside `AllErrorKeys(name)`. A hit means the samples miss a branch.

## Out of scope

- Generating `CountBearingKeys` / `CountBearing` (`enrichment/classify.go:5-17`) from the emitters.
- `rt$errors` keys for structural formats and their sentinels: `FriendlyNode` gives arrays, Map/Set and objects
  no format keys (friendlyText.ts:94-111, enrichment/emit.go:85-90). If still true at build time, hand it to the
  delegate-finding skill.
- Message wording, the renderer, `rt$default` behaviour.

## Done when

- No hand list of keys exists in Go or TS: per-field keys come from scanning the error code.
- The only hand-maintained input (sample params) hard-fails CI for a new format or a new param until it is
  sampled or excluded with a reason.
- Scaffold, sync, FT003 and the new missing-key warning use the scanned keys; `knownConstraintKeys` is derived.
- The TS type accepts only generated keys, requires none, and the codegen check guards the generated file.
- The CreditCard, `exclusiveMinimum`, Hostname, EmailAddress and IP cases scaffold the right keys.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
