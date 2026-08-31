---
type: chore
spec: full-plan
status: in-progress
created: 2026-08-31
---

# Rename the ts-runtypes packages back into the mion namespace

## Problem

The `ts-runtypes` name collides with the well-known `runtypes` library and has drawn bad
feedback. The standalone-library bet is being dropped: the value is in a fully integrated,
AI-ready mion, not in a separate type library competing on its own. The packages come home
to the `@mionjs/*` namespace and the `@ts-runtypes` npm scope is retired.

This **reverses Decision 1** of
[merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md)
("keep `@ts-runtypes/*`"). That was the right call at the time; it is not any more, and
that decision is superseded rather than cross-referenced.

A blind find-and-replace is not viable. Measured across tracked files:

| | |
|---|---|
| Occurrences of a runtypes-ish token | 25,637 |
| **`RunType` the domain concept** (`getRunTypeId`, `RunTypeKind`, `InjectRunTypeId`) | ~9,100, **public API, must never change** |

`getRunTypeId` alone is 2,797 hits. So the work runs through a tool that classifies every
occurrence and records an explicit decision before anything moves.

## The name map

`@ts-runtypes/core` cannot become `@mionjs/core`: the mion framework already owns that
name, and `@mionjs/devtools` is likewise taken. So this is a **per-package map, not a scope
swap**. It lives in `migration/targets.json`, which is the only file holding a naming
decision.

| from | to | phase |
|---|---|---|
| `@ts-runtypes/core` | `@mionjs/run-types` | **1** |
| `@ts-runtypes/devtools` | folded into `@mionjs/devtools` as subpaths | 4 |
| `@ts-runtypes/bin` | decided with devtools | 4 |
| `@ts-runtypes/binary-<os>-<arch>` | decided with devtools | 4 |
| `@ts-runtypes/go-be-sidecar` | private, never published | 4 |

`@mionjs/run-types` already exists on npm at 0.8.10 and is undeprecated, so there is no new
name to claim and the repo's 0.12.2 cleanly supersedes it. (`@mionjs/runtypes` without the
dash does **not** exist: `npm view` returns 404.)

devtools and bin deliberately do **not** move in phase 1. They are being folded into
`@mionjs/devtools` as subpaths later, so renaming them now would rename them twice.

## The phases

Each phase is committed before the next one starts, so any phase can be reverted and its
diff read on its own.

| # | what | gate | status |
|---|---|---|---|
| 1 | package name + every import specifier: `@ts-runtypes/core` → `@mionjs/run-types` | `pnpm install`, `pnpm run lint`, `pnpm test`, `go test ./internal/...` | ready |
| 2 | directories: `packages/ts-runtypes*` → `packages/run-types*` | `pnpm install`, `pnpm test` | open |
| 3 | prose: `ts-runtypes` → `mion run-types`; the `RunTypes` brand | `pnpm rtx website check` | needs a brand decision |
| 4 | fold `@ts-runtypes/devtools` (12 export subpaths) + `bin` into `@mionjs/devtools` | `pnpm rtx release e2e` | open, behavioural |
| 5 | `RT_*` env vars, `tsrt-*` images, `__runtypes` gen dir, runtypes.pages.dev | per-item | optional, blocks nothing |

Phase 1 has **zero undecided rows**. Every open decision lives in phase 3 and later.

Phase 5 is last on purpose: renaming `__runtypes` is **breaking** for consumers' committed
enrichment files and `.gitignore`, and moving the domain moves a live URL. Neither blocks
anything else.

## The tool: `migration/`

Single-use, deleted once the rename lands. Kept out of `scripts/`, out of `rtx`, and out of
the vitest projects so removal is one `rm -rf migration/` with nothing left dangling. Zero
dependencies, node built-ins only.

```bash
node migration/scan.mjs --report        # coverage + the top unclaimed tokens
node migration/scan.mjs                 # write the shards
node migration/check.mjs                # the gate
node migration/apply.mjs --dry --phase npm-scope
node migration/apply.mjs --phase npm-scope
node --test migration/test/*.test.mjs
```

### Rules do the marking

`lib/rules.mjs` is an ordered list of named, precise matchers; first match wins. Each
claims a whole family, so nobody walks 25,637 occurrences by hand. Only what no rule claims
is left for a person.

**Currently 85.7% of rows auto-marked** (3,660 of 4,269). The residue is genuinely
ambiguous: bare `runtypes`, bare `runtype`, `RunTypes` as brand prose, and a handful of
relative paths. Most of it needs a phase 3 decision before anyone could mark it anyway.

Every rule ships with a test asserting the exact set it claims **and** the near-misses it
must reject, so a rule cannot quietly widen later.

### The discriminator the whole thing rests on

```
capital T   -> always the CONCEPT   RunType, getRunTypeId, RunTypeKind    ~9,100 sites
lowercase t -> always the PACKAGE   tsRuntypesPlugin, RuntypesPlayground    ~110 sites
```

Verified against the whole tree. `keep:concept` claims the first, `pkg-ident` the second.
A capital-T `RunTypes` in **prose** is the brand rather than the concept, so `md-prose` is
excluded and falls through to a phase 3 decision.

### Row keys are shard-scoped

`token@kind@area`, one shard per package area. Scoping by area is what lets several people
mark different shards in parallel without contending over a decision, and lets the same
spelling be marked differently in the Go tree than on the website.

Shards hold **decisions, never sites**: `apply` re-derives every occurrence's key from the
tree with the same classifier `scan` used and looks the decision up. That is what keeps
eight files at ~60 KB instead of megabytes of file paths. `check` re-derives every key and
hard-fails on any the shards do not carry, so a classifier change surfaces as a failure
rather than a silent mis-apply.

## Container images: rebuild ONCE, at the end

All six images are **deps-only**. They bake third-party toolchains (vite, typescript,
unplugin, next, postgres) and take the first-party packages at run time, either
bind-mounted from the workspace or installed from verdaccio. So renaming a package
changes nothing baked, and no phase gate needs a fresh image: the website check mounts the
content tree, and the bench lanes mount the workspace.

Two baked things do change, in different phases, which is why the rebuild is batched
rather than done per phase:

| image | what changes | phase |
|---|---|---|
| `tsrt-e2e` | `_deps/pnpm-workspace.yaml` must exempt `@mionjs/*` from `minimumReleaseAge` | 1 (done) |
| `tsrt-website` | `container/benchmarks/competitors/ts-runtypes/`, baked by PATH at Containerfile:132-135 | 3 |

The e2e exemption is load-bearing: the run publishes the packages under test to verdaccio
seconds before installing them, so they are always younger than the 30-day cutoff. Without
the exemption `@mionjs/run-types` is refused on resolve and `pnpm rtx release e2e` fails.

The benchmark competitor directory is **not** a phase 2 rename. `ts-runtypes` is the
competitor LABEL, used as a data key in `scripts/website/bench-data/gen-docs.mjs` and
shown in the published tables next to zod / typebox / ajv, so renaming it is a branding
call and belongs with phase 3.

**Before the release gate:**

```bash
pnpm rtx container push e2e
pnpm rtx container push website   # only if phase 3 renames the competitor dir
```

## Load-bearing literals

Compared against at runtime, so they fail silently if missed. All confirmed covered by the
phase 1 dry run:

```ts
// packages/ts-runtypes-devtools/src/unplugin.ts
const MARKER_MODULE = '@ts-runtypes/core';
```

```go
// ts-go-runtypes/internal/enrichment/mirror/index.go:396
case specifier == "@ts-runtypes/core" && isTypeOnly:
```

Plus `internal/testfixtures/realmarker.go`, `realdrizzle.go`, `mirror/drift.go`, and
`repo-contracts.test.ts:44` (`PUBLISHED_PACKAGE_DIRS`).

`ts-go-runtypes/internal/compiler/resolver/resolver.go:405` holds the cache directory name
as a bare `"ts-runtypes"` string. It is **phase 2**, not phase 1, and is harmless in the
meantime (it only names a cache dir).

**Confirmed safe:** the package name is *not* folded into the typeID hash (only
`constants.Version` is), so the rename invalidates no cache format.

## Regenerate, never rewrite

Marked `regenerate`; `apply` skips them and the phase re-runs the generator:
`pnpm-lock.yaml`, `src/go-generated/*`, `ts-go-runtypes/**/testdata/`, `__snapshots__/`,
the drizzle manifests and the generated import map.

## Tests

**The tool's own** (`node --test migration/test/*.test.mjs`, 49 passing). Not a vitest
project, so there is no `vitest.config.ts` entry or test-batch to add and later remove:

- one exactness test per rule, claims and rejects
- the public API survives every phase **byte-identical** (the headline property)
- the `rt$*` / `rt::` / `__rt*` / `rtx` families survive byte-identical
- the package map: subpaths preserved, null means out-of-phase, an unmapped package throws
- **prefix safety**: `@ts-runtypes/bin` must not match inside `@ts-runtypes/binary-linux-x64`
- right-to-left splicing; longer and shorter replacements do not shift later edits
- overlapping edits throw
- shard write/read round-trip

**Repo tests the rename breaks**, updated in the phase that breaks them:

- `packages/ts-runtypes-devtools/test/repo-contracts.test.ts:44` (`PUBLISHED_PACKAGE_DIRS`)
- Go: `testfixtures/realmarker.go`, `realdrizzle.go`, `marker_test.go`,
  `cache_location_test.go`, `pkgjson_fs_test.go`

Marker-API coverage rule (CLAUDE.md): any test touching the marker API needs **both
`getRunTypeId` call shapes as paired tests**, so each phase's Go gate runs the full suite.

## Docs

- Rewrite Decision 1 in the master plan to record the reversal.
- `CLAUDE.md`, `SETUP.md`, root `README.md`, the published package READMEs (kept thin,
  pinned by `repo-contracts.test.ts`).
- Both website content trees in phase 3. Follow the Website docs style rules: **never touch
  MDC structure**, and verify per-file MDC-component and code-fence counts against the
  pre-edit baseline.

## Out of scope

- **Renaming the public API** (`getRunTypeId`, `InjectRunTypeId`, `RunType`, `RunTypeKind`).
  ~9,100 hits and breaking for every consumer. All marked `keep`. Its own release if ever.
- **`rt$*` enrichment keys and `rt::` namespaces.** `rt$*` is a public data format
  (consumers commit enrichment files keyed by it) and `rt::` is in the cache wire format.
  Both marked `keep` deliberately.
- Deprecating the `@ts-runtypes` scope on npm: a release task once every package has moved.
- `docs/done/` (103 files, 1,558 occurrences). Historical record, marked `freeze`.

## Done when

- Every phase applied, each committed separately, each gate green.
- `node migration/check.mjs` passes: every row carries a known transform.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm run lint`,
  `pnpm run check-format`, `pnpm run check:env`, `pnpm run check:builds` all pass.
- `pnpm rtx release e2e` passes, proving the renamed packages resolve through verdaccio.
- No `@ts-runtypes` string survives outside `docs/done/`.
- **`migration/` deleted** in the final commit.

## Progress

- **Phase 1: ready, not yet applied.** Dry run: 2,084 sites in 677 files; 585 sites out of
  phase (devtools/bin/binary/sidecar, all untouched); 0 rewrites of `getRunTypeId` or
  `RunType`.
- Phases 2 to 5: open.
