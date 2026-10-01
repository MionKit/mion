---
type: fix
spec: guidelines
status: ready
created: 2026-10-01
---

# Split Domain and Email Into a Pattern Format and a Parts Format

## Intent

`Domain` and `Email` are the quick formats: one regex plus length bounds, nothing else. Splitting the value
and checking each part belongs only to the parts formats. Today the types blur that line: `DomainParams`
offers `maxParts`, `minParts`, `names` and `tld` to every domain preset, so the quick presets accept options
they never check.

```ts
type Site = TF.Domain<{maxParts: 2}>; // compiles, but 'a.b.other.org' still validates
```

The fix makes such an option a type error on the quick presets, and renames the strict presets so the name
says what they do:

| Today | After |
|---|---|
| `TF.DomainStrict` / `TF.domainStrict` | `TF.DomainParts` / `TF.domainParts` |
| `TF.EmailStrict` / `TF.emailStrict` | `TF.EmailParts` / `TF.emailParts` |

## Direction

- **Two params types per family** in `packages/run-types/src/formats/string/stringFormats.ts`:
  - `DomainParams`: the quick road only (`maxLength`, `minLength`, `pattern`, `mockSamples`, `transform`, plus
    `idna` for the host-name presets). Used by `Domain`, `DomainUnicode`, `DomainPunycode`, `Hostname`,
    `IdnHostname` and their builders.
  - `DomainPartsParams`: adds `maxParts`, `minParts`, `names`, `tld`. Used by `DomainParts` only.
  - Same split for email: `EmailParams` (quick road, plus `emailRfc` for `EmailAddress` / `IdnEmail`) and
    `EmailPartsParams` (adds `localPart`, `domain`). The `domain` half takes `DomainPartsParams | DomainParams`
    so it can split or not.
- **Go keeps routing by key**, and the build rejects a parts option on the quick road:
  `domainEmitter.ValidateParams` (`ts-go-runtypes/internal/cachegen/typefunctions/formats/string/domain.go`)
  fails (FMT002) when `maxParts` / `minParts` appear without `names`/`tld`; same check for an email domain half.
  That covers the JSON Schema door and hand-written annotations, which the TS types do not reach.
- **Rename** `DomainStrict` → `DomainParts`, `EmailStrict` → `EmailParts`, the builders, `DEFAULT_STRICT_DOMAIN_PARAMS`
  and friends, and every user (tests, mocks, Go comments, the benchmark cases under `container/benchmarks/`).
  The old names leave no trace (CLAUDE.md "A removed thing leaves NO trace").
- `allowedValues` is a whole-value check, not a parts one: it stays on the quick `Domain` / `Hostname`, and
  the pattern and IDNA roads actually emit it (today they ignore it).
- The implementer plans the details.

## Docs

- `container/website/content/02.runtypes/03.type-formats/02.string.md`: the preset table and the email /
  domain paragraphs, new names, and one line saying the quick presets check the pattern only.
- `container/website/content/02.runtypes/02.guide/03.validation.md`: the errorType table rows.
- `CHANGELOG.md`: the rename (a breaking change).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

The quick presets reject a parts option at the type level and at build time; `DomainParts` / `EmailParts`
replace the strict names everywhere with no trace of the old ones; format-validation and type tests pin both;
docs updated; the simplify-docs pass ran on every touched page and the simplify-comments pass on every
touched source file, each committed on its own.

## Plan (approved 2026-10-01)

## Context
`Domain`/`Email` are meant to be the quick checks: regex + length. Splitting and checking parts belongs to
the strict presets. Today `DomainParams` offers `maxParts`/`minParts`/`names`/`tld` to every domain preset
(and `EmailParams` offers `localPart`/`domain` to `Email`/`EmailPunycode`), so the quick presets accept options
they never check. Also `allowedValues` is offered on `Domain`/`Hostname` and never checked (user decision:
keep it there and enforce it). Spec: `docs/todos/domain-email-parts-split.md`.

## Types (`packages/run-types/src/formats/string/stringFormats.ts`)
- `DomainParams` = quick road: `maxLength`, `minLength`, `pattern`, `mockSamples`, `allowedValues`, `transform`.
  Used by `Domain`, `DomainUnicode`, `DomainPunycode`, `Hostname`, `IdnHostname` + builders.
- `DomainPartsParams extends DomainParams` adds `maxParts`, `minParts`, `names`, `tld`. Used by `DomainParts`.
- `EmailParams` = quick road (drop `localPart`/`domain`). Used by `Email`, `EmailAddress`, `IdnEmail`,
  `EmailPunycode` (their `Override<..., 'localPart'|'domain'>` pins go away, nothing left to pin).
- `EmailPartsParams extends EmailParams` adds `localPart: StringParams`, `domain: DomainParams | DomainPartsParams`.
- Rename: `DomainStrict`→`DomainParts`, `domainStrict`→`domainParts`, `EmailStrict`→`EmailParts`,
  `emailStrict`→`emailParts`, `DEFAULT_STRICT_DOMAIN_PARAMS`→`DEFAULT_DOMAIN_PARTS_PARAMS`,
  `DEFAULT_STRICT_EMAIL_PARAMS`→`DEFAULT_EMAIL_PARTS_PARAMS`; export list in `src/formats/index.ts`.
- Error-type doc comments (`DomainErrorType`, `EmailErrorType`) use the new names.

## Go (`ts-go-runtypes/internal/cachegen/typefunctions/formats/string/`)
- `domain.go` pattern road: append the `allowedValues` check to `namedPatternValidate` / `namedPatternErrors`
  output (reuse `readValuesParam`, `valuesSource`, `emitPatternTest`, `messageLiteral`, `formatErrWithType`;
  same order on both lanes). IDNA road (`idnaCheckExpr` / `idnaErrorsBlock`): same append.
- `domainEmitter.ValidateParams`: FMT002 when `maxParts`/`minParts` appear without `names`/`tld`
  (catches JSON Schema / hand-written annotations the types do not reach).
- `emailEmitter.ValidateParams`: same check on a `domain` half without `names`.
- Comments naming `FormatDomainStrict` / `FormatEmailStrict` updated.

## Other users of the old names (no trace left)
- Tests under `packages/run-types/test/` (StringFormat.ts suite, formatErrorType, formatErrorsOf, typesafety,
  emailLaneAgreement, formatLengthOverrides), Go tests (`errortype_test.go`, `email_lane_agreement_test.go`).
- Mocks: `mockStringFormat.ts` comment; `mockEmail` reads `localPart`/`domain` via `EmailPartsParams`.
- `formatErrors.ts`: unchanged logic (keys off `names`/`localPart`), check it still types.
- Benchmarks: case key `STRING_FORMAT.domainStrict`/`emailStrict` → `domainParts`/`emailParts` in
  `container/benchmarks/shared/...` and every competitor's `cases.ts` / `schemaCases.ts`.
- `string-patterns.ts` comment.

## Tests
- Go: pattern road and IDNA road emit `allowedValues` on both lanes; `ValidateParams` rejects
  `maxParts` without `names` on domain and on an email domain half; accepts it with `names`.
- Vitest (new `packages/run-types/test/features/domainQuickVsParts.test.ts`):
  `Domain<{allowedValues}>` and `Hostname<{allowedValues}>` reject other domains, validate and errors agree
  (formatPath `['allowedValues']`); `DomainParts`/`EmailParts` still enforce parts; type-first ≡ value-first
  ids for `DomainParts` (marker rule, both `getRunTypeId` shapes).
- Type tests (`typesafety.test.ts`): `@ts-expect-error` on `TF.Domain<{maxParts: 2}>`,
  `TF.Email<{localPart: {...}}>`, `TF.domain({maxParts: 2})`.

## Docs
- `container/website/content/02.runtypes/03.type-formats/02.string.md`: preset table + email/domain lines
  (new names; quick presets check pattern + length, `allowedValues` on domain).
- `container/website/content/02.runtypes/02.guide/03.validation.md`: errorType table rows.
- CHANGELOG is generated by git-cliff from commits: use a `feat(formats)!:` breaking commit subject instead
  of hand-editing it.
- Then the `docs-simplifier` pass, committed alone.

## Fuzzing
Rename + type split + one enforced param: no new oracle, not a fuzz candidate.

## Finish
Append plan to spec; rebuild resolver (`pnpm miondevx core build`), `go test`, targeted vitest, `pnpm test`
(or `test:ci`), `pnpm run lint`, `pnpm run format`; `git mv` spec to `docs/done/`; docs + comments simplifier
passes in parallel, each its own commit; push; open PR labelled `website`, `bench`, `pre-publish-e2e`
(public API rename).

## What shipped

- Types: `DomainParams` / `EmailParams` are the quick road; `DomainPartsParams` / `EmailPartsParams` extend
  them with the split keys. `TF.Domain<{maxParts: 2}>` and `TF.domain({maxLength: 100, maxParts: 2})` are
  type errors. A type-first override that MIXES a quick key with a split key
  (`TF.Domain<{maxLength: 100; maxParts: 2}>`) still passes the generic bound (TypeScript runs no excess
  property check on type arguments), so the build check below is what stops it.
- Go: `partsBoundsWithoutNames` (domain.go) fails the build (FMT002) on `maxParts` / `minParts` without
  `names`/`tld`, on a domain and on an email's domain half. `allowedValues` is emitted on the pattern AND the
  IDNA road, validate and errors in the same order, errors with no `errorType`.
- `EmailAddress` / `IdnEmail` no longer pin `localPart` / `domain`: those keys are gone from `EmailParams`.
- Renames applied to the source, tests, Go comments, benchmark case keys (`STRING_FORMAT.domainParts`,
  `STRING_FORMAT.emailParts`) and both website pages. CHANGELOG comes from the `feat(formats)!:` commit.
- Tests: `domain_quick_road_test.go`, `domainAllowedValues.test.ts` (both marker shapes, mock soundness),
  `typesafety.test.ts` (`assertionsQuickPresetsRejectParts`); `jsonSchemaDialectSpec.test.ts` moved its
  localPart case from `TF.Email` to `TF.EmailParts`.
