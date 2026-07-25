---
type: feature
spec: full-plan
status: ready
created: 2026-07-25
---

# Uniform `--no-emit` enrich/compile surface **+** plugin-driven enrichment sync

_This spec merges two previously-separate todos and ships them together in
**one PR**:_

- _Part A — CLI surface refactor: rename `gen`→`enrich`, delete `check`, add a
  uniform `--no-emit` on both emitting verbs, and (Stage 2) expose enrichment as
  a daemon protocol op. Absorbs `docs/todos/dual-mode-enrich.md` (removed when
  the original Part A spec was filed) and is the deferred continuation of PR
  #279 — [docs/done/cli-subcommand-consolidation.md](../done/cli-subcommand-consolidation.md)._
- _Part B — plugin-driven enrichment sync: opt-in bundler-plugin options that
  drive the same scaffold+reconcile pass from dev/watch, so a developer no
  longer has to run the CLI by hand. Deferred half of
  `docs/done/option-parity-tsconfig-plugin.md` (the tsconfig-plugin option
  parity shipped without `i18n` plugin parity; `i18n` is folded into Part B
  because it is meaningful on the plugin only once the plugin drives
  enrichment)._

**Why bundle them:** Part B is the first real consumer of Part A's daemon op
(Stage 2c) — landing them together lets Part B call the daemon op directly
instead of spawning the CLI, avoids two rounds of docs churn (command names +
plugin options move together), and keeps the "enrichment is CLI-only / never
in a build" invariant statement consistent across the website / architecture
docs in one edit.

---

# Part A — Uniform `--no-emit` surface (rename `gen`→`enrich`, delete `check`)

## Context (why)

PR #279 gave the binary a tsgo-style `args[0]` surface (`serve` / `compile` /
`gen` / `check`). Two rough edges remain:

1. **`gen` is too generic.** The verb does exactly one thing — scaffold and
   reconcile the FriendlyText / MockData enrichment mirrors — and everything
   around it already says "enrich" (the skill, the docs, the FT/MD/GE
   diagnostics). `enrich` is the honest name. (The `--friendly` / `--mock`
   family split already exists — `enrich_cli.go:67-68`, default both — so this
   is a naming/discoverability fix, not new capability there.)

2. **`check` is a generically-named verb that secretly means "enrichment
   only,"** and the core pipeline has no "report errors without emitting" mode
   at all. Investigation settled the right shape: **both are the same
   outcome** — walk, emit `diagnostics.Diagnostic`, exit non-zero on Error —
   and the daemon *already* proves it: `scanFiles` returns core
   (`FamilyRunType`) and enrichment (`FamilyEnrich`) diagnostics in **one
   stream**, gated by two independent flags (`Request.CheckEnrich` /
   `Request.IncludeRtDiagnostics`, `dispatch.go:768`). Orphans and `@todo` are
   first-class diagnostics (`CodeFriendlyTodo` / `CodeFriendlyOrphanConst` …,
   all `FamilyEnrich`, `diagnostics/codes_friendly.go`, `codes_mock.go`).

The fix copies TypeScript verbatim: **reuse `--no-emit` as a uniform flag on
both emitting verbs.** The `check` verb dissolves. This is the owner's
uniform-surface goal (mode orthogonal to capability) reduced to one idiom every
TS user already knows.

Folded in: the parked Part B goal of the earlier consolidation — every enrich
capability reachable BOTH as a CLI verb AND a daemon protocol op over ONE
shared implementation. With `check` gone, that collapses to "make `enrich` a
daemon op with a `noEmit` switch" (enrichment *check* on the daemon already
exists as `scanFiles{checkEnrich}`).

## Target surface

```
serve                       daemon IPC (unchanged)
compile [--no-emit]         core: walk → emit .js + caches + diagnostics;
                            --no-emit → diagnostics only, write nothing
enrich  [--no-emit] …       enrichment: scaffold/update/prune/translate +
                            diagnostics in one pass; --no-emit → diagnostics only
```

`check` is **removed**. Its three lanes map onto `enrich --no-emit`:

| Today | Becomes |
|---|---|
| `gen <src> <Type>` | `enrich <src> <Type>` (writes **+ diagnostics**) |
| `gen <src> <Type> --update` | `enrich <src> <Type> --update` |
| `gen --prune [path]` | `enrich --prune [path]` |
| `gen --translate <loc> [src]` | `enrich --translate <loc> [src]` |
| `gen --files a,b --type T` | `enrich --files a,b --type T` (batch JSON, unchanged) |
| `check <file>` | `enrich <file> --no-emit` (single-file health) |
| `check [<dir>]` / `check` | `enrich [<dir>] --no-emit` (mirror-tree drift) |
| `check --translate <loc>` | `enrich --translate <loc> --no-emit` (i18n gate) |
| — (none) | `compile --no-emit` (core typecheck/RT-diagnostics, no writes) |

**Grammar rule (the one surface decision):** a scaffold target (`<src> <Type>`
pair, or the `--prune` / `--translate` write flags) selects a **write** mode;
`--no-emit` turns any write mode into diagnostics-only. A **check-only** target
(one bare file, a dir, or no positional — no `<Type>`, no write flag)
**requires `--no-emit`** to be explicit (`tsc --noEmit`-style), which also
disambiguates `enrich <src>` with a missing Type (errors: "provide a Type to
scaffold, or --no-emit to check").

## Plan — two stages

Stage 1 is the whole user-visible change and the shared-impl refactor
(existing enrich suites gate it, no protocol change). Stage 2 adds the daemon
transport + parity (folded-in earlier Part B). **Both stages ship in this
PR** because Part B (plugin sync) consumes Stage 2's daemon op.

### Stage 1 — CLI surface + refactor-first

**1a. Extract `internal/enrichment/enrichgen` (new leaf pkg).** Move
`enrichConfig` + its resolution (`resolveEnrichConfig`, the `mirrorPath` family
in `config.go:238-403`) out of `cmd/` (params, no `fatal`, return `error`),
plus the pure orchestration `PlanScaffold(resolved, cfg, want, existing) →
([]mirror.Spec, error)` over the already-pure `mirror.Scaffold` /
`mirror.Reconcile` seams. **Seam fix: lift `migrateLegacyMirror` OUT of
`groupSpecs`** (`enrich_cli.go:244` — it does disk I/O via `enrich_migrate.go`)
so spec-building is pure; migration stays a CLI-only pre-step.
`writeMirrorFile` (`enrich_cli.go:313`) / `updateMirrorFile`
(`enrich_reconcile.go:35`) stay in `cmd/` as disk shims; the daemon handler
(Stage 2) collects `{Path, Content, Added}` instead. `existing` is injected
(CLI and daemon both read disk → parity holds).

**1b. Collapse the two `check` orchestrations into one shared
`CheckFile(sourceFile, checker, cache, fs, filePath) []diagnostics.Diagnostic`**
in `internal/enrichment`: tag hygiene (`DirtyTags`) + `astcheck.CheckSourceFile`
+ breadcrumb drift, **drift gated on `scan.HasMarkerComment()`** (resolver
behavior wins). Resolver `checkEnrichFiles` (`resolver/enrichcheck.go:28`) and
the CLI check lane both delegate; delete the duplicated `tagCode` (lives in both
`enrichcheck.go:104` and `enrich_check.go:180`). NOTE: this changes the CLI
check to gate drift on the marker comment + read the Program FS — reconcile the
`enrich_gencheck_test.go` / single-file expectations to the unified behavior.

**1c. Merge `gen` + `check` into one `enrich` handler + add `--no-emit`.**
- `main.go:88-89` command table: `"gen": runGen` → `"enrich": runEnrich`;
  **delete `"check": runCheck`**. FlagSet name `enrich_cli.go:66` `"gen"` →
  `"enrich"`; retire `enrich_check.go`'s `flag.NewFlagSet("check",…)`.
- `runEnrich` owns the grammar table above: 2 positionals → scaffold (write
  path, then run `CheckFile` and emit its diagnostics — the "in one pass"
  behavior); `--prune` / `--translate` → their write lanes; `--no-emit` gates
  every write (prune → list-only; update → report-only; translate → i18n gate);
  a bare file / dir / empty target under `--no-emit` → `CheckFile` /
  mirror-tree walk (absorbs `runGenCheck`, `enrich_gencheck.go:50`).
- The former check-only entry points (`runCheck`, `runGenCheck`,
  `runCheckTranslate`) fold into `runEnrich`'s `--no-emit` branches; keep their
  helpers (`checkMirrorFile`, drift walk, `reportFindings`).

**1d. Add `compile --no-emit`.** `main.go` `runCompile:520` registers a
`--no-emit` bool; thread `NoEmit` into `batchcompile.Options` (`compile.go:44`).
When set, `batchcompile.Run` builds the Pass-1 program + resolver, dispatches
**`OpDump`** (which runs the full scan + `collectEntryModules` + diagnostics
**in memory, zero writes** — `dispatch.go:875-920`), returns
`result.Diagnostics`, and **skips `OpTransform` / `OpGenerate` / Pass 2
entirely**. (v1 reports the same RunType-family diagnostics `compile` already
computes; surfacing tsgo's native type-error diagnostics is out of scope.)

**1e. Drop `"source"` + thread `hashLength` (CLI resolves like the daemon).**
Remove the three `"source"` injections: `config.go:244`
(`resolveEnrichProject`'s `ParseInferredConfig(…, "source")`) and
`enrich_cli.go:33` / `:54` (`buildProgram` / `buildProgramMulti`'s
`Conditions:["source"]`). Thread the project `hashLength` into the enrich
`resolver.Options{}` (today hardcodes only `Cwd` at `enrich_cli.go:37,58`) so
gen's hash-sensitive `@rtType` ids match a build. **Source-drop fix (verified,
prior Part B):** point the two spawns in
`packages/ts-runtypes/test/util/enrichGen.ts` (`:83` gen-files, `:161` check)
at `--tsconfig <abs>/packages/ts-runtypes/tsconfig.test.json` (already carries
`customConditions:["source"]`, mirroring `vitest.config.ts`). Audit the other
JS spawn harnesses (`enrichReconcile.ts`, `fuzz/enrich/enrichCli.ts`,
`i18nModel.ts`, `enrichRace.test.ts`, `enrich-hmr-e2e.test.ts`) for
`@ts-runtypes/core/formats` imports and add the same flag where needed (prior
Part B judged only the two enrichGen spawns load-bearing — re-verify). Do NOT
add `customConditions` to the discoverable root/package `tsconfig.json`
(leaks `"source"` into `pnpm build`).

### Stage 2 — daemon op + parity (folds in earlier Part B)

**2a. Protocol** (`internal/protocol/protocol.go`): add one `OpEnrich` constant
(`:339-394`); Request fields `TypeName`, `EnrichFriendly` / `EnrichMock` /
`EnrichUpdate`, `EnrichNoEmit`, `GenDir` (`:404-451`); Response
`EnrichFiles []EnrichFile{Path,Content,Added,Kind}` (`:496-621`) **registered in
the hand-rolled `Response.MarshalJSON`** (`:870-932`, precedent `SiteFiles`
`:904`, `FailOnError` `:910`). `EnrichNoEmit=true` returns `Diagnostics` only
(reusing the existing channel); false returns `EnrichFiles` + `Diagnostics`.

**2b. `dispatchEnrich` handler** (`resolver/dispatch.go`, a `case` in the switch
at `:728`): guard `sess.Program == nil`, call the SAME Stage-1 shared functions
with `sess.Program`, `sess.checker`, `sess.cache`, `sess.Program.FS`. No new
import cycle (resolver already imports `enrichment` via `enrichcheck.go`). The
lint lane (`scanFiles{checkEnrich}`, `dispatch.go:768`) is **unchanged** — a
distinct per-file editor consumer.

**2c. JS client** (`packages/ts-runtypes-devtools/src/resolver-client.ts`): an
`enrich(opts)` method on `ResolverClientBase` (model on `generate()` `:429`),
added to the `ResolverConnection` interface (`:325-335`); `protocol.ts`: extend
the `Request.op` union (`:316`) + Request/Response fields + an `EnrichFile`
interface (additive — JS `Response` is a plain interface, no marshaller).

**2d. Parity test** — `cmd/ts-runtypes/enrich_parity_test.go` + one Vitest wire
e2e through `ResolverClient`: drive an in-process `resolver.Session` dispatch AND
the CLI shared-fn path over one fixture (tsconfig carrying
`customConditions:["source"]`), assert byte-identical `{Path,Content}` (gen,
incl. `--update`) and same codes+sites (`--no-emit`). Pin the SAME `hashLength`
both sides.

## Tests (Part A)

- **CLI surface contract test (new — THE regression guard).** One spawn-based
  golden test over the built `bin/ts-runtypes` (Vitest, e.g.
  `packages/ts-runtypes-devtools/test/cli-surface.test.ts` — `pnpm run pretest`
  builds the binary) that pins **every command and every parameter** so any
  drop / rename / description change / behavior drift trips it:
  - **Help golden.** Snapshot the top-level usage (`ts-runtypes`,
    `ts-runtypes -h`, `--version`) and each command's FULL `--help`
    (`serve -h`, `compile -h`, `enrich -h`) against a checked-in golden.
    Because `printUsage` (`main.go:353`) renders EVERY registered flag via
    `fs.VisitAll` + `flag.UnquoteUsage`, the golden captures the complete verb
    set + per-command flag names/types/descriptions automatically — add,
    remove, or rename a flag and the golden diffs. Regenerated intentionally via
    a documented update step (standard golden pattern).
  - **Routing + exit codes.** Each of `serve` / `compile` / `enrich` routes to
    its handler; unknown `args[0]` → usage on stderr + exit 2; no args → usage
    + exit 2; `-h` / `--help` / `--version` peeled (`main.go:98-105`).
  - **Parameter-effect matrix.** One assertion per observable flag effect —
    `compile --no-emit` and `enrich --no-emit` write NOTHING (assert the genDir
    tree is untouched) yet still emit diagnostics; `enrich … --json` emits JSON;
    `--friendly` / `--mock` select the right family file(s); `--gen-dir`
    redirects output; `enrich --prune --no-emit` lists orphans but deletes
    nothing. This is the behavior half the help golden can't see.
- **Go.** The verb rename touches only `main.go`'s table + the two FlagSet name
  strings — every `cmd/ts-runtypes/*_test.go` calls the **helper functions
  directly** (not `args[0]`), so they survive the rename and break only if a
  helper is renamed. Update: `enrich_gencheck_test.go` (check→enrich drift lane,
  reconcile to marker-gated drift), `enrich_translate_test.go` (translate gate),
  and the new `enrichgen` pkg tests (pure `PlanScaffold`). `go -C ts-go-runtypes
  test ./internal/... ./cmd/...`.
- **Vitest.** Every JS spawn site moves `gen`→`enrich`, `check <f>`→`enrich <f>
  --no-emit`: `test/util/enrichGen.ts:83,161`, `enrichReconcile.ts:103,112`,
  `fuzz/enrich/enrichCli.ts:58-80`, `fuzz/enrich/i18nModel.ts` (translate
  spawns), `enrichRace.test.ts:63`, `suites/enrich/*.test.ts`,
  `ts-runtypes-devtools/test/enrich-hmr-e2e.test.ts:85`. Add a `compile
  --no-emit` case (diagnostics, no files written) and a `enrich --no-emit`
  case. Rebuild `bin/ts-runtypes` first; `pnpm test`.
- **Marker rule:** no `getRunTypeId` API change here — no new marker-shape
  coverage needed (per CLAUDE.md Testing).
- **`buildResolverArgs`** (`resolver-client.ts:484`) already emits only
  `serve` — untouched.

## Settled sub-decisions (Part A)

- **`--no-emit` is required to enter check-only modes** (bare file / dir / no
  target); write modes accept it as a dry-run. This disambiguates a missing
  `<Type>` and mirrors `tsc --noEmit`.
- **Write-mode `enrich` emits the freshly-scaffolded `@todo` diagnostics** — a
  fresh scaffold immediately reports every blank (FT020/MD020) as the worklist;
  intentional, symmetric with `compile`.
- **The enrich daemon op RETURNS content, never writes** (Part B's no-HMR
  constraint from the earlier plugin-sync spec); the CLI keeps
  `atomicWriteFile`. `migrateLegacyMirror` is a CLI-only pre-step, skipped by
  the daemon op.

## Out of scope (Part A)

- Surfacing tsgo's native type-error diagnostics under `compile --no-emit` (v1
  reports the RunType-family diagnostics `compile` already computes).
- Any change to the lint lane (`scanFiles{checkEnrich}`) or the marker API.
- **Not the `rtx` CLI** (`scripts/rt.mjs`): its own `check`/`generate`
  subcommands are unrelated to the binary's `args[0]`.

---

# Part B — Plugin-driven enrichment sync

## Intent

Today all enrichment (FriendlyText, MockData, i18n translation mirrors) is
**CLI-driven**: the developer runs `ts-runtypes gen ... --update` (post-Part-A:
`ts-runtypes enrich ... --update`) to scaffold and keep the committed mirror
files under `<genDir>/enriched/{friendly,mock,i18n/<locale>}` in sync as their
types change. The bundler plugin drives none of it — enrichment is dispatched
as a separate `ts-runtypes` subcommand (its own Program, `os.Exit`), and the
build/generate lane never touches the `enriched/` contents (they're consumed at
runtime through ordinary committed imports).

We want the **bundler plugin to optionally drive that same scaffold + keep-in-
sync pass**, so a developer doesn't have to remember to run the CLI: as source
types change during a dev/build, the plugin regenerates and reconciles the
enrichment mirrors, exactly like `enrich --update` does. This is *scaffold +
sync only* — NOT translation. Filling in translated strings stays a developer/
skill-triggered step; the plugin only keeps the file structure current. The
CLI verbs remain the authoring path, unchanged.

Why it's cheap and safe: `enrich --update` is deterministic, value-preserving
(never clobbers authored values), idempotent and convergence-proven (see
`enrich-hmr-e2e.test.ts`), so driving it from the plugin does not violate the
"never call an LLM in a build" invariant. The plugin's scan already knows the
demanded named types + their source files, so it knows exactly what to enrich
with little new config.

## Direction

**All new config is UNPLUGIN-ONLY (`PluginOptions` in
`packages/ts-runtypes-devtools/src/unplugin.ts`), NOT tsconfig.** This feature
is a host/dev-loop behavior, so it does not go through the tsconfig plugin
entry or the option-parity guard's shared set. The CLI stays the authoritative
authoring path.

Decided config semantics (implementer finalizes the exact shape; a grouping
under one `enrich` object is suggested):

- **FriendlyText → a boolean flag** — enable auto gen+sync of the
  `enriched/friendly/` mirrors.
- **MockData → a boolean flag** — enable auto gen+sync of the `enriched/mock/`
  mirrors.
- **i18n → a config object** (`sourceLocale?`, `locales?`, `strict?` — same
  shape as the tsconfig `i18nPluginConfig` at
  `ts-go-runtypes/cmd/ts-runtypes/config.go`); **its presence is the enable
  flag** for scaffolding/syncing the per-locale `enriched/i18n/<locale>/`
  mirrors.
- **An HMR-suppression flag** — when set, the unplugin ignores HMR / triggers
  no reload for changes under `<genDir>/enriched/**` (these are write-only
  outputs). Make it a **toggle** so it can be turned off to experiment/debug
  "in case HMR is causing issues in those dirs." Note this flag is somewhat
  orthogonal to the auto-gen flags: it's about how the dev watcher treats the
  write-only enrich folder, and is useful even when the enriched files are
  edited by hand or by the CLI while the dev server runs.
- **Default OFF for everything** — existing builds/dev servers must be
  unchanged unless opted in.

## Transport — use Part A Stage 2's daemon op

Because we're shipping Part B in the same PR as Part A, **the plugin drives
enrichment through the new `OpEnrich` daemon op (Part A Stage 2), NOT a
child-process spawn.** Rationale:

- The plugin already holds a warm `ResolverClient` connection — a protocol op
  is one round-trip vs a per-file `spawnSync`.
- Part A 2c ships the JS `enrich()` client method the plugin can call directly.
- The daemon op RETURNS content (Part A settled sub-decision) — the plugin
  writes files under the HMR-suppression window, keeping the "gen returns
  content, never writes from the daemon" invariant intact.
- No new Go/protocol change is needed beyond Part A Stage 2.

(If Part A Stage 2 is descoped for any reason, fall back to spawning
`bin/ts-runtypes enrich <file> <Type> --friendly --mock --update --gen-dir
<genDir>` — the same path `enrich-hmr-e2e.test.ts` already drives via
`spawnSync`. This is the original plugin-sync spec's proposal.)

Verified pointers (from a 2026-07-24 investigation — the implementer should
still re-confirm):

- CLI surface to call (spawn fallback): `ts-runtypes enrich` flags are
  `--mock`, `--friendly`, `--update`, `--prune`, `--gen-dir`, `--translate`
  (`ts-go-runtypes/cmd/ts-runtypes/enrich_cli.go`, renamed under Part A 1c).
  `--update` is the value-preserving reconcile; `--prune` is destructive
  (keep manual, never auto-run); a plain `enrich` scaffolds; `--no-emit` is
  read-only.
- Enrichment ↔ build boundary to respect: enrichment is a separate argv
  dispatch (`cmd/ts-runtypes/main.go`, before flag parsing), its own inferred
  Program; the generate lane never reads `enriched/` contents
  (`internal/compiler/resolver/generate.go`). Keep the driver deterministic
  (scaffold + reconcile only).
- Discovery: the plugin's scan response already carries the demanded named
  types + source files (`Response.RunTypes[].typeName`, `SiteFiles`) and the
  resolved `genDir` (`gen.outDir`), so it can target the right `(file, Type)`
  pairs.
- HMR hook: the unplugin implements `vite.handleHotUpdate` (and could add
  `watchChange`) in `unplugin.ts`. The suppression should short-circuit any
  change resolving under `<genDir>/enriched/**` (`gen.outDir` + `/enriched`).

## Left for the implementer to plan with fresh context

(Part B is `spec: guidelines`-level inside this otherwise-`full-plan` doc —
the following need concrete decisions before/while coding:)

- **When it runs** — dev/watch sync vs also on a production build.
  Recommendation: sync in dev/watch, and on a full build either do nothing or a
  read-only `enrich --no-emit` (mutating committed source mid-build breaks
  build reproducibility). Confirm with the owner.
- Debounce / batching of `enrich --update` calls across rapid edits; whether
  one pass covers all enabled families per changed file.
- The exact `PluginOptions` shape (grouped `enrich` object vs top-level flags)
  and how the HMR-suppress flag relates to the auto-gen flags.
- Parity-guard bookkeeping: add the new unplugin-only keys to `JS_ONLY` in
  `packages/ts-runtypes-devtools/test/plugin-option-parity.test.ts` (they
  intentionally have no tsconfig counterpart). Reconsider whether the plugin's
  `i18n` object should share the tsconfig `i18n` — they may share a shape but
  drive different lanes (plugin enrichment vs the CLI).

## Tests (Part B)

- A plugin-driven analog of `enrich-hmr-e2e.test.ts`: drive through the plugin
  hook, assert the mirrors sync AND that touching the enrich folder does not
  trigger HMR.
- Each family toggles independently (FriendlyText flag, MockData flag, i18n
  object presence); everything defaults OFF; a plugin with none of these set
  behaves exactly as today.

---

# Combined docs

- **Website** (house voice, `<code-import>` where TS): command tables +
  invocations in `3.ai-integration/1.workflow-and-commands.md:88-95`,
  `2.friendly-type.md:80`, `4.i18n.md:35-47`, `2.guide/9.linting.md:32,91-95`,
  `1.introduction/4.configuration.md`, `index.md:310,382`.
- **Enrichment CLI-only invariant text** in `docs/AI_ENRICHMENT.md` and
  `container/website/content/3.ai-integration/1.workflow-and-commands.md`
  now reflects **both** (a) the renamed verbs / `--no-emit` surface and
  (b) the new opt-in plugin-driven sync. New plugin options are documented on
  the config page as bundler-plugin-only.
- **Skills:** `packages/ts-runtypes/skills/rt-enrich-types/SKILL.md`
  (workflow steps + command block L20-33/L130-134),
  `runtypes-friendly-type/SKILL.md:268-270`, `.claude/skills/enrich/SKILL.md:3,14`.
- **Design docs:** `docs/AI_ENRICHMENT.md` (command tables L497-510, the agent
  loop, `### gen semantics`), `docs/ARCHITECTURE.md:87,515`.
- **Diagnostic messages** (embed CLI strings): `diagnostics/messages.go`
  (`ts-runtypes gen --prune` / `… --update` / `ts-runtypes check` at
  L549-635), `codes_gencheck.go:3`, `codes_friendly.go:10`, `codes_mock.go:7`,
  `catalog.go:61`, `mirror/scanTags.go:82`, `hygiene.go:13`. Regenerate the
  mirror via `pnpm run gen:diag-catalog` (rewrites
  `devtools/src/go-generated/diagnosticCatalog.generated.ts`).
- On landing, move THIS spec to `docs/done/`.

# Fuzzing

Not a new-oracle candidate — Part A is a CLI-surface + transport refactor
with no new data transform, and Part B is a dev-loop driver over an already-
convergence-proven reconcile. The existing enrich fuzzers (`test/fuzz/enrich/*`)
are the gate; they must stay green through the verb rename (their spawn args
move to `enrich` / `enrich --no-emit`).

# Done when

**Part A**
- `gen` is renamed to `enrich`; `check` is deleted; `compile --no-emit` and
  `enrich --no-emit` both run the analysis and emit diagnostics while writing
  nothing (the `tsc --noEmit` idiom).
- `enrich` (write mode) emits enrichment diagnostics in the same pass it
  scaffolds (the agent's fill-in worklist).
- Existing Go + JS enrich suites stay green through the rename; new coverage
  for both `--no-emit` modes.
- A CLI surface contract test pins every command + parameter (help golden +
  routing/exit codes + parameter-effect matrix), so a future flag drop,
  rename, or behavior change fails a test.
- Every enrich capability is reachable as a daemon op AND a CLI verb over one
  shared impl, pinned by a CLI≡daemon parity test.

**Part B**
- With the options enabled on the bundler plugin, editing a source type during
  dev/watch scaffolds and keeps in sync the corresponding
  `enriched/{friendly,mock,i18n/<locale>}` mirror files, matching what
  `ts-runtypes enrich --update` produces (value-preserving; NO translation
  content).
- Each family toggles independently: FriendlyText flag, MockData flag, i18n
  object presence. Everything defaults OFF; a plugin with none of these set
  behaves exactly as today.
- When the HMR-suppression flag is set, writing/regenerating (or hand-editing)
  files under `<genDir>/enriched/**` triggers NO HMR/reload; toggling it off
  restores normal behavior.
- The CLI verbs (`enrich`/`enrich --no-emit`/`--translate`) are unchanged
  from Part A and remain the authoring path.
- Tests: a plugin-driven analog of `enrich-hmr-e2e.test.ts` (drive through the
  plugin hook; assert the mirrors sync AND that touching the enrich folder
  does not trigger HMR).

**Combined**
- Docs + diagnostic messages updated in one pass (Part A verb rename **and**
  Part B opt-in flags are described consistently).
- This spec moved to `docs/done/`.
