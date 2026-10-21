---
type: chore
spec: guidelines
status: done
created: 2026-09-29
---

# Remove every leftover shim for removed options, keys and aliases

## Intent

A removed option, key, alias, lint rule, CLI flag, env var or subpath must look as if it never
existed: no fallback, no alias, no "was removed, use X instead" message, no test pinning any of
that, and no doc or comment naming it. Leftovers keep dead names alive, cost code and tests, and
teach readers and coding agents names that no longer work. The root CLAUDE.md states the rule;
this todo removes what was left behind before it existed.

## Direction

The implementer plans the details. What an audit found on `main` (verify each; the list is not
guaranteed complete, so grep for "removed", "deprecated", "alias", "legacy", "kept for one
release", "no longer" and "renamed" too):

- **`RT_*` env var fallbacks**: `packages/devtools/src/core/envCompat.ts`,
  `ts-go-runtypes/internal/envcompat/envcompat.go` (+ `envcompat_test.go`, its callers in
  `cmd/mion/main.go` and `internal/jsengine/sidecar.go`), the `RT_BIN` fallback in
  `packages/bin-compiler/lib/index.js` (+ `packages/devtools/test/bin-exe-path.test.ts`),
  `packages/devtools/test/env-compat.test.ts`, and the "DEPRECATED ALIAS" notes in
  `scripts/lib/env.mjs`. The root CLAUDE.md paragraph "Five vars still answer to their old `RT_`
  name" goes with them.
- **Removed CLI form with a hint**: the bare `release` hint in `scripts/miondevx.mjs`
  (+ `repo-contracts.test.ts`).
- **Aliases**: `outDir` for `genDir` (`packages/devtools/src/options.ts`); `FriendlyType`
  (`packages/run-types/src/index.ts`); `FormattedArrayParams*` (`packages/run-types/src/formats/`,
  + `CollectionBuilders.test.ts`); the `./schema` subpath (`packages/run-types/src/builders/index.ts`,
  `package.json` exports, `container/pre-publish-e2e/apps/shared/src/formats.ts`,
  `prefilter.test.ts`).
- **Legacy enrichment handling**: the old `FriendlyType` spelling accepted by the enrichment guard
  (`packages/devtools/src/lint/prefilter.ts`, `cmd/gen-ts-constants`, `internal/enrichment/astcheck`,
  `mirror/hygiene.go`, `mirror/index.go`, `prefilter.test.ts`); the combined-mirror migration
  (`cmd/mion/enrich_migrate.go`, `enrich_cli.go`, `enrich_gencheck.go`, `enrichgen/config.go`,
  `plan.go`, `enrichReconcile.test.ts`).
- **Wording only**: comments and test titles that name a removed thing (`--one-shot` in
  `resolver-args.test.ts`, "No shim remains" in `lint-worker.ts`, "the hand-written ESLint rules
  they replace" in `codes_mionroute.go`, `routerrules_test.go`, `plugin.test.ts`).
- **Keep**: the redirect-only upload to the old runtypes.pages.dev domain
  (`website-deploy.yml`, `container/website/legacy-runtypes/`) serves visitors of an old URL, not
  code; confirm with the owner before touching it.

Several items are public API (`FriendlyType`, `FormattedArrayParams*`, `./schema`, `outDir`, the
`RT_*` vars): removing them is a breaking change, so the commit says so and the
PR carries the `pre-publish-e2e` label. Update every doc page, example and CLAUDE.md line that names
them so the old names appear nowhere outside `docs/done/` and `CHANGELOG.md`.

## Docs

Every website page and example that names a removed item (grep `container/website/content/` and
`packages/private-examples/`), plus `SETUP.md`, the CLAUDE.md files and `.claude/skills/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- None of the items above has code, a test, a message, a comment or a doc left, outside
  `docs/done/` and `CHANGELOG.md`; a repo-wide grep for each old name comes back empty.
- The full JS suite, the Go tests, lint, typecheck and the pre-publish e2e lane pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-09-29)

### Context
CLAUDE.md says a removed name must leave no trace: no fallback, alias, "use X instead" hint, test for it, or doc naming it. The spec lists shims that predate that rule. An audit confirmed all of them are still on `main` and found more of the same kind. This is a BREAKING change for consumers (`FriendlyType`, `FormattedArrayParams*`, `./schema`, `outDir`, `RT_*` env vars).

Branch: `claude/magical-pascal-4q4k80`, rebased on `origin/main`. One commit per group below (subject lines only, `!` + "BREAKING CHANGE" paragraph on the public-API commits).

### 1. `RT_*` env var fallbacks
- Delete `packages/devtools/src/core/envCompat.ts`; callers read `process.env.MION_*` directly (`lint/lint-worker.ts:34`, `lint/session.ts:178`, `runtypes/next/broker.ts:28`).
- Delete `ts-go-runtypes/internal/envcompat/` (code + test); `cmd/mion/main.go:331` → `os.LookupEnv`, `internal/jsengine/sidecar.go:212` → `os.Getenv`.
- `packages/bin-compiler/lib/index.js`: drop `LEGACY_OVERRIDE_ENV`, `overrideRaw()`; read `process.env[OVERRIDE_ENV]`.
- Tests: delete `devtools/test/env-compat.test.ts`, the RT_BIN describe in `bin-exe-path.test.ts:110-152`, RT_BIN bits in `vite/resolveRtBinary.spec.ts`; `repo-contracts.test.ts:221` regex → `MION_` only.
- `scripts/lib/env.mjs`: strip "DEPRECATED ALIAS" prefixes and the header sentence; "no RT_ prefix" → "no MION_ prefix".
- CLAUDE.md: delete the "Five vars still answer to their old RT_ name" bullet and the "old RT_ prefix is retired" clause.

### 2. Public API aliases
- `outDir` → drop from `devtools/src/options.ts` (`genDir: rt.genDir`); trim `mion-presets.test.ts:54-58`. Also drop the dead `Request.outDir` in `core/protocol.ts:290-292` (no Go field, nothing sends it).
- `FriendlyType` type alias in `run-types/src/index.ts:59-61`.
- `FormattedArrayParams*` in `formats/structural.ts`, `formats/index.ts`, and the alias test in `CollectionBuilders.test.ts`.
- `./schema` subpath: `run-types/package.json` export, `builders/index.ts` comment, `scripts/website/playground-overlay.mjs`, `container/pre-publish-e2e/apps/shared/src/formats.ts` → `/builders`, `prefilter.test.ts:66-68`, `value-first-define/index.ts:3` comment.

### 3. Legacy `FriendlyType` spelling in the enrichment guard (Go + lint)
- `internal/enrichment/names.go`: drop `FriendlyTypeName`, `FriendlyWrapperNames`, `IsFriendlyWrapperName`; callers compare to `FriendlyTextName` (`astcheck.go:125`, `mirror/hygiene.go:263,354`).
- Delete `migrateLegacyFriendlyWrapper` (`mirror/reconcile.go`) and the index fields that only feed it (`annoWrapper*`, `annotationWrapperRange`, `importEntry.nameSpans`).
- `cmd/gen-ts-constants`: stop emitting `FRIENDLY_TYPE_NAME`; regenerate `runtypes-constants.generated.ts`; drop it from `lint/prefilter.ts`.
- Tests: delete the legacy tests (`reconcile_examples_test.go:508-548`, `prefilter.test.ts` legacy cases); respell every `FriendlyType` fixture to `FriendlyText` (enrichcheck_test, orphan/todo/index/hygiene tests, cmd/mion enrich tests).

### 4. Combined-mirror migration
- Delete `cmd/mion/enrich_migrate.go` (+ test), `mirror/split.go` (+ test), the migrate loop in `enrich_cli.go`, and the unused `declFiles` return from `Plan`/`PlanMany`/`specsFromClosure`.
- `enrichgen.Config.LegacyMirrorPath` stays as the path `--out` mode needs, renamed `CombinedMirrorPath` with a present-tense comment; drop it from the `--no-emit` targets (`enrich_gencheck.go:70`).
- Keep the GE001 "no family segment" check (it also catches hand-moved files); reword its message/comments and `diagnostics/prose.go:633` without "migrate" or "old single file".
- Tests: `enrichReconcile.test.ts:118-150`, `config_test.go` legacy rows, `TestCheckMirrorFile_LegacyCombinedDrifts` (reword to a hand-moved file if it still covers GE001).
- Docs: `run-types/skills/rt-enrich-types/SKILL.md:67-72`, `docs/AI_ENRICHMENT.md:17,656-669`.

### 5. Other "removed, use X" hints and fallbacks found by the sweep
- `scripts/miondevx.mjs:482` bare-`release` hint → the generic unknown-command error; replace the `repo-contracts.test.ts:790` test with nothing (no test for the removed form).
- `internal/enrichment/validate.go:363` colon-form `$[val:fmt]` hint → reported as an ordinary unknown placeholder; drop the `validate_test.go` "no longer supported" test; fix `runtypes-friendly-type/SKILL.md:119-120,218`.
- `rpc-client/src/batch.ts:85-88` string-mapper special throw.
- `scripts/website/site.mjs:40-43` sibling `../mion` fallback.
- `scripts/website/bench-data/bench.mjs` typia `.ttsc` volume cleanup (and `bench clean` if it becomes empty).
- `scripts/container/image.mjs` mtime staleness gate for unstamped images: a missing deps stamp now counts as drift (rebuild).

### 6. Tests that only prove a removed thing is gone
Delete: `cli-surface.test.ts:94-98` (gen/check verbs), `rpc-router/test/parser.spec.ts:129-130`, `callContext.spec.ts:83-86`, `typesafety.test.ts:386-391`, `mion-presets.test.ts:102-104`, `vite/middlewareMode.spec.ts:384-386`, `pure-fns-cache.test.ts:264-265`, `website-theme-contracts.test.ts` retired two-site check, `repo-contracts.test.ts:1346-1356` (autocannon), `bench-lane-contracts.test.ts:530` wording, `config_test.go:380-387` (`i18n.dir`), `mirror/index_test.go:188-196` (`@rtI18n`), `cachegen/runtype/module_test.go:400-409`, `resolver-args.test.ts:157` (`--one-shot`). Each checked before deleting: if it also pins a live behaviour, keep that part and drop the old name.

### 7. gen/check verb leftovers (all of them)
Comments, test titles, helper lane names (`run-types/test/util/enrichGen.ts`, `enrichReconcile.ts`, fuzz/enrich/*, `fuzz/README.md`), and Go names: `enrich_gencheck.go` → `enrich_noemit.go`, `runGenCheck` → a name after `enrich --no-emit`. `CodeGen*` diagnostic names stay (they mean code generation).

### 8. Renames and wording
- Website page `02.runtypes/05.ai-integration/02.friendly-type.md` → `02.friendly-text.md`; update every link (`04.i18n.md`, `03.mock-data.md`, `01.workflow-and-commands.md`, `04.configuration.md`). No redirect.
- Skill `packages/run-types/skills/runtypes-friendly-type` → `runtypes-friendly-text`; update references (`rt-enrich-types`, `runtypes-mock-data`, `.claude/skills/enrich`). Fix stale `friendlyType.ts` links (skill, `docs/AI_ENRICHMENT.md`, `friendlyText.compile.test.ts:9`, fuzzy-testing skill).
- Comment/title wording that names a removed thing: `codes_mionroute.go:4`, `routerrules_test.go`, `plugin.test.ts`, `atomic_test.go` (MKR002), `scan.go:968`, and the other comments the sweep listed (`setup.ts:19`, `runtypes-loader.test.ts`, `validationErrors.spec.ts:15`, etc.). `lint-worker.ts:88` describes live behaviour, reword only.
- Keep: `legacy-runtypes` redirect upload, `CHANGELOG.md`, `docs/done/`.

### Tests / docs / fuzzing
- Chore: no new behaviour, so no new tests; existing suites must stay green after removals. Not a fuzz candidate.
- Docs: the friendly-text page rename + links; no page names the other removed items.
- Final repo-wide grep for each old name (`RT_BIN`, `RT_CACHE_DIR`, `RT_JS_RUNTIME`, `RT_LINT_PRESPAWN`, `RT_NEXT_DEBUG`, `FriendlyType`, `FormattedArrayParams`, `run-types/schema`, `LegacyMirrorPath`, `friendly-type`, `--one-shot`) outside `docs/done/`, `CHANGELOG.md` must be empty.

### Verification
- Rebuild: `pnpm run check:builds` (devtools dist, mion binary after Go edits).
- `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `go vet`.
- `pnpm test` (or `pnpm run test:ci` if it OOMs), `pnpm run lint`, `pnpm run format`, `pnpm exec vitest run website-links`.
- `pnpm miondevx core codegen all --check` for the regenerated constants.

### Finish
- Append the approved plan to the spec, reconcile it with what shipped, `git mv` it to `docs/done/`.
- docs-simplifier over the renamed page + touched pages; comments-simplifier over touched source files; each committed on its own.
- Push to `claude/magical-pascal-4q4k80`. PR (when asked) labelled `pre-publish-e2e` and `website`.

## What shipped

Everything in the approved plan landed, with these differences and additions:

- `enrichgen.Config.LegacyMirrorPath` became `CombinedMirrorPath` (still used by `--out`); `Plan` / `PlanMany`
  lost their unused `declFiles` return.
- The colon-form `$[val:kind:name]` token is now an ordinary unknown placeholder (FT005 "unknown placeholder"),
  so the placeholder regex keeps colons inside the token name.
- `miondevx bench clean` only removed the typia `.ttsc` volume, so the whole command went (registry row,
  `BENCH_SUB`, dispatch).
- `image.mjs`: an image without the deps stamp is rebuilt on the local path; the pull path still reads a missing
  stamp as "unknown", not drift.
- Go renames: `enrich_gencheck*.go` → `enrich_drift*.go`, `runGenCheck` → `runMirrorDriftCheck`,
  `runGenTranslate` / `runCheckTranslate` / `runGenBatch` → `runI18nWrite` / `runI18nCheck` / `runEnrichBatch`,
  `codes_gencheck.go` → `codes_mirror.go`. `CodeGen*` diagnostic names stay.
- Also removed: `internal/enrichment/mirror/cli_verb_test.go` (a test that only proved the `gen` verb is gone), the
  `--translate` flag name in comments (now `--i18n`), stale `github.com/mionkit/run-types` links in the enrichment
  skills, and the SETUP.md "Dev loop" section's `--one-shot` / `--daemon` flags (now `mion serve`).
- Test helper lanes are `scaffold` / `no-emit` / `reconcile`; `runGen` → `runEnrich`.
- Same PR, asked by the owner mid-task: the website "Type Reference" sections (11 pages under `01.rpc/`) and the 33
  `// type-*-start` / `-end` source markers only they used are gone.
