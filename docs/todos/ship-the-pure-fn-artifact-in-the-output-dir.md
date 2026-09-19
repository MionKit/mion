---
type: feature
spec: guidelines
status: ready
created: 2026-09-19
---

# Ship the pure-fn artifact in the output dir, and read only that

## Intent

A consumer's compiler serves an installed package's pure functions on demand
(`ts-go-runtypes/internal/cachegen/purefnindex/`). Today it finds them by walking
every `.js` file under the package root in `node_modules`, keeping the files that
contain `<package>#pf_`, and parsing each one with the TypeScript parser to pick the
entry tuples and registration calls out of the AST. That works, but its cost is the
size of whatever the library's bundler produced: a large single-file bundle that does
carry pure functions is parsed in full, with an AST several times the file size in
memory. Local measurements say nothing about other people's bundles, and a text or
regex scanner is not an answer either (the tuple shape can change, and a function
body in functions emit mode makes the tuple's end hard to find without parsing).

Instead, every mion build writes one small, well-known file that holds the package's
pure functions and nothing else, and the consumer parses only that file. The parse
is bounded by the pure functions a package ships, never by its bundle.

## Decisions already taken

- **One file, fixed name: `mion-pure-fns.js`.** A plain ES module that nothing
  imports. It holds the package's own entry tuples (the same tuple shape the `pf`
  modules carry, rendered in code emit mode so the consumer can re-render in its own
  mode) plus a table mapping each registration's source binding name to its id, which
  is how an untyped `.d.ts` binding (`PureFnId<string>`) resolves to an id.
- **It lands in the bundler's output directory**, next to the bundle: `mion compile`
  writes it to the tsconfig `outDir`; each adapter (vite, rollup, rolldown, esbuild,
  webpack, rspack, bun, next) writes it to its own output dir once the bundle is
  written. So an author's existing `files: ["dist"]` already publishes it, and it is
  written even when the bundler also inlined the tuples into the bundle. Duplication
  is fine; the artifact is build-time input, never loaded at runtime.
- **The consumer reads the artifact or the sources, never the bundle.** The index
  looks for `mion-pure-fns.js` under the package root (skipping `node_modules` and
  hidden dirs, whose contents are other packages or a consumer's own scratch) and
  parses only those files with the AST. The JS-wide scan and the registration-call
  export mapping go. A package with no artifact and no sources is the runtime-only
  lane (`PFE9016`), exactly as a package with no tuples is today.
- **run-types is unchanged by this.** Its dist is tsc-built and hollowed, so it stays
  on the source lane (the generated `purefnids.SourceFiles`) until it is built with
  the mion compiler; that build is what puts its artifact in `dist`.
- **No option, no manifest field, no docs page.** Internal and transparent.

## Direction

The implementer plans the details. Pointers verified at filing time:

- The index and its scan: `Package()` in
  `ts-go-runtypes/internal/cachegen/purefnindex/purefnindex.go` walks JS files,
  prefilters by `<name>#pf_`, and hands each to `scanFile` (tsgo parser); `BindingID`
  answers a `.d.ts` name from per-file export maps and a package-wide name map. The
  tuple reader (`tupleEntry`) and the closure stay; the walk narrows to the artifact
  name and the export mapping is replaced by the artifact's bindings table.
- The tuple shape and its render: `purefunctions.CollectEntries` in
  `ts-go-runtypes/internal/cachegen/purefunctions/module.go`, and the module render in
  `ts-go-runtypes/internal/compiler/entrymodules/entrymodules.go` (`ModuleName`,
  `RenderGrouped`, the `pf` bundle of allSingle module mode is the closest existing
  shape to the artifact).
- The program's own rows: `collectProgramPureFns` / `extractProgramPureFns` in
  `ts-go-runtypes/internal/compiler/resolver/render.go` (built-ins filtered by
  `purefnids.Has`); `purefunctions.Entry` carries `BindingName` and `FilePath` for the
  bindings table.
- Where files are written today: `mion compile` is `runCompile` in
  `ts-go-runtypes/cmd/mion/main.go` (outDir from the tsconfig, genDir from
  `buildconfig.go`); the adapters write generated modules through
  `packages/devtools/src/core/unplugin.ts` (the `fs.promises.writeFile` loop near line
  745). Each adapter has to learn its bundler's output dir and a hook that runs after
  the bundle is written; the Go side should render the artifact content once and hand
  it back on the generate op so no adapter re-derives it.
- Name the file in one constant on the Go side (`ts-go-runtypes/internal/constants/`)
  and mirror it to TS through `cmd/gen-ts-constants`, like `PureFnHashPrefix`.
- The e2e that proves the lane is
  `packages/run-types/test/third_party/package-pure-fns-e2e.test.ts` (three libraries,
  two consumers): the esbuild-built library and the `mion compile` consumer must both
  produce the artifact, and the consumer must be served from it with the bundle
  untouched. `purefnindex_test.go` fixtures that today put tuples in `dist/index.js`
  move into `mion-pure-fns.js`.
- Docs that describe the current scan and must change with it: the `cachegen` block
  in `ts-go-runtypes/CLAUDE.md` and the package comment of `purefnindex.go`.

## Done when

- Every build lane, `mion compile` and each bundler adapter, writes
  `mion-pure-fns.js` into its output directory, holding the package's pure-fn tuples
  and the binding-name table, and the e2e shows both the esbuild lane and the compile
  lane producing it.
- The consumer index parses only artifact files (and, for a package without one, its
  sources); no `.js` file of a package's bundle is ever parsed, pinned by a test with
  a large bundle that carries tuples and no artifact and is not read.
- A consumer's pure fn importing a library id is served from the artifact through
  both the plugin and `mion compile`, with the paired `getRunTypeId` shapes agreeing.
- The Go and JS gates are green and the guidelines text describes the artifact lane.
