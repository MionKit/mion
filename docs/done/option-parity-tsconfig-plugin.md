---
type: feature
spec: full-plan
status: done
created: 2026-07-18
completed: 2026-07-25
---

# Option parity: every project option settable in BOTH tsconfig and the bundler plugin

**Status:** DONE (option-parity core, 2026-07-24; triaged to done 2026-07-25). The
option-parity core landed and is verified in-tree (`failOnError` echo, `singleThreaded` +
`hashLength` plugin wiring, the drift-killing parity guard, tests, docs). The ONE deliberately
deferred piece, `i18n` plugin-side parity, is NOT lost: it was folded into a larger follow-up
feature (drive enrichment from the bundler plugin), now tracked as its own ready spec at
[docs/todos/plugin-driven-enrichment-sync.md](../todos/plugin-driven-enrichment-sync.md). With
that follow-up carrying the remaining scope, nothing in THIS spec is outstanding, so it moves to
done. See "Shipped vs deferred" below.
**Created:** 2026-07-18

> **Triage note (2026-07-25):** every "Shipped this pass" claim below was re-verified against
> the code (config.go `FailOnError`, protocol echo, `unplugin.ts` gate, `--hash-length` /
> `--no-single-threaded` wiring, `cmd/gen-plugin-keys` + `tsconfig-plugin-keys.generated.ts` +
> `PLUGIN_OPTION_KEYS` + `plugin-option-parity.test.ts` with `GO_ONLY = {name, i18n}`, the four
> tests, and the config-page / ARCHITECTURE / go-generated README doc edits) — all confirmed.
> The lower "Implementation plan" item 6 and "Done criteria" still mention a "deprecated
> `runTypesGenDir` alias that warns"; that is stale leftover prose — per Decision 1 (top of the
> "Shipped vs deferred" section) `runTypesGenDir` was REMOVED outright, not aliased.

## Shipped vs deferred (2026-07-24)

**Shipped this pass (option parity):**

- **`failOnError` is now a tsconfig plugin key** (`cmd/ts-runtypes/config.go`), read Go-side and
  ECHOED on the `OpGenerate` response — `protocol.Response.FailOnError` +
  `resolver.Options.TsconfigFailOnError` (set in `dispatch.go`, populated from `plugin.FailOnError`
  in `main.go`), guarded emit in `MarshalJSON`. The JS gate adopts it as
  `options.failOnError ?? echoed ?? true` (`unplugin.ts`), with the echo carried on
  `GenerateResult.failOnError` (`resolver-client.ts`) and the `Response` wire type (`protocol.ts`).
  There is no CLI flag / buildconfig merge — the host owns precedence.
- **`singleThreaded` + `hashLength` are now `PluginOptions` fields**, forwarded through
  `ensureResolver` → `ResolverClient` → `buildResolverArgs` (`--single-threaded` already existed;
  `--hash-length <n>` added to `ResolverClientOptions` + `buildResolverArgs`). The Go merge already
  honoured both (flag > tsconfig > default). Both directions of `singleThreaded` are honoured
  (fixed 2026-07-24): `true` → `--single-threaded`, `false` → `--no-single-threaded`, so a plugin
  `singleThreaded: false` overrides a tsconfig `singleThreaded: true`.
- **Parity drift-guard:** new codegen target `pluginkeys` (`cmd/gen-plugin-keys`, AST-parses the
  `tsRuntypesPlugin` json tags — mirrors the runtime `knownPluginKeys` reflection without importing
  `package main`) emits `packages/ts-runtypes-devtools/src/go-generated/tsconfig-plugin-keys.generated.ts`.
  A runtime `PLUGIN_OPTION_KEYS` array (kept exhaustive vs `keyof PluginOptions` by a
  `satisfies Record<keyof PluginOptions, true>` guard, `src/plugin-option-keys.ts`) is compared to it
  in `test/plugin-option-parity.test.ts`. Adding a project option to only one side fails CI three
  ways: the Go in-sync test (`gen_test.go`), `rtx core codegen all --check`, and the vitest parity
  test. Exception sets: `JS_ONLY = {binary, cwd, tsconfig, transformMode, sourcesContent,
  onPureFnReport}`, `GO_ONLY = {name, i18n}`.
- **Tests:** `plugin-option-parity` (drift guard), `resolver-args` (wire flags), `tsconfig-config`
  (tsconfig `hashLength` end-to-end via `site.id.length`, + flag > tsconfig), `fail-on-error`
  (tsconfig `failOnError:false` echo downgrades, + plugin option > echo).
- **Docs:** config page (dropped `failOnError`'s "bundler plugin only" marker; `hashLength` now
  settable in both; rule restated; `i18n` the one tsconfig-only exception), ARCHITECTURE
  recognised-keys list (removed stale `runTypesGenDir`, added `failOnError`), `go-generated/README.md`.

**Already done before this pass (Decisions 1 & 2, landed separately):** the `genDir` convention —
one `genDir`; `runTypesGenDir` / `enrichDir` / `i18n.dir` REMOVED (not aliased); `--gen-dir`
replaces `--run-types-gen-dir` / `--enrich-dir`; `resolveOutDir` tsconfig middle layer; family
READMEs. So the spec's plan items 6/Done-criteria mentioning a "deprecated `runTypesGenDir` alias
that warns" are moot — it was removed outright per Decision 1.

**Deferred to a new todo (owner, 2026-07-24):** `i18n` plugin-side parity, folded into a larger
feature: **drive enrichment from the bundler plugin.** `i18n` (sourceLocale/locales/strict) is
consumed only by the enrichment CLI lanes, which the bundler build never runs, so exposing it on
`PluginOptions` is meaningful only alongside making the plugin scaffold + keep-in-sync the
friendly/mock/i18n mirror files (same as `ts-runtypes gen --update`; NO translation content — that
stays developer/skill-driven). Until then `i18n` stays a documented tsconfig-only exception in the
parity guard (`GO_ONLY`). **Hard constraint for that feature (owner):** the enriched mirror files
are write-only outputs and must NOT trigger HMR / any rebuild.

## Motivation (owner decision)

The configuration surface is split arbitrarily today: some options work in both the
tsconfig plugin entry and the bundler plugin (`emitMode`, `moduleMode`, sizes, …),
some are tsconfig-only (`hashLength`, `singleThreaded`, the enrichment trio), and
some are plugin-only (`genDir`, `failOnError`). Owner: "it does not make any sense
having some options that can be set on both and some others that don't." The docs
currently paper over this with "Bundler plugin only." markers and a "most of the
same keys" caveat ([4.configuration.md](../../container/website/content/1.introduction/4.configuration.md)).

**Target model:** every PROJECT-semantic option is settable in both places with the
already-documented tsc-style precedence (plugin/CLI flag > tsconfig entry >
built-in default). Only options that CANNOT live in tsconfig stay plugin-only, as
a small, principled, documented exception list.

## Verified current state (2026-07-18)

Three registries:

- **tsconfig plugin entry** — `tsRuntypesPlugin` in
  [cmd/ts-runtypes/config.go](../../ts-go-runtypes/cmd/ts-runtypes/config.go)
  (pointer fields so absent ≠ explicit; unknown keys ignored).
- **Bundler plugin** — `PluginOptions` in
  [packages/ts-runtypes-devtools/src/unplugin.ts](../../packages/ts-runtypes-devtools/src/unplugin.ts).
- **Wire** — `buildResolverArgs` in
  [packages/ts-runtypes-devtools/src/resolver-client.ts](../../packages/ts-runtypes-devtools/src/resolver-client.ts)
  → CLI flags merged Go-side by
  [cmd/ts-runtypes/buildconfig.go](../../ts-go-runtypes/cmd/ts-runtypes/buildconfig.go)
  (explicit flag > tsconfig > default — the precedence engine ALREADY exists).

| Option | tsconfig | plugin | Go flag exists | Gap |
| --- | --- | --- | --- | --- |
| `emitMode`, `moduleMode`, `inlineMode` | ✓ | ✓ | ✓ | none |
| `sizeBias/Items/StringBytes/MaxBytes` | ✓ | ✓ | ✓ | none |
| `parallelScan`, `parallelRender` | ✓ | ✓ | ✓ | none |
| `allowUncheckedPatterns` | ✓ | ✓ | ✓ | none |
| `singleThreaded` | ✓ | ✗ | ✓ (`--single-threaded`, already emitted by `buildResolverArgs` for the lint lane) | add to PluginOptions + forward |
| `hashLength` | ✓ | ✗ | ✓ (`--hash-length`) | add to PluginOptions + forward |
| `enrichDir` | ✓ | ✗ | ✓ (`--enrich-dir`) | add to PluginOptions + forward (see decision 2) |
| `i18n` | ✓ | ✗ | gen lane | same |
| `runTypesGenDir` | ✓ | ✗ | ✓ (`--run-types-gen-dir`, compile lane) | UNIFY with `genDir` (decision 1) |
| `genDir` | ✗ | ✓ | generate-op param | add tsconfig key (decision 1) |
| `failOnError` | ✗ | ✓ | n/a (JS-side gate) | add tsconfig key + echo (see plan 4) |
| `binary`, `cwd`, `tsconfig` | ✗ | ✓ | n/a | principled exception (bootstrap) |
| `transformMode`, `sourcesContent` | ✗ | ✓ | per-request | principled exception (internal wire) |

## Principled exceptions (stay plugin-only, documented as internal)

- `binary`, `cwd`, `tsconfig` — bootstrap options: they are needed to FIND and
  READ the tsconfig, so they cannot come from it.
- `transformMode`, `sourcesContent` — host wire-transport knobs; identical
  artifacts either way, never allowed in a cache fingerprint, meaningless as a
  project semantic. Already documented under Internal options.

Everything else reaches parity.

## Decisions to confirm at implementation

1. **One `genDir`; every location under it is CONVENTION (owner decision,
   2026-07-18, supersedes the alias/unify draft): `runTypesGenDir` is REMOVED,
   not aliased.** The single option is `genDir` — tsconfig key (new) + the
   existing plugin option + one CLI flag `--gen-dir` (replacing BOTH
   `--run-types-gen-dir` and `--enrich-dir`). Precedence per lane: explicit
   plugin option / CLI flag > tsconfig `genDir` > inferred `<srcDir>/__runtypes`
   (the build lane's `resolveOutDir` gains the tsconfig middle layer so all
   lanes agree). Conventional layout, never configurable:

   ```
   <genDir>/
     README.md
     types/               regenerated every build; gitignored (README + .gitignore)
     enriched/            committed (README)
       friendly/          FriendlyText mirrors (README)
       mock/              MockData mirrors (README)
       i18n/<locale>/     translations (README at i18n/)
   ```

   **Every conventional dir under `genDir` carries a README explaining what it
   is and how it works**, written write-if-absent by whichever lane creates the
   dir (the build/generate lane owns root + types/ + enriched/; the enrich gen
   lane owns friendly/ + mock/; the translate lane owns i18n/). Per-locale and
   mirrored-source subdirs are content, not conventional dirs — no README.
2. **Enrichment locations are NOT options at all (owner decision, 2026-07-18,
   SUPERSEDES the earlier draft of this point): `enrichDir` and `i18n.dir` are
   REMOVED.** Everything under `genDir` is convention, never configuration: the
   enrichment mirrors live at `<genDir>/enriched/{friendly,mock}` and the
   translations at `<genDir>/enriched/i18n/<locale>/`, full stop. This also
   dissolves the two-roots split (`runTypesGenDir`-style build output vs the
   old `runtypes/generated` enrichment root) — one `genDir`, one layout, the
   `enriched/` half exactly as the emitted READMEs describe. `friendlyErrors` was
   REMOVED outright (2026-07-18 follow-up): scaffolds are always per-constraint,
   the authored `rt$default` shape stays a hand-written choice. The remaining
   `i18n` keys (`sourceLocale`, `locales`, `strict`) stay options and get
   plugin-side parity per the general rule. Implemented separately from the rest of this spec —
   see the status note below.
3. **`failOnError` in tsconfig:** yes — it is a project policy ("error findings
   stop the build"), the archetype of what tsconfig should hold.

### Implementation notes for decisions 1 + 2 (the convention change)

- Go [cmd/ts-runtypes/config.go](../../ts-go-runtypes/cmd/ts-runtypes/config.go):
  drop `EnrichDir`, `RunTypesGenDir`, `i18nPluginConfig.Dir`; add `GenDir *string`.
  `resolveEnrichConfig` resolves genDir (flag > tsconfig > inference/RootDir
  fallback), then EnrichDir := `<genDir>/enriched`, I18nDir := `<EnrichDir>/i18n`
  — internal struct fields keep their names; only the config surface changes.
- Enrich commands (`gen`/`check`/`--translate`/`--prune`) swap `--enrich-dir`
  for `--gen-dir`; batchcompile swaps `--run-types-gen-dir` for `--gen-dir`
  (buildconfig.go merge repointed at the `genDir` key).
- Build lane: `resolveOutDir` ([resolver/generate.go](../../ts-go-runtypes/internal/compiler/resolver/generate.go))
  reads tsconfig `genDir` between the explicit request and `inferSrcDir()`.
- Hygiene: extend the existing `ensureOutputHygiene` pattern with family
  READMEs — `enriched/friendly/README.md`, `enriched/mock/README.md`,
  `enriched/i18n/README.md` — written by the lane that creates each dir
  (mirror writer / translate writer); root README's map lists all of them.
- Tests/fixtures to update: Go `config_test`, `enrich_prune_test`,
  `enrich_translate_test`; JS `enrichReconcile` util + suites, the enrich fuzz
  models (`enrichCli`/`enrichModel`/`i18nModel`), `enrich-hmr-e2e`
  (`--enrich-dir` → `--gen-dir` + new paths), `compile-cli` (flag rename),
  e2e `apps/shared/tsconfig.json` (drop `enrichDir`) + `build-all.mjs` cleanup
  paths.
- Docs: config page (drop `enrichDir` + `runTypesGenDir` rows and the i18n
  `dir` row; `genDir` row documents the layout), ai-integration workflow +
  i18n pages (paths → `<genDir>/enriched/…`), ARCHITECTURE, AI_ENRICHMENT,
  the enrich skills under packages/ts-runtypes/skills, CLAUDE.md's enrichment
  mentions.

## Implementation plan

1. **JS `PluginOptions`** — add `singleThreaded`, `hashLength`, `enrichDir`,
   `i18n`, `failOnError` stays; forward the new ones in
   `ensureResolver` (wire flags already exist for singleThreaded/hashLength/
   enrichDir; add `--friendly-errors` + an i18n JSON flag or request field
   Go-side).
2. **Go `tsRuntypesPlugin`** — add `genDir` (unification, decision 1) and
   `failOnError *bool`; extend `buildconfig.go`'s merge for both.
3. **`failOnError` echo** — the plugin cannot parse tsconfig (no dep), so the Go
   side echoes the MERGED `failOnError` on the generate/scan response
   (`protocol.GenerateResult`); the JS gate uses `options.failOnError ??
   echoed ?? true`. Same pattern as the echoed resolved `outDir`.
4. **`genDir` inference** — plugin: explicit plugin `genDir` > tsconfig `genDir`
   (echoed back, replacing today's `<srcDir>/__runtypes` inference as the middle
   layer) > inferred default. CLI: `--gen-dir` > tsconfig `genDir` > default
   (buildconfig.go already implements this shape for the old key).
5. **Parity guard (the drift killer)** — generate a TS mirror of the
   `tsRuntypesPlugin` key list via the existing `rtx core codegen` lane (like
   `gen:ts-constants`), and add a vitest sync test: `PluginOptions` keys ==
   generated tsconfig keys + the five documented exceptions. A new option added
   to one side only fails CI.
6. **Tests** — per-new-option spot checks: tsconfig `hashLength` changes id
   length end-to-end; plugin `singleThreaded` reaches the child argv; tsconfig
   `failOnError: false` downgrades an Error finding without any plugin option;
   tsconfig `genDir` respected by BOTH the bundler lane and `--compile`;
   deprecated `runTypesGenDir` still works and warns.
7. **Docs** — [4.configuration.md](../../container/website/content/1.introduction/4.configuration.md):
   drop the "Bundler plugin only." markers from `genDir`/`failOnError` (only
   `tsconfig` keeps one), delete the "most of the same keys" caveat and the
   i18n tsconfig-only note, and state the rule once: every option works in both
   places except the internal bootstrap/wire options. Update the `genDir` row
   default ("`__runtypes`, from tsconfig `genDir` when set").

## Done criteria

- Every option in the docs Options table settable in tsconfig AND on the plugin,
  with tsc-style precedence proven by tests.
- `runTypesGenDir` unified into `genDir` (deprecated alias warns).
- Parity sync test green; adding a one-sided option fails CI.
- Config page carries no per-option "where can I set this" caveats beyond the
  internal exceptions.
