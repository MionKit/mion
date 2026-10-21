---
type: feature
spec: guidelines
status: done
created: 2026-09-17
---

# Serve a package's pure functions to its consumers on demand

## Intent

Only run-types' own pure fns reached a consumer whose program sees just a `.d.ts`: their bodies
were served on demand by a step of their own (`serveBuiltinPureFns`), first from a table compiled
into the binary, then extracted from the package's installed sources.

A third-party library got no such lane. The consumer's compiler could not extract from
`node_modules`, so the library shipped the full body in its compiled JS, registered it at load,
and a consumer pure fn that referenced it got a soft dep the graph stubbed out, resolved at
runtime only if the library module loaded first. No build-time guarantee, and mion's own packages
were in the same position as any other library.

One mechanism for any package, with nothing to configure and nothing new in the tarball.

## What shipped

One lane, `internal/cachegen/purefnindex/`, serving every installed package's pure fns, run-types
included. `serveBuiltinPureFns` and the `builtinpurefns` package are gone; `servePackagePureFns`
in `internal/compiler/resolver/dispatch.go` is the one serve step, after `Cascade` and before
`AddMissingStubs`. No option, no artifact, no docs.

- **Built files first.** Every mion build already writes each pure fn as an entry tuple
  (`[2, deps, , id, paramNames, code, deps]`) and rewrites its registration to
  `registerPureFn(<tuple>, '<id>')`; both survive bundling and minification because the consumer's
  compiler keys on literal shape, never on an identifier name. The index reads a package root
  through the program FS (so `mion compile`, every bundler adapter and an overlay-only package
  behave the same), skipping `node_modules` and hidden dirs (a consumer's `.mion` holds served
  COPIES of other packages' rows, never the package's own).
- **Sources second.** When no built file carries a tuple, the rows are extracted from the
  package's TypeScript with the extractor a build runs, projected to what a served body needs (no
  rewrite positions). The marker package is what lives here today: its dist is hollowed and its
  tarball ships `src`; its registration files are the generated `purefnids.SourceFiles`, any other
  package's are scanned for a registrar call. Extraction reuses the SESSION's checker and memo
  whenever the program already holds the files (in-repo, the `source` condition), so the ids
  cannot disagree with the program's own; only a package the program does not hold pays for a
  side program.
- **An id is matched, never decoded.** It is the package plus a hash of the body that ships and
  says nothing about where that body lives. An untyped `.d.ts` binding (`PureFnId<string>`, what a
  declaration emitter writes when the id was injected by the build) resolves through the index
  (`marker.Options.PureFnBindings`, the fifth arm of `resolveDepArg`): the sibling built file's
  export map first, then the one binding of that name anywhere in the package (a built file's
  registration, or an extracted row's `BindingName`). A `.d.ts` carrying the literal keeps the
  existing arm.
- **A dep resolves from the package that names it.** Every soft dep no entry answers is resolved
  to its package by a node_modules walk from the consumer's cwd (realpath'd, so a workspace
  symlink lands where the program's files live; a package no node_modules holds but the program
  reaches is found by its files); the row and its transitive closure are merged through
  `purefunctions.CollectEntries` in the CONSUMER's emit mode and layout, and each dep of a served
  row resolves from THAT row's package root, so a nested install lands on the copy the library
  was built against.
- **Every edge is reported.** A located package with rows but not this id is `PFE9012`; a
  built-in that no marker package in the program can answer, or marker sources that cannot be
  read or type checked, is `CFG004` (a broken install, never a runtime "Pure function not
  found"); a located package with nothing to serve at all is the runtime-only lane, reported once
  per id as the new warning `PFE9016`, naming the id and the package; the dep stubs out as before
  and works when the consumer loads that package's module for its side effect. The sink-based
  `ValidatePureFnDependencies` exempts an id an installed package owns, because serving validates
  it.
- **A missing stub keyed by a pure-fn id** takes the pure-fn module layout
  (`entrymodules.ModuleName`): the raw id holds a `#`, which a module URL reads as a fragment, so
  the runtime-only lane used to emit an import that could never resolve.
- **`cmd/gen-builtin-purefns`** runs the index's own scan and extraction, so the id constants and
  the served bodies cannot come from different files. Regenerating gives byte-identical ids.

## What did not ship, and why

- **run-types is not read from its built files yet.** Its dist is built by plain tsc and hollowed,
  so it holds nothing to read, and the compiler falls through to `src` for it. The lane is ready:
  the day its dist carries tuples, the index reads them and never opens `src`. Building run-types
  with the mion compiler, and dropping `src` from its tarball, is its own spec.
- **No hollow lane for third parties, no `"mion"` package.json field, no library mode, no
  `mion pure-fns` verb.** Decided with the author: the feature is internal and transparent, and
  a library built by anything but the Go compiler is not a supported case.

## Done when

- A fixture library under `node_modules` holding built JS and a `.d.ts`, consumed by a fixture
  app: the app's pure fn imports the library's id and the emitted module carries the body read
  from the built file, proven through both the plugin and `mion compile`, without mion's own
  built-ins. Shipped: `packages/run-types/test/third_party/package-pure-fns-e2e.test.ts`
  (`@acme/text`, built for real with esbuild + the runtypes adapter).
- Transitive closure across packages (app → `@acme/dates` → `@acme/text`), with the middle
  package served from its `src/` and resolving its dep from its own nested `node_modules`.
  Shipped, in the same e2e and in `purefnindex_test.go`.
- A package built without mion still works at runtime as today, and the build says so.
  Shipped: `@acme/legacy` in the e2e, `PFE9016` on both lanes.
- run-types' built-ins ride the same lane. Shipped: served by `servePackagePureFns` from the
  index, the built-in delivery tests unchanged in what they assert.

## Plan (approved 2026-09-18)

Decisions taken with the author before building:

- No new artifact, no plugin or CLI option, no website docs. The library's BUILT JavaScript already
  carries everything: each pure fn's entry tuple and the registration call that binds an exported
  name to its id. The consumer's Go compiler reads those built files from `node_modules` through
  the program FS.
- Every library is built by the Go compiler (a bundler plugin or `mion compile`); a tsc-only
  library is not a supported case. A package found in `node_modules` that ships no compiled pure
  fns is a reported soft dep (a warning), never silent.
- Prefer a package's built files; when they carry nothing and sources are available, extract from
  source (added mid-task, with one e2e package on each lane).
- No hollow lane for third parties: the body ships in the library JS and is served again into the
  consumer's own module.
- After the id became `<package>#<hash>` and run-types' bodies moved out of the binary, the branch
  was rebased and run-types joined the lane in the same change: getting run-types OFF its `src`
  (building it with the mion compiler) stays a separate spec.

Steps:

1. `internal/cachegen/purefnindex/`: per-Program store bound to the session's program and
   resolver; scans a package root's `.js/.mjs/.cjs` files (skipping `node_modules` and hidden
   dirs) with the tsgo parser, collecting tuple rows and the names bound to a registration; falls
   back to extracting the package's sources (the generated list for the marker package, a scan
   for any other); resolves a dep's package from the DEPENDENT package's root; `BindingID` maps a
   `.d.ts` binding to its id; `Closure` across packages.
2. `servePackagePureFns` in `dispatch.go`, the one serve step; PFE9012 for a row a built package
   lacks, CFG004 for an unreadable marker package, PFE9016 (warning) for a package with nothing
   to serve.
3. Dep walker: a fifth arm resolving an untyped `.d.ts` binding through the index;
   `ValidatePureFnDependencies` exempts library ids (serving validates them).
4. Tests: Go unit tests per package (the former loader's tests over the real marker package
   included), resolver serving + delivery tests, and one JS e2e with three libraries (plugin-built,
   source-shipped, unbuilt) and two consumers (plugin and `mion compile`).
