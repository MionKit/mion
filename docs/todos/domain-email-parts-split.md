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
- **Open question for the user:** `allowedValues` is a whole-value check, not a parts one. Keep it on the
  quick `Domain` (and then actually emit it on the pattern road, which today ignores it), or move it to
  `DomainParts` only?
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
