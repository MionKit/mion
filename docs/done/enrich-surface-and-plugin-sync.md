---
type: feature
spec: full-plan
status: done
created: 2026-07-25
---

# `enrich` CLI surface + `--no-emit`, and plugin-driven enrichment sync

Ships two things in one PR:

1. **CLI surface** — rename `gen`→`enrich`, delete `check`, add a uniform
   `--no-emit` on both emitting verbs, and expose enrichment as a daemon op so it
   works under `serve` too, not just the CLI.
2. **Plugin-driven sync** — opt-in bundler-plugin options that run the same
   scaffold+reconcile pass from dev/watch, so a developer never has to run the
   CLI by hand.

They ship together because (2) is the first consumer of (1)'s daemon op, and the
command-name + plugin-option docs move in one edit.

## Where we are

PR #279 shipped the tsgo-style `args[0]` surface — but with the verbs named
`serve` / `compile` / `gen` / `check` (`main.go:86-89`), **NOT** `enrich`. So
everything around it already says "enrich" (the skill, docs, the FT/MD/GE
diagnostics) while the verb is still literally `gen`, and there is no
"report errors without emitting" mode anywhere.

Still pending — all in this PR: the `gen`→`enrich` rename, deleting `check`,
the uniform `--no-emit`, the daemon enrich op, and the plugin-driven sync.

---

# 1. CLI: `enrich` + `--no-emit`

## Why

- **`gen` is too generic.** The verb only scaffolds/reconciles the FriendlyText /
  MockData enrichment mirrors. `enrich` is the honest name. (The `--friendly` /
  `--mock` split already exists at `enrich_cli.go:67-68`, default both — this is a
  naming fix, not new capability.)
- **`check` secretly means "enrichment only,"** and the core pipeline has no
  dry-run mode at all. Both are the same outcome — walk, emit
  `diagnostics.Diagnostic`, exit non-zero on Error. So we copy TypeScript: reuse
  `--no-emit` as a uniform flag on both emitting verbs, and `check` dissolves.
  (The daemon already proves the two are one stream: `scanFiles` returns core
  and enrichment diagnostics together, gated by independent flags.)

## Target surface

```
serve                       daemon IPC (unchanged)
compile [--no-emit]         core: walk -> emit .js + caches + diagnostics;
                            --no-emit -> diagnostics only, write nothing
enrich  [--no-emit] ...     enrichment: scaffold/update/prune/translate +
                            diagnostics in one pass; --no-emit -> diagnostics only
```

`check` is **removed**; its lanes map onto `enrich --no-emit`:

| Today | Becomes |
|---|---|
| `gen <src> <Type>` | `enrich <src> <Type>` (writes + diagnostics) |
| `gen <src> <Type> --update` | `enrich <src> <Type> --update` |
| `gen --prune [path]` | `enrich --prune [path]` |
| `gen --translate <loc> [src]` | `enrich --translate <loc> [src]` |
| `gen --files a,b --type T` | `enrich --files a,b --type T` (batch JSON) |
| `check <file>` | `enrich <file> --no-emit` (single-file health) |
| `check [<dir>]` / `check` | `enrich [<dir>] --no-emit` (mirror-tree drift) |
| `check --translate <loc>` | `enrich --translate <loc> --no-emit` (i18n gate) |
| — (none) | `compile --no-emit` (core RT diagnostics, no writes) |

**Grammar rule (the one surface decision):** a scaffold target (`<src> <Type>`
pair, or the `--prune` / `--translate` write flags) selects a **write** mode;
`--no-emit` turns any write mode into diagnostics-only. A **check-only** target
(a bare file, a dir, or no positional) **requires `--no-emit`** to be explicit
(`tsc --noEmit`-style), which also disambiguates `enrich <src>` with a missing
Type ("provide a Type to scaffold, or --no-emit to check").

## What to build — shared impl + CLI

Refactor first so ONE implementation backs both the CLI verb and the daemon op:

- **Extract `internal/enrichment/enrichgen` (new leaf pkg).** Move `enrichConfig`
  + its resolution (`resolveEnrichConfig`, the `mirrorPath` family,
  `config.go:238-403`) out of `cmd/` (take params, no `fatal`, return `error`),
  plus a pure `PlanScaffold(resolved, cfg, want, existing) -> ([]mirror.Spec,
  error)` over the already-pure `mirror.Scaffold` / `mirror.Reconcile`. **Lift
  `migrateLegacyMirror` OUT of `groupSpecs`** (`enrich_cli.go:244` — it does disk
  I/O) so spec-building is pure; migration stays a CLI-only pre-step.
  `writeMirrorFile` (`enrich_cli.go:313`) / `updateMirrorFile`
  (`enrich_reconcile.go:35`) stay in `cmd/` as disk shims; the daemon collects
  `{Path, Content, Added}`. `existing` is injected (CLI and daemon both read disk
  -> parity holds).
- **Collapse the two `check` orchestrations into one shared
  `CheckFile(sourceFile, checker, cache, fs, filePath) []diagnostics.Diagnostic`**
  in `internal/enrichment`: tag hygiene (`DirtyTags`) + `astcheck.CheckSourceFile`
  + breadcrumb drift, **drift gated on `scan.HasMarkerComment()`** (resolver
  behavior wins). Resolver `checkEnrichFiles` (`enrichcheck.go:28`) and the CLI
  check lane both delegate; delete the duplicated `tagCode` (`enrichcheck.go:104`
  + `enrich_check.go:180`). This changes the CLI check to gate drift on the marker
  and read the Program FS — reconcile `enrich_gencheck_test.go` to the unified
  behavior.
- **Merge `gen` + `check` into one `enrich` handler + `--no-emit`.** Command
  table `main.go:88-89` (`"gen"` / `"check"` -> `"enrich": runEnrich`, delete
  `check`); FlagSet name `enrich_cli.go:66`; retire `enrich_check.go`'s FlagSet.
  `runEnrich` owns the grammar table: 2 positionals -> scaffold, then run
  `CheckFile` and emit its diagnostics (the "in one pass" behavior); `--prune` /
  `--translate` -> their write lanes; `--no-emit` gates every write (prune ->
  list-only, update -> report-only, translate -> i18n gate); a bare file / dir /
  empty target under `--no-emit` -> `CheckFile` / mirror-tree walk. The former
  check entry points (`runCheck`, `runGenCheck`, `runCheckTranslate`) fold into
  `runEnrich`'s `--no-emit` branches; keep their helpers (`checkMirrorFile`, the
  drift walk, `reportFindings`).
- **Add `compile --no-emit`.** `runCompile` (`main.go:520`) registers a
  `--no-emit` bool; thread `NoEmit` into `batchcompile.Options` (`compile.go:44`).
  When set, `batchcompile.Run` builds the Pass-1 program + resolver, dispatches
  **`OpDump`** (full scan + `collectEntryModules` + diagnostics in memory, zero
  writes — `dispatch.go:875-920`), returns `result.Diagnostics`, and **skips
  `OpTransform` / `OpGenerate` / Pass 2**.
- **Drop `"source"` + thread `hashLength`.** Remove the three `"source"`
  injections (`config.go:244`, `enrich_cli.go:33`, `:54`). Thread the project
  `hashLength` into the enrich `resolver.Options` (today only `Cwd` at
  `enrich_cli.go:37,58`) so enrich's hash-sensitive `@rtType` ids match a build.
  Point the two spawns in `packages/ts-runtypes/test/util/enrichGen.ts` (`:83`,
  `:161`) at `--tsconfig <abs>/packages/ts-runtypes/tsconfig.test.json` (carries
  `customConditions:["source"]`); audit the other JS spawn harnesses
  (`enrichReconcile.ts`, `fuzz/enrich/enrichCli.ts`, `i18nModel.ts`,
  `enrichRace.test.ts`, `enrich-hmr-e2e.test.ts`) and add the flag where they
  import `@ts-runtypes/core/formats`. Do NOT add `customConditions` to the
  discoverable root/package `tsconfig.json` (leaks `"source"` into `pnpm build`).

## What to build — enrich as a daemon op

So enrichment works under `serve`, and the plugin (section 2) can call it over
the warm connection instead of spawning:

- **Protocol** (`internal/protocol/protocol.go`): one `OpEnrich` constant;
  Request fields `TypeName`, `EnrichFriendly` / `EnrichMock` / `EnrichUpdate`,
  `EnrichNoEmit`, `GenDir`; Response `EnrichFiles []EnrichFile{Path,Content,
  Added,Kind}` registered in the hand-rolled `Response.MarshalJSON` (precedent
  `SiteFiles`). `EnrichNoEmit=true` returns `Diagnostics` only; false returns
  `EnrichFiles` + `Diagnostics`.
- **`dispatchEnrich` handler** (`resolver/dispatch.go`, a `case` in the switch at
  `:728`): guard `sess.Program == nil`, call the SAME shared functions with
  `sess.Program`, `sess.checker`, `sess.cache`, `sess.Program.FS`. Resolver
  already imports `enrichment`, so no new import cycle. The lint lane
  (`scanFiles{checkEnrich}`, `dispatch.go:768`) is unchanged — a distinct per-file
  editor consumer.
- **JS client** (`packages/ts-runtypes-devtools/src/resolver-client.ts`): an
  `enrich(opts)` method on `ResolverClientBase` (model on `generate()`), added to
  the `ResolverConnection` interface; `protocol.ts` extends the `Request.op` union
  + Request/Response fields + an `EnrichFile` interface (additive — JS `Response`
  is a plain interface, no marshaller).

## Decisions

- **`--no-emit` is required** to enter check-only modes (bare file / dir / no
  target); write modes accept it as a dry-run. Mirrors `tsc --noEmit` and
  disambiguates a missing `<Type>`.
- **Write-mode `enrich` emits the freshly-scaffolded `@todo` diagnostics**
  (FT020/MD020) as the agent's fill-in worklist — intentional, symmetric with
  `compile`.
- **The daemon op returns content, never writes** (the plugin's no-HMR
  constraint); the CLI keeps `atomicWriteFile`. `migrateLegacyMirror` is a
  CLI-only pre-step, skipped by the daemon.

## Tests

- **CLI surface contract test (the regression guard).** One spawn-based golden
  test over the built `bin/ts-runtypes` (Vitest, e.g.
  `packages/ts-runtypes-devtools/test/cli-surface.test.ts`):
  - **Help golden** — snapshot the top-level usage + each command's full `--help`
    against a checked-in golden. `printUsage` (`main.go:353`) renders every flag
    via `fs.VisitAll`, so the golden captures the whole verb set + per-command
    flags automatically; regenerate via a documented update step.
  - **Routing + exit codes** — each verb routes to its handler; unknown / no
    `args[0]` -> usage on stderr + exit 2; `-h` / `--help` / `--version` peeled.
  - **Parameter-effect matrix** — `compile --no-emit` and `enrich --no-emit`
    write NOTHING (assert the genDir tree is untouched) yet emit diagnostics;
    `--json` emits JSON; `--friendly` / `--mock` select the right family file(s);
    `--gen-dir` redirects; `enrich --prune --no-emit` lists orphans but deletes
    nothing.
- **CLI ≡ daemon parity test** — `cmd/ts-runtypes/enrich_parity_test.go` + one
  Vitest wire e2e: drive an in-process `resolver.Session` dispatch AND the CLI
  shared-fn path over one fixture (tsconfig with `customConditions:["source"]`),
  assert byte-identical `{Path,Content}` (gen, incl. `--update`) and same
  codes+sites (`--no-emit`). Pin the SAME `hashLength` both sides.
- **Go** — the rename touches only `main.go`'s table + the two FlagSet name
  strings; every `cmd/ts-runtypes/*_test.go` calls the helper functions directly,
  so they survive. Update `enrich_gencheck_test.go` (marker-gated drift),
  `enrich_translate_test.go`, and the new `enrichgen` pkg tests. `go -C
  ts-go-runtypes test ./internal/... ./cmd/...`.
- **Vitest** — move every spawn site `gen`->`enrich`, `check <f>`->`enrich <f>
  --no-emit`: `enrichGen.ts:83,161`, `enrichReconcile.ts`, `fuzz/enrich/*`,
  `enrichRace.test.ts`, `suites/enrich/*`, `enrich-hmr-e2e.test.ts`. Add a
  `compile --no-emit` and an `enrich --no-emit` case. Rebuild `bin/ts-runtypes`
  first; `pnpm test`.
- No `getRunTypeId` API change -> no new marker-shape coverage needed.

## Out of scope

- Surfacing tsgo's native type-error diagnostics under `compile --no-emit` (v1
  reports the RunType-family diagnostics `compile` already computes).
- Any change to the lint lane (`scanFiles{checkEnrich}`) or the marker API.
- The `rtx` CLI (`scripts/rt.mjs`) — its own `check`/`generate` subcommands are
  unrelated to the binary's `args[0]`.

---

# 2. Plugin-driven enrichment sync

## Intent

Today all enrichment is CLI-driven: the developer runs `enrich ... --update` to
keep the committed mirrors under `<genDir>/enriched/{friendly,mock,i18n/<locale>}`
in sync as types change. We want the bundler plugin to optionally drive that same
scaffold + reconcile pass from dev/watch, so nobody has to remember the CLI. This
is **scaffold + sync only, NOT translation** — filling in translated strings stays
a developer/skill step; the plugin only keeps the file structure current. The CLI
verbs stay the authoring path, unchanged.

Safe because `enrich --update` is deterministic, value-preserving (never clobbers
authored values), idempotent and convergence-proven (`enrich-hmr-e2e.test.ts`), so
driving it from the plugin does not violate the "never call an LLM in a build"
invariant. The plugin's scan already knows the demanded named types + their source
files, so it knows exactly what to enrich.

## Config (unplugin-only, NOT tsconfig)

All new config lives in `PluginOptions`
(`packages/ts-runtypes-devtools/src/unplugin.ts`) — it's a host/dev-loop behavior,
so it stays off the tsconfig plugin entry and the option-parity guard's shared
set. Suggested grouping under one `enrich` object; the implementer finalizes the
shape:

- **FriendlyText — a boolean** — enable auto gen+sync of `enriched/friendly/`.
- **MockData — a boolean** — enable auto gen+sync of `enriched/mock/`.
- **i18n — a config object** (`sourceLocale?`, `locales?`, `strict?`, same shape
  as the tsconfig `i18nPluginConfig`); its **presence** is the enable flag for
  syncing the per-locale `enriched/i18n/<locale>/` mirrors.
- **HMR-suppression toggle** — when set, the plugin ignores HMR / triggers no
  reload for changes under `<genDir>/enriched/**` (write-only outputs). Make it a
  toggle so it can be turned off to debug. Orthogonal to the auto-gen flags —
  useful even when the mirrors are edited by hand or by the CLI while the dev
  server runs.
- **Default OFF for everything** — a plugin with none of these set behaves exactly
  as today.

## How it runs

The plugin drives enrichment through the new `OpEnrich` daemon op (section 1), not
a child spawn: it already holds a warm `ResolverClient`, the op returns content (so
the plugin writes under the HMR-suppression window, keeping the "daemon never
writes" invariant), and no extra protocol work is needed. (Fallback if the op were
descoped: spawn `bin/ts-runtypes enrich <file> <Type> --friendly --mock --update
--gen-dir <genDir>`, the path `enrich-hmr-e2e.test.ts` already drives.)

Left for the implementer to plan with fresh context:

- **When it runs** — sync in dev/watch; on a full production build do nothing or a
  read-only `enrich --no-emit` (mutating committed source mid-build breaks build
  reproducibility). Confirm with the owner.
- Debounce / batching of `enrich --update` across rapid edits; whether one pass
  covers all enabled families per changed file.
- The exact `PluginOptions` shape and how the HMR-suppress toggle relates to the
  auto-gen flags.
- Add the new unplugin-only keys to `JS_ONLY` in
  `plugin-option-parity.test.ts`; decide whether the plugin's `i18n` object shares
  the tsconfig `i18n` shape (they may share a shape but drive different lanes —
  plugin enrichment vs the CLI).

Verified pointers (re-confirm before coding): the scan response already carries
the demanded named types + source files (`Response.RunTypes[].typeName`,
`SiteFiles`) and the resolved `genDir` (`gen.outDir`); the unplugin's
`vite.handleHotUpdate` in `unplugin.ts` is where HMR-suppression short-circuits any
change resolving under `<genDir>/enriched/**`.

## Tests

- A plugin-driven analog of `enrich-hmr-e2e.test.ts`: drive through the plugin
  hook, assert the mirrors sync AND that touching the enrich folder does not
  trigger HMR.
- Each family toggles independently (FriendlyText, MockData, i18n presence);
  everything defaults OFF.

---

# Docs, diagnostics, fuzzing

- **Website** (house voice, `<code-import>` where TS): command tables +
  invocations in `3.ai-integration/1.workflow-and-commands.md:88-95`,
  `2.friendly-type.md:80`, `4.i18n.md:35-47`, `2.guide/9.linting.md:32,91-95`,
  `1.introduction/4.configuration.md`, `index.md:310,382`. Document the new plugin
  options on the config page as bundler-plugin-only, and update the "enrichment is
  CLI-only" invariant text (in `docs/AI_ENRICHMENT.md` and
  `.../1.workflow-and-commands.md`) to reflect both the renamed verbs and the
  opt-in plugin sync.
- **Skills:** `packages/ts-runtypes/skills/rt-enrich-types/SKILL.md` (command
  block), `runtypes-friendly-type/SKILL.md:268-270`,
  `.claude/skills/enrich/SKILL.md`.
- **Design docs:** `docs/AI_ENRICHMENT.md` (command tables L497-510, the agent
  loop, `### gen semantics`), `docs/ARCHITECTURE.md:87,515`.
- **Diagnostic messages** (embed CLI strings): `diagnostics/messages.go` (`gen
  --prune` / `--update` / `check` at L549-635), `codes_gencheck.go:3`,
  `codes_friendly.go:10`, `codes_mock.go:7`, `catalog.go:61`,
  `mirror/scanTags.go:82`, `hygiene.go:13`. Regenerate via `pnpm run
  gen:diag-catalog`.
- **Fuzzing:** not a new-oracle candidate — a CLI-surface refactor + a dev-loop
  driver over an already-convergence-proven reconcile. The existing enrich fuzzers
  (`test/fuzz/enrich/*`) are the gate; their spawn args move to `enrich` / `enrich
  --no-emit`.
- On landing, move this spec to `docs/done/`.

# Done when

**CLI surface**
- `gen` renamed to `enrich`; `check` deleted; `compile --no-emit` and `enrich
  --no-emit` both run the analysis and emit diagnostics while writing nothing.
- Write-mode `enrich` emits enrichment diagnostics in the same pass it scaffolds.
- Enrichment is reachable as a daemon op AND a CLI verb over one shared impl,
  pinned by the CLI ≡ daemon parity test.
- The CLI surface contract test pins every command + parameter (help golden +
  routing/exit codes + parameter-effect matrix).
- Existing Go + JS enrich suites stay green through the rename; new coverage for
  both `--no-emit` modes.

**Plugin sync**
- With the options enabled, editing a source type during dev/watch scaffolds and
  keeps in sync the `enriched/{friendly,mock,i18n/<locale>}` mirrors, matching
  `enrich --update` (value-preserving; NO translation content).
- Each family toggles independently; everything defaults OFF.
- With HMR-suppression set, writing/regenerating (or hand-editing) files under
  `<genDir>/enriched/**` triggers NO HMR/reload; toggling it off restores normal
  behavior.

**Combined**
- Docs + diagnostic messages updated in one pass.
- This spec moved to `docs/done/`.

---

# What shipped (reconciliation)

Both sections landed together; every **Done when** bullet above is met. Notes on
where the implementation deliberately differs from the plan above:

**§1 — CLI + daemon**

- **Shared package placement.** `CheckFile` and the config/plan primitives live in
  a NEW leaf package `internal/enrichment/enrichgen` (not `internal/enrichment`
  itself): `enrichment` is imported by `astcheck`, so `enrichment` cannot import
  `astcheck` back — the leaf package imports both without a cycle. `enrichgen`
  holds `Config` + `ResolveConfig` + the mirror-path methods, the pure `Plan` (+
  `BuildSpecs`/`GroupByDeclFile`/`WantedFamilies`), and `CheckFile` +
  `HygieneDiagnostics`. The CLI keeps the JSONC plugin side-read + the disk shims
  (`writeMirrorFile`/`updateMirrorFile`/`migrateLegacyMirror`).
- **Write-lane worklist is the text-only hygiene scan, not full `CheckFile`.** A
  fresh scaffold's `@todo`s are pure tag hygiene, so the write lane emits them via
  `enrichgen.HygieneDiagnostics` (no second Program, no dependency on resolving the
  mirror imports). Full `CheckFile` (hygiene + content validity + breadcrumb drift,
  over a Program) backs the `--no-emit` check lanes. Both share the same tag-code
  mapping, so the worklist codes match the check.
- **Exit codes.** A successful scaffold exits 0 (its `@todo` placeholders are the
  expected state; the worklist prints to stderr as an informational fill-in list).
  The gate that FAILS on unfilled `@todo`s (FT020/MD020 are Error severity) is the
  diagnostics-only `enrich <file> --no-emit`, which exits 1 on any Error. This is
  the sound reading of "symmetric with compile" (compile also only *reports* in
  `--no-emit`; the failing exit is the check, not the write).
- **`--no-emit` grammar.** A 2-positional `<file> <Type> --no-emit` is a dry-run
  that checks the type's existing mirrors; a 1-positional `<file> --no-emit` is the
  single-file health check; a bare/dir target `--no-emit` is the mirror-tree drift
  walk. A check-only target REQUIRES `--no-emit` (it also disambiguates a `<file>`
  given without a `<Type>`).
- **`hashLength` + resolution.** The forced `"source"` module-resolution condition
  is dropped (enrich now resolves exactly like a build; a project opts into its
  in-tree src via tsconfig `customConditions:["source"]`), and the project
  `hashLength` threads into the enrich resolver so its `@rtType` ids match a build.
  The parity test pins a NON-default `hashLength=5` on both the CLI and daemon
  sides, so it fails loudly if the threading regresses.

**§2 — plugin sync**

- **The `typeName → source-file` gap is solved server-side.** A `RunType` carries
  no decl-file, so `OpEnrich` with an empty `TypeName` intersects the session's
  demanded named types (`sess.cache.Dump()`) with each file's exported types
  (new `enrichment.ExportedTypeNames`) and plans them together via new
  `enrichgen.PlanMany` (multi-type merge, dedup by var, skips unresolvable). Empty
  `Files` runs a whole-program pass. Strictly demand-scoped; the plugin never needs
  a decl-file field. The single-type `Plan` path is byte-for-byte preserved (the
  CLI-parity contract).
- **Config decisions (confirmed with the owner):** production build runs a
  READ-ONLY drift gate (never writes mid-build; honors `failOnError`); HMR for
  `<genDir>/enriched/**` is AUTO-SUPPRESSED whenever any enrich family is enabled
  (`suppressHmr` is the explicit override); everything defaults OFF. `enrich.i18n`
  drives per-locale scaffold+sync via new `enrichgen.PlanTranslations` +
  additive `EnrichLocales`/`EnrichSourceLocale` Request fields (scaffold+sync only,
  never translated content).
- **Minor duplication:** `translationSpecs` is duplicated into `enrichgen` rather
  than refactoring the CLI's copy, to honor the "don't touch CLI verb code" guard;
  both sides are test-covered.

**Tests + docs shipped:** the CLI≡daemon parity test, the CLI-surface contract test
(help golden + routing/exit + parameter matrix), the plugin-driven sync test
(8 cases through the real Vite hooks), the enrich-suite spawn renames, the website
+ design docs + skills rename, the plugin-option docs on the Configuration page, and
the diagnostic-message + regenerated-catalog rename. Full Go + JS suites green.

**Follow-up refinements (same PR):**

- **`enrich --translate` → `enrich --i18n`.** The verb only manages the translation
  FILES (never does translation), so the flag is named for the config it reads: the
  tsconfig `i18n` block, the plugin `enrich.i18n` option, and now `enrich --i18n`
  all line up. The sub-modes are unchanged (bare = create, `--update` = sync,
  `--prune` = strip, `--no-emit` = completeness gate) — they just combine with
  `--i18n`. (`splitArgs`' value-flag table was updated in lockstep.)
- **No duplicated functionality in `cmd/`.** The locale closure → spec transform is
  now the single exported `enrichgen.TranslationSpecs`; the CLI's
  `buildTranslationSpecs` calls it (the earlier duplicate is gone). The CLI keeps
  only the genuinely CLI-specific parts (friendly-mirror discovery + Program build).
- **Files renamed** `translate.go` → `i18n.go` (both the `enrichgen` and `cmd` copies,
  plus the test) for naming consistency with the flag + config.

**Follow-up: the completeness gate (`--require-complete`) + value-based detection.**

The original `--no-emit` conflated two questions ("is this correct?" and "is this
finished?") and hard-failed on an unfilled `@todo` — so a freshly-scaffolded mirror
failed its own health check. Split into two tiers, keyed off a `Completeness` bit on
the diagnostics catalog entry (FT020/MD020 `@todo`, FT023/MD023 blank value):

- `enrich <target> --no-emit` — health check. Fails on WRONG/stale content (bad
  field, orphan carcass, breadcrumb drift); REPORTS the completeness tier but exits 0.
- `enrich <target> --require-complete` — implies `--no-emit`, and additionally fails
  on the completeness tier. The gate CI / a production build runs.

The tier bit stays Go-internal (`diagnostics.IsCompleteness`, consumed by the CLI's
`reportEnrichDiagnostics` / `runGenCheck` and the i18n gate via `strict || requireComplete`);
FT020/MD020/FT023/MD023 keep **Error** severity so the editor still flags them.

**Value-based completeness (FT023/MD023).** An unfilled `@todo` is only a marker; the
real incompleteness is a blank VALUE (`rt$label: ''`, `pool: []`) — deleting the
`@todo` line without filling the values is not "done". `mirror.BlankValues` scans for
empty-string / empty-array sentinels at property-value positions, parse-guided (the
literal-token oracle for empty strings so a `''` array element / string interior never
counts; import-masked text for empty arrays so a filled `['x']` never reads as empty),
family-attributed per const (`FamilyAt`, at-or-before, since a value sits below its
annotation). Wired into the shared `CheckFile` (single-file + scaffold-target lanes)
AND the directory walk (`checkMirrorFile` runs the same text scan), so a tree-level
`--require-complete` is sound.

**Plugin production gate.** `enrichDriftGate` (the read-only `vite build` lane) now
enforces the same completeness: it surfaces the daemon's hygiene diagnostics over the
computed mirrors and, under `failOnError`, fails the build on an unfilled `@todo` /
blank value as well as on drift — the plugin analog of `enrich --require-complete`.
Dev/watch (`syncEnrich`) still writes the scaffolds and tolerates the blanks.

**Follow-up: the OpEnrich wire slims to `files` — the wire carries events, the
session carries config.** PR review flagged that the enrich request fields were
session-constant config echoed on every call. Now: `typeName` (the CLI-parity
single-type lane; the parity test re-anchored on the shipping demand path with a
marker-demanding fixture), `enrichUpdate` (the daemon op simply IS sync —
reconcile-or-scaffold), and `enrichNoEmit` (never set in production) are DELETED;
the families, the i18n selection, and the output root move to spawn-time serve
flags (`--enrich-friendly` / `--enrich-mock` / `--enrich-i18n` /
`--enrich-locales` / `--enrich-source-locale` / `--gen-dir`) landing in
`resolver.Options`, with the i18n locales/sourceLocale defaulting from the
tsconfig plugin `i18n` block (project mode) and `resolveOutDir` gaining the
flag > tsconfig > inferred precedence so OpEnrich and OpGenerate always agree on
the root without a wire echo. The JS client's `enrich(files)` is event-only;
`buildResolverArgs` forwards the new flags with the guarded only-when-set idiom.
The plugin also gained a first-sync summary (`scaffolded N, reconciled M`) so a
fresh opt-in is never a silent burst of new files. The same audit, extended to
the REST of the Request surface (`outDir`, `omitSourcesContent`, the dead
`resolveId` op), is specced in
[docs/done/protocol-startup-config-audit.md](./protocol-startup-config-audit.md).
