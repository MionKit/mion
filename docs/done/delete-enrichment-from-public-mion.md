---
type: chore
spec: full-plan
status: done
created: 2026-11-13
---

# Delete enrichment from public mion (0.20.0)

## Problem

Enrichment (`FriendlyText<T>`, `MockData<T>`, the `createMockDataFn` `data` option, i18n translation
files and the `mion enrich` CLI verb) moves to a separate private product. Public mion must build,
test and document none of it, while keeping every seam that product builds on.

## What shipped

- **Go:** `pkg/enrichment`, the `enrich` verb and its serve flags, the `enrich` op and the `checkEnrich`
  scan check, the `enrich-text-*` / `enrich-mock-*` / `enrich-mirror-*` codes, `FamilyEnrich`, the
  tsconfig `i18n` plugin key and the `enriched/` genDir row are gone. `splitArgs` / `mustAbs` /
  `isDirArg` moved to `pkg/cli/cli.go` for `convert` and `drizzle-migrate`.
- **run-types:** `src/enrich` (FriendlyText, MockData, `createFriendlyText*`), the `data` / `dataNode`
  mock options, the three bundled agent skills and the `mion-skills` bin are gone. The per-node mock
  `hook` covers what `data` did. The mock error hints point at the hook.
- **devtools:** the `enrich` plugin option, the dev sync, the production completeness gate, the
  `enriched/` HMR suppression, `ResolverConnection.enrich`, the `--enrich-*` spawn flags, the
  `checkEnrich` lint request and the enrichment-file lint pre-filter are gone.
- **Tooling:** the enrich, i18n, typemod and race fuzz lanes, their env vars and CI steps are gone.
- **Docs:** the AI integration section, `docs/AI_ENRICHMENT.md`, the enrich skill and the enrichment
  e2e preflight are gone. The mocking page has a "Per-Node Hook" section instead of the `data` option.

## Kept on purpose

- The 0.14.1 extension points: registries for verbs, ops, scan checks, session flags, plugin keys,
  genDir entries, codes, areas and families; the `capabilities` op; `Request.Ext` / `Response.Ext`;
  the devtools extension hooks; the pro launcher lookup in `@mionjs/bin-compiler`.
- `Definition.Completeness` and `IsCompleteness`: a generic gating bit an extension's codes can set.
- `FormatErrorKeys`, the `isCurrency` echo on number format errors, and `Session.Checker()`.
- `RunTypeMockOptions<T>`: `T` types nothing in mion, but an augmentation must declare it to type its own
  fields (a `data` option) against the mocked type.
- The `enriched/` folder: an extension registers it back through `cli.Extension.GenDirEntries`.
- The pattern-sample pass (`pattern_enrich.go`, `enrichPatternSamples`) and `createMockDataFn`.
- The website's `[[lang]]` routing.

## Done when

Go vet + tests, `pnpm test`, `codegen --check`, `fuzz all`, the website build, lint, format and
`check:tree` pass, and the repo grep for enrichment names shows only the kept items above.
