---
type: feature
spec: guidelines
status: done
created: 2026-09-29
---

# A readable name for every diagnostic

## Intent

A code like `MRT003` or `VL002` tells the reader nothing, so a comment such as
`/* @mion-expect-error MRT003 */` needed a second comment to explain it. Every diagnostic now has a
human readable name, prefixed by the functional area it belongs to:

```ts
// @mion-expect-error rpc-handler-throws
```

## What shipped

**The name replaces the code.** The Go side never parses a code's shape (exact map lookups through
`CodeXxx` constants), so there is one name per diagnostic: no slug-to-code table, no "accept both"
logic in Go or JS, no doubled tests. An old code fails like any unknown name, with no fallback or
hint. The project was at 0.12, so the break was acceptable, and the commit is marked breaking.

- **The catalog.** Every `CodeXxx` constant in `ts-go-runtypes/internal/diagnostics/codes_*.go`
  holds its name. `register` panics on a name that is not kebab-case with a known area prefix (one
  regex, `slugRE` in `catalog.go`), beside the old Scope / Level checks. The unused
  `Definition.DocsAnchor` field went. The Go constant identifiers stayed (internal names).
- **One name per function.** The per-function families keep their own names
  (`validate-symbol-root`, `validation-errors-symbol-root`, `json-prepare-symbol-root`, ...), so a
  comment still turns off one function only.
- **The prefix is the page section.** `config-`, `marker-`, `comment-`, `validate-` /
  `validation-errors-`, `json-prepare-` / `json-restore-` / `data-`, `unknown-keys-`, `format-`,
  `purefn-`, `override-`, `rpc-handler-`, `rpc-batch-`, `rpc-client-`, `enrich-text-` /
  `enrich-mock-` / `enrich-mirror-`, `internal-`. `scripts/core/gen-diagnostics-catalog.mjs` groups
  the All Diagnostics page by prefix and throws on a name no section claims; the page anchors are the
  names.
- **CLI reports too.** The convert (`convert-*`), drizzle-migrate (`drizzle-migrate-*`) and enrich
  i18n (`enrich-i18n-*`) report codes, outside the catalog, became names as well, and so did the one
  runtime class-serializer error (`data-class-constructor-failed`).
- **Four built-in pure-fn ids moved** (`uniqueArrayItems`, `canonicalJson`, `uniqueMapEntries`,
  `uniqueSetMembers`): a comment inside `canonicalJson`'s body named an old code, an id is the hash of
  the body, and the other three depend on it. Both generated id tables were regenerated.
- **The disk cache format** moved to v21: cached entries store codes, and replaying an unknown one
  panics.
- **Everything that matched the old `ABC123` shape** (the tsgo check, the directive lint check, test
  and fuzz oracle regexes, prefix checks in Go tests, fixture folder names) matches names now. A
  regex for a name requires at least one hyphen, so the `[mion]` engine prefix is never read as one.
- **The repo moved over** in one scripted pass (comments, configs, tests, skills, CLAUDE.md files,
  docs), history (`docs/done/`, `CHANGELOG.md`) aside. No repo check was added: a stale code in a
  directive already fails CI as an unknown name.

## Tests

- Go: `register` panics on a bad name, and the test checks it is the bad-name panic
  (`TestRegister_PanicsOnABadName`). The
  directive tests use names and keep both `getRunTypeId` shapes.
- JS: the downgrade, eslint, oxlint and directive-check tests use names.

## Docs

The Error Levels page explains names; every page example and the All Diagnostics page use them.

## Plan: slug only (approved 2026-10-04)

1. Go catalog: names in `codes_*.go`, `register` validation with `slugRE`, `messages.go` and
   `prose.go` keys, drop `DocsAnchor`, disk cache v21, rewrite range and retired-code comments.
2. Generators: name prefixes in `gen-diagnostics-catalog.mjs`, quoted keys in the generated TS,
   anchors and search placeholder in `DiagnosticCatalog.vue`.
3. Every `ABC123` shape match: regexes in scripts, tests and fuzz oracles; the `config-tsconfig-not-loaded`
   text match in the lint worker and the plugin; the `downgradeErrors` hint.
4. Scripted repo-wide rename, then a read-through and a final grep for leftover codes.
5. Tests as above, docs pages, then the review and both simplification passes.
