---
type: feature
spec: full-plan
status: done
created: 2026-09-19
---

# Ship each package's pure functions as one build artifact the consumer's compiler reads

## Problem

A consumer's compiler serves an installed package's pure functions on demand through
`ts-go-runtypes/internal/cachegen/purefnindex/`. It finds them by walking every `.js` file under
the package root, keeping the files that contain `<package>#pf_`, and parsing each one with the
TypeScript parser to pick entry tuples and `registerPureFn(<tuple>, '<id>')` calls out of the AST
(`Package()` at `purefnindex.go:152-208`, `scanFile` at `:591-674`, `tupleEntry` at `:730-769`,
`registrationID` at `:681-695`).

That reads the wrong thing. A bundle is whatever the library's bundler produced: minified,
chunked, tree-shaken, in the library's own emit mode. Three consequences:

- **Cost is the bundle's size, not the pure fns'.** A large single-file bundle that carries one
  pure fn is parsed in full, with an AST several times the file size in memory.
- **Coverage is the bundler's choice.** A registration the entry never reaches (unused, or
  dropped under `sideEffects: false`) is not in the bundle, yet its `.d.ts` binding still exists
  and a consumer can import it. The whole-program generate step extracted it; the bundle lost it.
- **The tuple layout is a compiler wire shape**, and reading it back from `functions` emit mode
  means slicing function bodies out of source text (`purefnindex.go:753-759`).

The generated `pf` cache modules cannot be the artifact either: they live under the gen dir
(`<genDir>/types/pf/...`), never in the output dir, and every bundler inlines them into the
bundle through the injected `rtmod:/pf/...` import. Only `mion compile` keeps them as files, and
still under the gen dir. Nothing guarantees they exist as independent files after a build, and a
consumer never imports them anyway (served rows are re-rendered in the CONSUMER's emit mode and
module layout, `package_purefns.go:59-60`).

So: every mion build writes one small JSON file holding the package's own pure functions and
nothing else, into the bundler's output directory, and the consumer's compiler reads only that
file. The parse is bounded by the pure functions a package ships, never by its bundle, and the
bundle is never opened.

## Decisions

- **One file, fixed name, JSON: `mion-pure-fns.json`.** JSON because the consumer never imports
  it (build-time input only), Go reads it with `encoding/json` and no parser, and the tuple layout
  stays internal. Not a JS module, not a directory of modules. The name is one Go constant
  (`PureFnArtifactFileName` in `ts-go-runtypes/internal/constants/constants.go`, beside
  `PureFnHashPrefix` at `:459-466`) mirrored to TS as `PURE_FN_ARTIFACT_FILE` through
  `cmd/gen-ts-constants` (`buildVitePluginConstants`, `main.go:68+`; regenerate with
  `pnpm miondevx core codegen constants`).
- **Shape** (sorted by id, two-space indent, trailing newline, so it is byte-stable):

  ```json
  {
    "format": 1,
    "package": "@acme/text",
    "pureFns": [
      {
        "id": "@acme/text#pf_9Zt1bRm4cVaPqL",
        "bindingName": "slugify",
        "file": "src/slug.ts",
        "paramNames": ["utl"],
        "code": "return (s) => s.trim().toLowerCase();",
        "pureFnDependencies": []
      }
    ]
  }
  ```

  `id` is the library's id verbatim and is never recomputed by a consumer. `file` is the source
  path relative to the package root, for diagnostics and as the binding-name tiebreaker below.
  `paramNames` and `code` are exactly `purefunctions.Entry.ParamNames` / `.Code`, the factory
  the runtime rebuilds with `buildPureFnFactoryFromCode`
  (`packages/run-types/src/runtypes/rtUtils.ts:295-298`), so `functions`-mode libraries and
  `code`-mode libraries write the same artifact.
- **Go renders it once; whoever owns an output dir writes it there.** The generate op already
  produces every row (`extractProgramPureFns`, `resolver/render.go:260-281`). It renders the
  artifact, writes its canonical copy to `<genDir>/types/mion-pure-fns.json` (next to
  `pure-fns-report.json`, `generate.go:53,232-239`, exempt from the stale-file GC the same way,
  `:447`), and returns the content on the generate Response. Go cannot write into the bundler's
  output dir itself: generate runs at `buildStart`, before vite empties `outDir`.
- **Which rows.** Only the building package's own registrations: entries whose id package half
  (`purefunctions.SplitID`) equals the package that owns the program's cwd
  (`marker.PackageOfFile`). A workspace sibling reached through the `source` condition is
  extracted too but belongs to its own artifact. Override entries (`sess.overrideEntries`) never
  go in. The `purefnids.Has` exclusion (`render.go:300`) stays for every package except the marker
  package itself, so run-types gets its own artifact the day it builds with the compiler.
- **Zero rows means no file.** An app with no pure fns gets nothing in its dist. The writer
  removes a stale `mion-pure-fns.json` when the content is empty (write-on-change, like
  `writeJSONReport`, `generate.go:248`).
- **The consumer reads the artifact or the sources, never the bundle.** The index walks the
  package root for files named `mion-pure-fns.json` (directory listings only, skipping
  `node_modules` and hidden dirs exactly as `filesUnder` does today, `purefnindex.go:224-253`),
  decodes each, and merges them. A package with no artifact and no sources is the runtime-only
  lane (`PFE9016`), exactly as a package with no tuples is today. No error for "bundled without
  an artifact": the compiler never inspects the bundle, so bundled is not a state it can see, and
  a plain-tsc library with hand-written ids does work at runtime.
- **Duplicates.** ESM and CJS builds both write one, so identical rows for one id merge
  silently. Two artifacts with different `code` for one id fail the build with a new error
  diagnostic naming both files. An artifact whose `package` is not the package it sits in is
  ignored (a vendored copy of someone else's). `format` above what the binary knows is a warning
  ("built with a newer compiler") and the package is treated as having no artifact.
- **run-types is unchanged.** Its dist is tsc-built and hollowed, so it stays on the source lane
  (`purefnids.SourceFiles`, `MarkerSourceFiles`, `purefnindex.go:282-292`) until it is built with
  the mion compiler. That build is what will put its artifact in `dist`; then `src` can leave its
  tarball, which is its own spec.
- **No option, no `package.json` field, no CLI verb.** Internal and transparent: build with any
  adapter or `mion compile`, the file lands next to the bundle, `files: ["dist"]` publishes it.

## What shipped

The plan below landed as written, with these deviations and decisions taken while building:

- **The single JSON file did not survive to merge.** On the same branch, before this landed on
  main, the artifact became a directory: `mion-pure-fns/` holding the package's own pure-fn
  cache modules (the `<package>/<hash>.js` files generate already writes under
  `<genDir>/types/pf/`, copied byte for byte) plus an `index.json` mapping each binding name
  and source file to its id, so a consumer's compiler reads the index on first touch and one
  module per demanded id instead of every body at once. `PFE9016` became an error with it: a
  package that ships neither the directory nor its sources cannot be served, so the consumer's
  build fails instead of warning. Everything else below (the walk that never opens a bundle,
  the own-package rule, `PFE9017` / `PFE9018`, the per-bundler post-bundle hooks, the Next
  broker's two writes, the source lane) shipped as written, with the file replaced by the
  directory wherever the text says `mion-pure-fns.json`.

- **Two new diagnostics, not two separate "newer format" and "conflict" shapes as sketched.**
  `PFE9017` (warning) covers every artifact the compiler cannot use, naming the file and the
  reason: a newer `format`, invalid JSON, a missing `format` or `package`, or a row whose id
  another package owns. `PFE9018` (error) is the conflict: one id, two bodies, both files named.
  A copy of another package's artifact is skipped silently (it is not this package's).
- **The reader lives in one file, `purefnindex/artifact.go`,** shared by the writer (the
  resolver's `collectPureFnArtifact`) and the index, so the shape has one definition. The
  encoder does not HTML-escape (`<`, `>`, `&` stay readable in a shipped file).
- **The "own package" rule needed no built-in exclusion.** Filtering by the id's package half
  already keeps the marker package's built-ins out of every other package's artifact, and in
  the day run-types builds with the compiler it keeps them in its own.
- **Ambiguous binding names tiebreak by file basename on BOTH lanes:** the source lane records
  each row's file too, so an artifact and a source extraction of one package answer the same.
- **The Next broker takes an `artifactDir` option** (derived from `distDir` by `withRunTypes`)
  and writes twice, after `buildStart` and on the first loader request, because Turbopack
  empties `distDir` in between. Best effort, as planned.
- **The response wire needed one more line:** `protocol.Response` has a hand-written
  marshaller, so `pureFnArtifact` had to be listed there as well as on the struct.
- **Inline resolver fixtures may now carry a `package.json`** (read through the FS, never a
  program root), which is how a Go test builds a named package; the JS report fixture got a
  name for the same reason.
- **The fuzz oracle constrains inputs to valid UTF-8:** every field comes from parsed
  TypeScript, and JSON cannot carry anything else. The fuzzer found that before the constraint.

## Plan

Builds on the tree after the package pure-fn index (`purefnindex`, `servePackagePureFns`,
`PFE9016`, the `#pf_` id separator) has landed on main; line numbers below are that tree's.

### 1. Go: render and keep the artifact (`internal/compiler/resolver/`)

- `generate.go`: add `pureFnArtifactPath(outDir) = <outDir>/types/mion-pure-fns.json` beside
  `pureFnReportPath` (`:232-239`); add `renderPureFnArtifact(entries, packageName) []byte`
  (sorted rows, the shape above); write it through the same write-on-change path as
  `writeJSONReport` (`:248`), removing the file when there are no rows; exempt the name from the
  `types/` GC the way the two report files are (`:447`).
- `render.go`: a `collectPureFnArtifactRows` next to `collectPureFnReport` (`:329`) applying the
  "own package only" filter above; the building package's name comes from `marker.PackageOfFile`
  of `Program.Cwd` (already used by `IDFor`, `purefunctions/id.go:46-50`).
- `dispatch.go` (`OpGenerate`, near the report writes at `:1109-1118`): always render, write the
  canonical copy, and set `Response.PureFnArtifact` (content string, empty when no rows).
- `protocol/protocol.go` + `packages/devtools/src/core/protocol.ts` (`Response`, `:504-560`):
  the new `pureFnArtifact?: string` field; `resolver-client.ts` `generate()` (`:522-546`) passes it
  through on `GenerateResult`.
- `batchcompile/compile.go` (`mion compile`): after pass 2 writes its emit under `outDir`
  (`:236-244`), write `<outDir>/mion-pure-fns.json` from the generate result (or remove a stale
  one); nothing under `--no-emit` (`:129-133`). `cmd/mion/main.go` `runCompile` usage text
  (`:697-708`) names the file.

### 2. Go: read only the artifact (`internal/cachegen/purefnindex/purefnindex.go`)

- `Package()` (`:152-208`): replace the JS walk (`filesUnder(root, isJSFile)`, the `<name>#pf_`
  prefilter at `:173-182`, `scanFile`) with `filesUnder(root, isArtifact)` + `readArtifact`
  (json decode into a small `artifactFile` struct, validate `format` and `package`, convert rows
  through the existing `served()` shape at `:402-410`, merge with the duplicate rules above).
  `len(idx.Rows) == 0` still falls through to `extractSource` (`:183-185`): the rule becomes
  "artifact wins over src".
- Bindings: `byName`/`addName` (`:186-206`) are fed from each row's `bindingName`. `BindingID`
  (`:477-507`) drops the sibling `.d.ts` to `.js` lookup and `exportsByFile`; when a name is
  ambiguous it tiebreaks on the row's `file` basename against the `.d.ts` basename
  (`dist/slug.d.ts` and `src/slug.ts`), and stays unanswered if still ambiguous.
- Delete: `scanFile`, `registrationID`, `tupleEntry`, `stringArray`, `isExportsMember`,
  `unwrapParens`, `nameBinding`, `exportsByFile`, `isJSFile`, the slot constants at `:57-67`,
  and the tsgo parser import. `ResolvePackage`, `Closure`, `Demand`/`Miss`/`Result`, `Bind`,
  `Store`, the whole source lane and `SideProgram` stay untouched.
- `resolver/package_purefns.go` (`servePackagePureFns`, `:36-87`) is unchanged except for
  surfacing the new conflict error and the newer-format warning from the index.
- `diagnostics/codes_purefn.go`: the conflict error and the newer-format warning
  (`ScopeNotSource`, like `PFE9016` at `:54-59`), with `messages.go` / `prose.go` rows and the
  catalog regenerated (`pnpm miondevx core codegen all`).
- `constants.go`: `PureFnArtifactFileName`; keep `PureFnHashPrefix` (it is still the id
  separator), only its bundle-prefilter role goes.
- `cmd/gen-builtin-purefns/main.go` keeps using `purefnindex.ScanRegistrations` /
  `ExtractSources` (source lane, untouched).

### 3. Devtools: write the artifact into every bundler's output dir (`packages/devtools/src/`)

One helper in `core/unplugin.ts`, `writePureFnArtifact(dir)`: `mkdir -p`, write-on-change of
`<dir>/mion-pure-fns.json` from the last generate's content, remove when empty (same shape as
`writeMirrorFiles`, `:735-753`). Called after the bundle is on disk, per bundler, on the shared
plugin object (`:1099-1350`), using unplugin's escape hatches rather than its arg-less
`writeBundle`:

| bundler | hook | output dir |
| --- | --- | --- |
| vite, rollup, rolldown | native `writeBundle(outputOptions)` in the `vite:` / `rollup:` / `rolldown:` blocks (vite block exists at `:1243`) | `outputOptions.dir ?? dirname(outputOptions.file)`; a multi-environment vite build (client + ssr, `src/vite/mionVitePlugin.ts:246`) fires once per environment, so each output dir gets its copy |
| esbuild | `esbuild.setup(build)` then `build.onEnd` | `build.initialOptions.outdir ?? dirname(outfile)` |
| webpack, rspack | `webpack(compiler)` / `rspack(compiler)` then `compiler.hooks.afterEmit.tapPromise` | `compiler.options.output.path` |
| bun (bundler host) | `bun.setup(build)` then `build.onEnd` (`runtypes/bun.ts:110-185`) | `build.config.outdir`; the runtime host (`--preload`) has no bundle and writes nothing (`:181-183`) |
| next (Turbopack) | the broker (`runtypes/next/broker.ts`) after `ready` (`:208-217`) and again on the first loader request (Turbopack has cleaned `distDir` by then) | `<root>/<nextConfig.distDir ?? '.next'>`, read in `withRunTypes` (`next/index.ts:81-102`) and passed to `startBroker`. Best effort: a Next app is never installed as a package, so this lane carries no guarantee; `next --webpack` rides the webpack row |

The precedent for a post-bundle file write is `src/vite/cjsPackageJsonPlugin.ts:12-21`. Vite dev
server (`configureServer`) never writes it: dev never publishes. No new option: nothing in
`options.ts`, `PluginOptions`, or `plugin-option-keys.ts` changes.

### 4. Drift fixed on the way

- `packages/run-types/src/runtypes/pureFn.ts:18-32` documents the old id rule (package + file +
  binding name); rewrite to package + body hash, the rule in `purefunctions/id.go:10-36`.

## Tests

Go (`go -C ts-go-runtypes test ./internal/... ./cmd/...`):

- `purefnindex_test.go`: fixtures move their tuples from `dist/index.js` into
  `dist/mion-pure-fns.json`. New: a package whose `dist/index.js` is a large bundle carrying
  tuples and no artifact yields no rows AND no `.js` file is ever opened (an overlay FS that
  records reads, via `program.NewOverlayFS`); ESM + CJS artifacts with identical rows merge;
  conflicting bodies for one id raise the conflict error naming both files; an artifact with a
  foreign `package` is ignored; `format: 2` warns and falls to the unbuilt lane; hidden dirs and
  `node_modules` are skipped; artifact wins over src; binding-name tiebreak by file basename,
  and still-ambiguous stays unanswered; nested install resolves from the dependent's root;
  closure across two packages (app to B to C) through artifacts.
- `resolver/package_purefns_test.go`: served from artifact; unbuilt warns `PFE9016`; built
  package lacking the id errors `PFE9012`; the paired `getRunTypeId<T>()` /
  `getRunTypeId(value)` shapes agree (marker coverage rule).
- `resolver` generate tests: the artifact holds own-package rows only (a workspace sibling in
  the program and the built-ins are excluded), is sorted and byte-stable across two runs, lands at
  `<genDir>/types/mion-pure-fns.json`, rides the Response, and disappears when the last pure fn
  is removed. It never appears as a generated module (the `pure-fn-report` pin, mirrored).
- `batchcompile`: `mion compile` writes `<outDir>/mion-pure-fns.json`; `--no-emit` writes nothing.
- Equivalence oracle: extracting a fixture package from `src` and reading its artifact produce
  identical `Entry` rows (id, paramNames, code, deps).

JS (`pnpm test`; `pre-publish-e2e` label on the PR):

- `packages/run-types/test/third_party/package-pure-fns-e2e.test.ts`: `@acme/text` (esbuild +
  adapter) now asserts `dist/mion-pure-fns.json` with the `slugify` and `title` rows, then
  replaces `dist/index.js` with hollow `registerPureFn(null)` registrations so the artifact is the
  only body source; both consumers (rollup adapter, `mion compile`) are served from it, and the
  compile consumer's own `dist/mion-pure-fns.json` exists. The `@acme/dates` src lane and
  `@acme/legacy` runtime-only lane stay; the paired `getRunTypeId` shapes stay.
- New `packages/devtools/test/pure-fn-artifact.test.ts`: real builds into a temp dir for rollup
  (`output.dir` and `output.file`), vite lib mode (`build.outDir`) and a client + ssr
  multi-environment build (both dirs), esbuild (`outdir` and `outfile`), bun bundler host; fake
  `compiler` objects with `hooks.afterEmit` + `options.output.path` for webpack and rspack (not
  workspace deps); the empty case removes a stale file; vite dev server writes none.
- `packages/devtools/test/next-broker.test.ts`: the broker writes into `distDir` after ready and
  after the first loader request.
- `packages/devtools/test/pure-fn-report.test.ts` sibling assertion: the artifact file never
  collides with a generated module under `types/`.
- `go-generated` mirror: `pnpm miondevx core codegen all --check` green with the new constant.

## Docs

- Website `container/website/content/02.runtypes/02.guide/09.pure-functions.md`: a new section
  "Sharing Pure Functions From a Package" after "Wrapping the Registrar in Your Own API" (`:64`):
  build with any adapter or `mion compile`, the output dir gets `mion-pure-fns.json`, publish it
  with your dist, a consumer's build serves the bodies from it, and a package without one is
  registered only at runtime and the build warns. Plain language, no internals. `website` label.
- Diagnostics catalog entries for the two new codes (generated).
- `ts-go-runtypes/CLAUDE.md` cachegen block (`:16-20`) and the `purefnindex.go` package comment:
  describe the artifact lane and the source fallback, drop the built-file scan.
- `packages/devtools/CLAUDE.md`: the post-bundle write and the per-bundler output-dir rule;
  `runtypes/next/CLAUDE.md`: the broker's artifact write as an invariant.

## Fuzzing

Yes, cheap oracle: `FuzzArtifactRoundTrip` in `purefnindex` renders random `Entry` rows
(unicode, NUL, `</script>`, newlines, empty binding names) to the artifact and decodes them back;
the rows must be identical and the render must be byte-stable across two calls. The JS
equivalence test above (artifact lane versus src lane producing byte-identical served `pf`
modules for the same fixture) is the end-to-end form of the same oracle.

## Out of scope

- Hollowing third-party registrations (a library mode emitting `registerPureFn(null, id)`) so
  the library bundle stops carrying bodies. The artifact makes it possible; it is not this change.
- Moving run-types off its source lane and `src` out of its tarball: that needs run-types built
  with the mion compiler, its own spec.
- A `package.json` field, a `mion pure-fns` CLI verb, an option to name or move the file.
- Replacing or merging `pure-fns-report.json`; it keeps its own shape and consumers.
- A post-build guarantee on the Next Turbopack lane.

## Done when (all met)

- Every build lane (`mion compile`, vite, rollup, rolldown, esbuild, webpack, rspack, bun
  bundler host) writes `mion-pure-fns.json` into its output directory when the package registers
  at least one pure fn, and writes nothing otherwise; the e2e shows the esbuild lane and the
  compile lane producing it.
- The consumer index parses only artifact files, or a package's sources when it has none; no
  `.js` file of a package's bundle is ever opened, pinned by the recording-FS test.
- A consumer's pure fn importing a library id is served from the artifact through both the
  plugin and `mion compile`, with the library bundle hollowed, and the paired `getRunTypeId`
  shapes agree.
- Conflicting artifacts fail the build naming both files; a newer format warns; a package with no
  artifact warns `PFE9016` as today.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`,
  `pnpm miondevx core codegen all --check` and `pnpm run check:builds` pass; the website page
  and the three CLAUDE.md blocks describe the artifact lane.
