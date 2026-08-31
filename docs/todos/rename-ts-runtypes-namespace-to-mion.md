---
type: chore
spec: full-plan
status: ready
created: 2026-08-31
---

# Rename `@ts-runtypes/*` back to mion, driven by a sharded decision-file tool

## Problem

The `ts-runtypes` name collides with the well-known `runtypes` library and has drawn bad
feedback. The four `@ts-runtypes/*` packages move back under the mion namespace and the
`@ts-runtypes` npm scope is retired.

This **reverses Decision 1** of
[merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md)
("keep `@ts-runtypes/*`"), which already named a return to `@mionjs/run-types` as the
rebrand candidate and kept that package live and undeprecated on npm for exactly this.
That master plan must be updated as part of this work.

A blind find-and-replace is not viable. Measured across tracked files on 2026-08-31:

| | |
|---|---|
| Occurrences of a runtypes-ish token | 19,526 |
| Distinct spellings | 269 bare, 736 with path/scope chars |
| **`RunType` the domain concept** (`getRunTypeId`, `RunTypeKind`, `InjectRunTypeId`) | ~8,000, **public API, must never change** |

`getRunTypeId` alone is 2,692 hits. Any case-insensitive replace on "runtypes" destroys
the public API. So the work is gated behind a tool that classifies every occurrence and
records a decision before anything moves.

The packages in scope are the `packages/ts-*` directories:

```
packages/ts-runtypes               @ts-runtypes/core            (public)
packages/ts-runtypes-devtools      @ts-runtypes/devtools        (public)
packages/ts-runtypes-bin           @ts-runtypes/bin             (public)
packages/ts-runtypes-go-be-sidecar @ts-runtypes/go-be-sidecar   (private)
+ generated @ts-runtypes/binary-<os>-<arch> (scripts/release/build-binaries.mjs:61)
```

`packages/run-types/` and `packages/type-formats/` are untracked leftovers on disk (only
`node_modules`, neither is in git). Nothing to migrate, just delete them.

## What exactly we match

Two pattern families. The separator set is **verified complete**: a catch-all sweep for
`run.{0,3}type` shows only empty (19,169), `-` (436), `_` (46) and space (14) ever occur
between "run" and "type".

### Pattern 1: the name itself

```js
/(?i)run[ _-]?types?/
```

One regex covers every spelling: `runtypes`, `RunType`, `ts-runtypes`, `run-types`,
`RUN_TYPE`, and the spaced prose form `run type` / `Run types` (14 hits). **~19,665 hits.**

Each match is then **expanded outward to the full surrounding token** so
`@ts-runtypes/core` is one decision unit, not a bare `runtypes` fragment. Expansion
charset: `[A-Za-z0-9_@/.$-]`. That expansion is what produces the 736 distinct raw tokens.

### Pattern 2: the `rt` abbreviations (contain no "runtype" at all)

Every one is **anchored**, because a bare `rt` would match `sort`, `start`, `part`:

| Pattern | Hits | Rows | Default mark |
|---|---|---|---|
| `\bRT_[A-Z][A-Z0-9_]*` | 1,118 | ~28 | in scope, decision 2 |
| `(?i)\btsrt[-_]` (image names) | 111 | ~3 | in scope, decision 2 |
| `\brt\$[a-zA-Z]+` (`rt$label`, `rt$errors`, …) | 2,435 | ~15 | **`keep`** |
| `\brt(Formats)?::` (pure-fn namespaces) | 570 | 2 | **`keep`** |
| `__rt[A-Za-z_]+` (`__rtFormatName`, brands) | 781 | ~20 | `keep` |
| `\brtx\b` (the repo CLI) | 806 | 1 | `keep` |
| `\bTS_RUNTYPES[A-Z0-9_]*` | 31 | ~3 | in scope (also caught by pattern 1) |

**~5,850 hits but only ~70 rows**, because each collapses to a handful of distinct tokens.
Cheap to include, and leaving them out would be a silent gap.

Two of these defaults are load-bearing and must be explicit rather than accidental:

- **`rt$*` keys are a public data format.** Consumers' committed FriendlyText / MockData
  enrichment files are written with them. Renaming breaks every existing consumer file.
- **`rt::` / `rtFormats::` are in the cache wire format**, so a rename would invalidate
  generated caches.

**Explicitly NOT matched:** bare `\brt\b` and bare `\bts-`. Both are overwhelmingly false
positives and neither carries the package identity on its own.

## The insight that makes this tractable

Occurrences collapse hard when keyed by `token@context-kind`:

| | |
|---|---|
| Decision rows, pattern 1 (`token@kind`) | **1,129** |
| Decision rows, pattern 2 | ~70 |
| Top 300 rows cover | 92.7% of all sites |
| Single-site tail rows | 452 |
| Total JSON, all shards | ~127 KB (~60 KB once prefilled rows drop `eg`) |

So ~25,500 occurrences become **~1,200 decisions**, roughly 130 per shard. One flat table,
one row shape, no separate vocabulary or override files.

## Plan

### 1. The tool: a throwaway, self-contained `migration/` directory

**This tool is single-use and gets deleted once the migration is green.** It is therefore
kept entirely out of `scripts/`, out of `rtx`, and out of the permanent test suite, so
removing it is one `rm -rf migration/` with no dangling references anywhere.

Run with plain node, no dispatcher, no workspace wiring:

```bash
node migration/scan.mjs      # dry pass; writes shards, prefills by rule
node migration/check.mjs     # fails if ANY row is unmarked or `t` is unknown
node migration/apply.mjs --dry
node migration/apply.mjs --phase <name>
node migration/verify.mjs    # re-scan; every surviving hit must map to a `keep`
```

```
migration/
  scan.mjs        walks `git ls-files`, tokenizes, classifies, writes shards
  check.mjs       the gate
  apply.mjs       reads shards, re-derives keys, applies edits, renames files
  verify.mjs      post-apply re-scan
  lib/kind.mjs    the `kindOf()` classifier. SHARED by scan, check, apply, verify
  lib/rules.mjs   prefill rules mapping `token@kind` to a transform
  lib/transforms.mjs   the closed transform set + case map
  targets.json    the new names. The ONLY file holding the naming decision
  shards/*.json   the decision tables (committed, so marking is reviewable in git)
  test/           self-contained, run with `node --test migration/test/`
```

Zero dependencies, node built-ins only (node >= 26 is already required). No import from
`scripts/lib/`, no import into it: nothing permanent may come to depend on this directory.
The shards **are** committed while the migration runs, so each agent's marking shows up in
`git blame` and is reviewable, then the whole directory goes in the final commit.

### 2. Slim row schema

Sites are **never** stored. `apply` re-derives each occurrence's key with the same
`kindOf()` and looks the decision up. That is what keeps the files at ~60 KB.

```jsonc
// migration/shards/05-go.json
{
  "t": ["keep","npm-scope","pkg-dir","go-module","go-dir","gen-dir","env-var",
        "image","cli-bin","lint-rule","prose","repo-url","regenerate","freeze","manual"],
  "rows": [
    {"id":"getRunTypeId@go-ident",    "n":1094, "t":"keep"},
    {"id":"@ts-runtypes@import-spec", "n":2108, "t":"npm-scope"},
    {"id":"ts-runtypes@comment",      "n":371,  "t":"",
     "eg":"//   TS_RUNTYPES_DIVERGENT  ts-runtypes is the surpris"}
  ]
}
```

- `id` = `token@kind`, the primary key.
- `n` = site count. Shows blast radius, and lets `verify` catch scan/apply drift.
- `t` = transform. Empty means unmarked, which is what `check` blocks on.
- `eg` = 60-char sample, **emitted only when `t` is empty**. Marked rows omit it.
- The legal transform list sits in the file header so an agent never needs a separate spec.

Deliberately absent: `sites`, `files`, `contexts`, `sample`, `reason`, `marked_by`,
`confidence`. `git blame` on the shard covers authorship; confidence is expressible as an
empty `t`. Storing site lists is what would blow the files up to megabytes.

### 3. `kindOf()` context kinds

Measured to produce 1,129 rows from 19,526 sites:

```
comment | trailing-comment | import-spec | scoped-name | path | string-lit
md-prose | md-code | cfg-key | cfg-value | go-ident | ts-ident | other-<ext>
```

Correctness does not depend on the classifier being clever, only on it being
**deterministic and shared**: `check` re-derives every key in the tree and hard-fails on
any key missing from the table, so a `kindOf()` change cannot silently mis-apply.

### 4. Transform set (closed; agents pick a name, never write code)

`keep`, `npm-scope`, `pkg-dir`, `go-module`, `go-dir`, `gen-dir`, `env-var`, `image`,
`cli-bin`, `lint-rule`, `prose`, `repo-url`, `regenerate`, `freeze`, `manual`.

`apply` blocks while any row is `manual`. Each transform carries a fixed case map, so one
rule covers `ts-runtypes` / `tsRuntypes` / `TsRuntypes` / `TS_RUNTYPES`.

### 5. Shards, one per package/area

`scan` splits by concept and package so agents cannot conflict:

```
01-vocabulary.json     cross-cutting tokens; run FIRST, alone
02-ts-core.json        packages/ts-runtypes
03-ts-devtools.json    packages/ts-runtypes-devtools, -bin, -go-be-sidecar
04-mion-packages.json  core, router, client, platform-*, drizzle-*, devtools, examples
05-go.json             ts-go-runtypes/
06-scripts-ci.json     scripts/, .github/, root config
07-containers.json     container/pre-publish-e2e, drizzle-e2e, mion-bench, benchmarks
08-docs-website.json   container/website/sites/*, README, SETUP, CLAUDE.md
09-frozen.json         docs/done (pre-marked `freeze`; agent only verifies)
```

Shard 01 runs alone. 02 through 09 run in parallel, one agent each.

### 6. Load-bearing literals (functional, fail silently if missed)

These are compared against at runtime, so they get explicit tests, not just a transform:

```ts
// packages/ts-runtypes-devtools/src/unplugin.ts:300
const MARKER_MODULE = '@ts-runtypes/core';
```

```go
// ts-go-runtypes/internal/enrichment/mirror/index.go:396
case specifier == "@ts-runtypes/core" && isTypeOnly:
// ts-go-runtypes/internal/compiler/resolver/resolver.go:405
return filepath.Join(opts.Cwd, "node_modules", ".cache", "ts-runtypes")
```

Plus `internal/testfixtures/realmarker.go:30,57`, `realdrizzle.go:43`,
`internal/enrichment/mirror/drift.go:59`, and the tsconfig plugin name `"ts-runtypes"`.

**Confirmed safe:** the package name is *not* folded into the typeID hash (only
`constants.Version` is, `internal/cachegen/runtype/serialize.go:533`), so the rename
invalidates no cache format.

### 7. Regenerate, never rewrite

Marked `regenerate`; `apply` skips them and the phase re-runs the generator:

- `pnpm-lock.yaml`
- `packages/ts-runtypes-devtools/src/go-generated/*` (`scripts/core/gen-diagnostics-catalog.mjs`)
- `ts-go-runtypes/**/testdata/` goldens (deliberately excluded from format)
- `packages/ts-runtypes-devtools/test/__snapshots__/`
- drizzle manifests and the generated import map

### 8. File and directory renames

`git mv` runs **after** all content edits, so recorded paths stay valid throughout.
Package dirs plus 7 tracked files:

```
packages/ts-runtypes{,-devtools,-bin,-go-be-sidecar}
packages/examples/tsconfig.runtypes.json          (referenced by package.json:48 typecheck)
packages/platform-bun/loader/runtypes-loader{,.test}.ts
packages/examples/src/router/overview-runtypes-example.ts
container/website/sites/runtypes/content/01.introduction/01.about-ts-runtypes.md
container/website/sites/runtypes/public/banners/runtypes-banner.png
container/website/app/components/content/RuntypesPlayground.vue   (optional; used only by
                                                                   app/pages/playground.vue:21,
                                                                   no MDC content churn)
```

Also delete the untracked leftovers `packages/run-types/` and `packages/type-formats/`.

### 9. Phased apply, each with its own gate

`node migration/apply.mjs --phase <name>` migrates one concept at a time so a break is
localised:

| Phase | Concept | Gate |
|---|---|---|
| 1 | `repo-url` (dead `MionKit/ts-run-types`), delete leftovers | `pnpm run lint` |
| 2 | `pkg-dir` (`git mv`) | `pnpm install` resolves |
| 3 | `npm-scope` in package.json + `workspace:*` deps | `pnpm install`, `pnpm run check:builds` |
| 4 | `npm-scope` in TS imports + `cli-bin` | `pnpm run lint` (includes typecheck) |
| 5 | Go literals, `go-module`, `go-dir` | `go -C ts-go-runtypes test ./internal/...` |
| 6 | `regenerate` everything, refresh lock + snapshots | `pnpm test` (or `test:ci`) |
| 7 | `env-var`, `image`, scripts, CI, containers | `pnpm rtx release e2e` |
| 8 | `prose`, website, docs | `pnpm rtx website check`, `pnpm run typecheck` |

Phase 7 is the one that breaks silently: an env var crossing the host to container or host
to CI boundary must be renamed on **both** ends in the same commit (CLAUDE.md rule), and
`scripts/lib/env.mjs` `REGISTRY` plus `.env.sample` must be updated together
(`pnpm run check:env`).

### 10. Correctness mechanics for a one-pass apply

- Edits are **byte-offset based, applied right-to-left per file**, so earlier replacements
  do not shift later offsets. Copy the approach from
  `packages/ts-runtypes-devtools/src/edit-buffer.ts`, but keep a local implementation: the
  tool must not import from the workspace, or deleting it later would not be clean. It is
  ~20 lines for this use (no wire protocol, no Go twin).
- Renames after edits (see 8).
- `apply` refuses to start on a dirty working tree, and commits per phase.

## Tests

### Throwaway: the tool's own tests

`migration/test/*.test.mjs`, run with `node --test migration/test/`. **Not** a vitest
project, so no `vitest.config.ts` entry and no `scripts/core/test-batches.mjs` batch to add
and later remove. Deleted with the rest of the directory.

1. **`kindOf()` determinism** — a fixture corpus of ~30 lines across ts/go/md/json/yaml
   maps to the expected kind. This is the safety property everything else rests on.
2. **`check` blocks** — a table with one empty `t` fails; with an unknown `t` fails; with a
   key present in the tree but missing from the table fails.
3. **Right-to-left offset application** — a line with three tokens rewrites correctly.
4. **Case map** — `ts-runtypes` / `tsRuntypes` / `TsRuntypes` / `TS_RUNTYPES` each land on
   the right target from one rule.
5. **`keep` is honoured** — `getRunTypeId`, `RunType`, `InjectRunTypeId`, `RunTypeKind`
   survive a full apply over a fixture tree byte-identical.
6. **`verify` catches drift** — mutating `n` in a shard makes `verify` fail.
7. **Pattern 2 anchoring** — `sort`, `start`, `part`, `assert`, `convert` produce zero
   matches. This is the false-positive guard for the whole `rt` family.
8. **Pattern 1 separator coverage** — `runtypes`, `run-types`, `run_types`, `run type`,
   `RunType`, `RUN_TYPES` all match; and the expansion pulls `@ts-runtypes/core` in whole
   rather than leaving a bare `runtypes` fragment.

### Permanent: existing tests the rename breaks

These are repo code, not tool code, and must be updated as part of the change:

- `packages/ts-runtypes-devtools/test/repo-contracts.test.ts:44` hardcodes
  `PUBLISHED_PACKAGE_DIRS = ['ts-runtypes', 'ts-runtypes-devtools', 'ts-runtypes-bin']`.
- Go: `internal/testfixtures/realmarker.go`, `realdrizzle.go`, `marker_test.go:36`,
  `cache_location_test.go:15`, `pkgjson_fs_test.go`.

Marker-API coverage rule (CLAUDE.md and [ts-go-runtypes/CLAUDE.md](../../ts-go-runtypes/CLAUDE.md)):
any test touching the marker API needs **both `getRunTypeId` call shapes as paired tests**.
Phase 5's gate must run the full Go suite, not a subset.

## Docs

- Rewrite Decision 1 in
  [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md)
  to record the reversal (per CLAUDE.md, a superseded decision is rewritten, not
  cross-referenced).
- `CLAUDE.md`: the JS monorepo section, package list, and every `@ts-runtypes/*` mention.
- `SETUP.md`, root `README.md`, the three published package READMEs (kept thin, pinned by
  `repo-contracts.test.ts`).
- Both website content trees under `container/website/sites/`. Follow the Website docs
  style rules: **never touch MDC structure**, and verify per-file MDC-component and
  code-fence counts match the pre-edit baseline.
- `scripts/lib/env.mjs` REGISTRY descriptions and `.env.sample` if `env-var` is in scope.

## Out of scope

- **Renaming the public API** (`getRunTypeId`, `InjectRunTypeId`, `RunType`,
  `RunTypeKind`). ~8,000 hits and a breaking change for every consumer. All marked `keep`.
  If wanted, it is its own release.
- **Rebranding "RunTypes" in prose** (495 hits). Rows classified but left `manual` unless
  decision 3 below covers it.
- Deprecating or unpublishing the `@ts-runtypes` scope on npm. Separate release task once
  the new names ship.
- `docs/done/` (103 files, 1,327 occurrences). Historical record, marked `freeze`.

## Decisions still needed before `apply` can run

`scan`, `check`, and the classifier are **name-agnostic** and can be built and run now.
Only `migration/targets.json` needs the answers:

1. **New npm names.** `@mionjs/core` is taken by the framework, so `@ts-runtypes/core`
   cannot become `@mionjs/core`. `@mionjs/run-types` is already live and undeprecated on
   npm and was the master plan's named candidate.
2. **How far past npm:** Go module + `ts-go-runtypes/` dir (internal, ~1,100 hits, zero
   consumer impact); `__runtypes` gen dir (**breaking** for consumers' committed enrichment
   files and `.gitignore`); `RT_*` env vars + `tsrt-*` images (internal); website site id
   and the live runtypes.pages.dev domain.
3. **Brand:** keep "RunTypes" as the feature name in docs, or rebrand too.

## Done when

- `node migration/scan.mjs` produces 9 shards totalling ~1,200 rows.
- `node migration/check.mjs` passes, meaning every row carries a known transform.
- `node migration/apply.mjs` completes all 8 phases, each gate green.
- `node migration/verify.mjs` reports every surviving occurrence maps to `keep`.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm run lint`,
  `pnpm run check-format`, `pnpm run check:env`, `pnpm run check:builds` all pass.
- `pnpm rtx release e2e` passes, proving the renamed packages resolve through verdaccio for
  both families.
- No `@ts-runtypes` string survives outside `docs/done/`.
- **`migration/` is deleted** in the final commit, once every gate above is green and CI
  passes. Nothing outside it was modified to accommodate it, so removal is `rm -rf` and
  leaves no trace.
