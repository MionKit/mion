---
type: chore
spec: guidelines
status: ready
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
  300) and the resolver writing copied rows and 1,100 files (about 400 ms).
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
- **Keep one gen dir, stop copying rows.** Chosen. It removes the largest measured cost without any side rule.
- **Keep today's layout unchanged.** Rejected: the server bundle is up to 57% bigger than it needs to be.

## Decision

Keep one gen dir and the fine-grained files. `allSingle` stays refused by the presets, with the same reason
(measured: 20 server-only fields and +60% gzip in the heavy client).

Change one thing: a reflected named type's rows (the type plus its unnamed children) move to ONE shared module,
`rt/<typeId>.js`, content-addressed like the fn modules. A file's `rt/<path hash>.js` keeps its facades and the
unnamed rows only it needs, and imports the named-type modules it reaches. This is the same rule `inlineMode:
'default'` already uses for fn entries (named types stay shared).

- No leak: a file still imports only the types it reaches.
- No copies: each named type is written once.
- Expected: server bundle and resolver time close to `allSingle` on the row part. The module count grows by the
  reflected named types (about 130 on the sample app), so bundle time stays near today's. One module per
  compiled function stays: grouping those safely needs the same side rule rejected above.
- Dev: editing a type now changes only that type's module and its importers, instead of every file module whose
  closure reached it.

## Plan

1. `internal/cachegen/runtype/entries.go`: group closure rows by their nearest named type; emit one data entry
   per named type (module `rt/<typeId>`), and per file only its facades plus its unnamed rows. Rows refer to rows
   in another module by id, as `allModules` already does across its per-node modules; the data entry declares
   the named-type entries it needs as deps so the import order loads them first.
2. Runtime (`packages/run-types`): resolve a cross-module relation by id from the registry when it is not an
   index into the module's own rows.
3. Keep the names apart: path hashes are 10 characters and type ids 7, so `rt/` holds both without collisions.
4. `test-skip`: a file's key covers its own `rt/` module AND the named-type modules it imports.
5. Next broker stamp: still hashes every module under `types/rt/`, so the new modules are covered; add a test.
6. Tests: a Go test that each named type's rows are written once across file modules; the existing
   `viteEnvironments.spec.ts` bundle-split tests keep passing; a vitest run of the sample shape asserting the
   server bundle holds each row once.
7. Measure again with the sample app and private-test-server and record the numbers here.

`api-check`, the pure-fn artifact (`mion-pure-fns/`) and `mion compile` need no change: they never read `rt/`
by layout, and `mion compile` writes plain modules that import each other the same way.

## Docs

The `moduleMode` row on `container/website/content/02.runtypes/01.introduction/04.configuration.md` says
`default` gives each source file its own module: add that a type two files share is written once. The "One
Config, Two Bundles" section on `container/website/content/01.rpc/07.devtools/02.vite.md` stays true as written.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The write-up of the options with measured numbers is in this spec (done above).
- Named-type rows are written once: the Plan is built, the bundle-split tests still pass, `allSingle` is still
  refused with the reason restated, and the re-measured numbers are recorded here.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
