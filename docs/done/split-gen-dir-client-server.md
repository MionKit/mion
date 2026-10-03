---
type: chore
spec: guidelines
status: done
created: 2026-10-03
---

# Should the generated cache split into a client and a server half?

## Intent

A fullstack build writes ONE gen dir (`.mion/`) for the whole program, client and server together. Each bundle
stays apart only because the files are split fine enough that a bundler pulls in just what a file imports:

- `types/rt/<hash of the source path>.js`: one runtype data module per source file with reflection sites.
- `types/<fnHash>_<typeId>.js`: one module per compiled function (default `moduleMode`).
- `types/pf/`, `rpc/`, `api/`: pure fns, the batch table and mappers, the bundled client routes and manifests.

Because of that, the mion presets refuse `moduleMode: 'allSingle'` (`toRunTypesOptions` in
`packages/devtools/src/options.ts`) and MET014 warns when a fullstack tsconfig sets it: one module per family
for the whole program would put every server type in the client bundle.

`allSingle` may be cheaper (fewer files to write, resolve and bundle, less work per module), and a client that uses
runtypes heavily might be better off with its own cache, shaped for it, than with a slice of a shared one. Nobody
has measured either. Investigate and pick the architecture.

## Measurements

Three modes, measured on this branch's resolver. "Sample app" is a generated fullstack Vite app (one config, two
bundles): 40 shared models, 120 routes over 20 files, a client of 15 form files (heavy) or none (light). Models
link to each other (`parent?: ModelN-1`) unless marked flat. Times are medians of 5 or more runs.

| Sample app, linked models | default (today) | allSingle | allModules |
| --- | --- | --- | --- |
| Two-bundle `vite build` | 2.35 s | 1.58 s | 2.66 s |
| `mion compile` alone | 1.40 s | 0.99 s | 2.44 s |
| Generated files / bytes | 1,138 / 1.10 MB | 14 / 0.69 MB | 2,566 / 1.09 MB |
| Server bundle, min / gzip | 833 KB / 176 KB | 529 KB / 81 KB | 653 KB / 110 KB |
| Heavy client, min / gzip | 207 KB / 30.3 KB | 259 KB / 48.3 KB, 20 server-only fields | 209 KB / 30.7 KB |
| Light client, min / gzip | 44.6 KB / 14.9 KB | same | same |
| Generated modules loaded, client / server | 374 / 936 | 21 / 8 | 546 / 2,295 |

- Where the default time goes: the bundle phase of each side (client 440 ms against 380, server 590 ms against
  300) and the resolver writing 1,100 files (about 1 ms each on this sandbox's disk). A profile taken later showed
  the copied rows cost the resolver almost nothing; linked models build slower than flat ones because their
  compiled functions are bigger.
- Copied rows: the generated tree writes 8,780 type rows for 1,428 distinct ones. The server bundle carries
  230 KB of copies, the heavy client 1.6 KB.
- Flat models: server bundle 558 KB / 86 KB against allSingle's 481 KB / 76 KB, build 1.6 s against 1.4 s,
  `mion compile` 1.12 s against 0.86 s, 57 KB of copied rows in the server bundle.
- private-test-server (server only, `vite build` of its two entries): 1.71 s / 1.25 s / 2.33 s, output
  398 / 424 / 649 KB, 805 / 20 / 2,154 generated files. `mion compile` alone is the same in all three (1.4 s).
- Pre-publish consumer (`mion compile`): 732 / 700 / 892 ms, generated 167 / 147 / 255 KB.
- `container/benchmarks/compiletime` was not run: its probe is ONE source file, so it has one `rt/` module and
  no copied rows; only the fn module count differs, which the rows above already measure.

What the numbers say:

- `allSingle` is less work: 25 to 35% faster builds on an app with many routes, nothing on a small one.
- That win is almost all on the server. A light client is byte for byte the same in every mode, and a heavy
  client's copied rows are 1.6 KB. A client of its own would not get smaller.
- The server cost comes from two places: rows copied into every file module that reaches a shared type (up to
  6 times on linked models), and one module per compiled function (936 modules on the server side).

## Options

- **One gen dir per side, `allSingle` on each.** Rejected. The resolver would have to know which files each side
  reaches BEFORE the bundler loads the module, because Rollup loads it while the other files are still
  untransformed. That means predicting the bundler's import graph from the TypeScript program: aliases, `.vue`
  files, dynamic imports and Next's `'use client'` trees all differ. A file it misses crashes at runtime, a file
  it adds leaks server types. Today the bundler answers that question itself, so the split is correct by
  construction. In dev, a family module changes on every type edit and reloads every importer, where today's
  modules are content-addressed and never change. `mion compile` has no sides at all.
- **Per-environment generation.** Rejected for the same reason: the module must be complete before the
  environment has transformed its files. The Turbopack loader cannot even tell which compilation it runs in
  (`this._compiler` is not there).
- **One module per named type.** Rejected. Simulated on the real generated output, it still copies the small
  rows many named types share (a `string`, a `tags: string[]` property), where grouping by file set writes each
  row once (rows written / modules, before the copy rule below):

  | | today | named-type modules | file sets |
  | --- | --- | --- | --- |
  | Sample app | 8,780 / 36 | 2,764 / 144 | 1,428 / 85 |
  | private-test-server | 1,632 / 7 | 1,643 / 103 | 1,336 / 16 |
  | Pre-publish consumer | 620 / 4 | 552 / 43 | 425 / 9 |
- **Keep one gen dir, stop copying rows, grouped by file set.** Chosen. It removes the largest measured cost
  without any side rule.
- **Keep today's layout unchanged.** Rejected: the server bundle is up to 57% bigger than it needs to be.

## Decision

Keep one gen dir and the fine-grained files. `allSingle` stays refused by the presets, with the same reason
(measured: 20 server-only fields and +60% gzip in the heavy client).

Change one thing: a type row is written once. Its home is decided by the exact set of files whose reflection
closure reaches it. A row one file reaches stays in that file's `rt/<path hash>.js`. Rows the same 2+ files reach
share one module, `rt/shared/<hash of their ids>.js`, which those files import. Type ids do not change.

- No leak: every row of a shared module is in the closure of every file that imports it.
- No copies: each row is written once, except a group too small to pay for a module (see What Shipped).
- No import cycles: a row's file set contains its parent's, so a shared module imports only larger sets.
- One module per compiled function stays: grouping those safely needs the side rule rejected above.

Rows written / modules under `rt/`, with the shipped planner (tiny groups copied):

| | today | shipped |
| --- | --- | --- |
| Sample app | 8,780 / 36 | 1,634 / 82 |
| private-test-server | 1,632 / 7 | 1,378 / 12 |
| Pre-publish consumer | 620 / 4 | 443 / 6 |

## Result

The same machine, the same apps, `main`'s resolver against this branch's, medians of 6 to 10 alternated runs.
Build times on this sandbox move about 5% between runs, so a smaller difference is noise.

| | before | after |
| --- | --- | --- |
| Sample app, linked: server bundle min / gzip | 833 KB / 176 KB | 536 KB / 81 KB |
| Sample app, linked: heavy client gzip | 30.4 KB | 30.2 KB |
| Sample app, linked: generated bytes / files | 1.10 MB / 1,138 | 0.81 MB / 1,184 |
| Sample app, linked: two-bundle `vite build` | 2.70 s | 2.47 s |
| Sample app, linked: `mion compile` | 1.15 s | 1.17 s |
| Sample app, flat: server bundle min / gzip | 558 KB / 86 KB | 488 KB / 75 KB |
| Sample app, flat: two-bundle `vite build` | 1.88 s | 1.97 s |
| private-test-server: `vite build` | 1.33 to 1.50 s | 1.34 to 1.48 s |
| private-test-server: output min / gzip | 394 KB / 58.4 KB | 396 KB / 58.7 KB |
| Pre-publish consumer: `mion compile`, generated bytes | 720 ms, 167 KB | 694 ms, 160 KB |

- The server bundle now matches `allSingle` (81 KB gzip) without its leak; the client is unchanged or smaller.
- Build time is unchanged within noise.
- Dev server: an edit runs a file scan without modules, then the same whole-program generate a build runs, so
  each edit costs what the `mion compile` row shows, unchanged. The Next broker stamp hashes every module under
  `types/rt/`, now 82 instead of 36 on the sample app, re-reading only files whose size or time moved. A file
  module now changes only when its own rows or imports change; a shared module changes with its rows. private-test-server is a library build that keeps every module as its own
  output file, so each shared module there adds a little wrapper; it ends 0.4% bigger.

## What Shipped

- A group too small to pay for a module (its rows times the extra copies cost fewer bytes than a module wrapper
  plus one import line per file) is copied into each module using it instead. Without it, private-test-server got
  four one-row shared modules imported by 5 to 11 files each, and a slower build.
- A data tuple's key hashes the shared modules it imports as well as its rows: the runtime skips a key it has
  seen, so two files owning no rows of their own must still differ. (Found by the drizzle example app's tests.)
- Each module imports only the shared modules its own rows point into, and the planner's closures are reused, so
  a whole build costs the resolver no more than before (`mion compile` in Result). A one-file scan that returns
  modules now plans over the whole program; only test and fuzz harnesses send that request, the plugins never do.
- `ts-go-runtypes/internal/cachegen/runtype/entries.go`: `PlanRowHomes` plans each row's home over the whole
  program; `CollectEntries` writes each file's own rows, plus one data entry per shared module it reaches, whose
  binding is `rts_<hash>` so it never collides with `__rt_runtypes` or a facade. A row in another module rides
  the `rels` array as its id, which the runtime already resolved after registering the whole closure. A row
  carries its root size limit when it is a root anywhere in the program, since it is written once.
- `ts-go-runtypes/internal/compiler/resolver/dispatch.go`: a one-file scan that returns modules plans the homes
  over the whole program first, so its modules match the whole-program ones byte for byte. A diagnostics-only
  scan (lint) plans locally and never pays the whole-program scan.
- `allSingle` and file-less sites have one owner and import nothing, so their output, tuple keys included, is
  unchanged.
- Runtime, Next broker stamp (it hashes everything under `types/rt/`), the elision oracle (`rt/` prefix),
  `test-skip`, `api-check`, `mion-pure-fns/` and `mion compile`: no change needed.
- Tests: Go (`module_test.go`: written once, no leak through imports, nested shared sets with direct imports
  only, size limit from the whole program, tiny groups copied, copies through copies, key over imports,
  deterministic; `perfile_modules_test.go`: a type client and server share, both `getRunTypeId` shapes, every
  `rt/` module of a scan equals the dump's), runtime (`entryTupleModules.test.ts`: a relation to an imported
  module's row by id), devtools (`module-mode.test.ts`: the same scan-equals-dump check through the plugin's
  client; `viteEnvironments.spec.ts`: a type two server files reach is written once in the server bundle, and
  both shapes give it one id).
- Found on the way: `mion compile --pprof-cpu` wrote an empty profile whenever the compile exited with an error,
  because exiting skipped the deferred flush. Fixed in `cmd/mion/main.go`, with a test that runs a real child process.

## Docs

The `moduleMode` row on `container/website/content/02.runtypes/01.introduction/04.configuration.md` now says a
type several files use is written once in a shared module. The "One Config, Two Bundles" section on
`container/website/content/01.rpc/07.devtools/02.vite.md` stays true as written.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The write-up of the options with measured numbers is in this spec (done above).
- Rows are written once: built, the bundle-split tests still pass, `allSingle` is still refused with the reason
  restated, and the re-measured numbers are in Result (done above).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan (approved 2026-10-03)

Group each runtype row by the exact set of files reaching it: one file keeps it, the same 2+ files share an
`rt/shared/<hash>` module. Plan the homes over the whole program (a one-file scan included), keep type ids,
the runtime and every other generated module as they are. Tests in Go (collector and resolver), the runtime and
the Vite two-bundle build; the `moduleMode` row on the configuration page; re-measure and record the result here.
The copy rule for tiny groups and the import-aware tuple key were added during the build (see What Shipped).
