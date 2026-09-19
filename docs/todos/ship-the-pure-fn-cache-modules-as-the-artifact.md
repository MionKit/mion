---
type: feature
spec: full-plan
status: ready
created: 2026-09-19
---

# Ship the pure-fn cache modules as the package artifact, with a name index, read one module per demanded id

## Problem

A mion build already produces, per pure function, one cache module under
`<genDir>/types/pf/<package path>/<hash>.js` (`entrymodules.ModuleName`,
`ts-go-runtypes/internal/compiler/entrymodules/entrymodules.go:244-269`; rendered by
`renderModule`, `:558-621`; written by `materializeModules`,
`internal/compiler/resolver/generate.go:457-474`). Its one export is the entry tuple
`[2, deps, , id, paramNames, code, pureFnDependencies, createPureFn?]`
(`purefunctions.CollectEntries`, `internal/cachegen/purefunctions/module.go:37-70`): the id
verbatim, and the body as the build finished it, types stripped and nested calls lowered to ids
(`walker.go:562-574`). That module is the compiled pure function.

The artifact lane renders the same rows a SECOND time into one `mion-pure-fns.json`
(`purefnindex.RenderArtifact`, `internal/cachegen/purefnindex/artifact.go:53-80`), and a
consumer's compiler decodes the whole file on first touch of the package (`Store.Package`,
`purefnindex.go:157-202`), holding every body in memory for the session however many the
consumer's program demands. A package built only to provide pure functions makes that
concrete: hundreds of bodies loaded to serve one.

So: the cache modules ARE the artifact. A build copies its own package's modules, byte for
byte, into `dist/mion-pure-fns/`, plus one small index mapping export name and source file to
id. A consumer's compiler reads the index on first touch and one module per demanded id.
Memory is bounded by the index (an id, a name and a file per row) plus the demanded rows.

## Decisions

- **Layout.** A directory `mion-pure-fns` (constant `PureFnArtifactDir`, replacing
  `PureFnArtifactFileName` at `internal/constants/constants.go:466-471`; TS mirror
  `PURE_FN_ARTIFACT_DIR` through `cmd/gen-ts-constants/main.go:135`) owned by the build:

  ```
  dist/
    index.js
    mion-pure-fns/
      index.json
      @acme/text/9Zt1bRm4cVaPqL.js
      @acme/text/Q2xVn7eK0sLmYb.js
  ```

  A module's path inside the directory is `ModuleName(id)` without its leading `pf/` segment,
  plus `.js`, so the consumer derives the path from the id and needs no path in the index. The
  package segments stay (the id's package half, `@`-scoped names included) because that is the
  module's name everywhere else: the same file under `<genDir>/types/pf/`, the same import
  specifier a consumer's own build would use.
- **The module is copied as generate wrote it to disk**, relativized imports included
  (`relativizeModuleImports`, `internal/compiler/resolver/relimports.go:49`, applied in
  `generateToDisk`, `generate.go:152-155`), so `dist/mion-pure-fns/@acme/text/<hash>.js` and
  `<genDir>/types/pf/@acme/text/<hash>.js` are byte-identical, pinned by test. An import of a
  dependency from another package (a built-in, say) points at a file the directory does not
  hold; nothing resolves it: the directory is not an entry, not in `exports`, and the consumer's
  compiler reads the tuple and ignores the import block. Same-package dependencies resolve
  because the directory holds them.
- **Emit mode follows the library.** A `code`-mode library ships the body as a string in slot
  5; a `functions`-mode library ships a hole there and the live `function(<params>){<code>}` in
  slot 7, whose block text is exactly the code string (`createPureFnJS`, `module.go:179`); `both`
  ships both. The reader accepts all three and re-renders in the CONSUMER's emit mode, as
  `servePackagePureFns` does today (`internal/compiler/resolver/package_purefns.go:38-62`).
- **Module mode.** In `allSingle` the cache folds every pure fn into one `pf` bundle
  (`moduleGrouping`, `dispatch.go:596-614`). The artifact is always per entry: generate renders
  the pure-fn slice of the same graph per entry (`entrymodules.RenderGrouped(graph, nil)`) and
  relativizes it the same way. In the default mode that render equals the modules map, pinned
  by test; in `allSingle` it is the per-entry rendering of the same entries.
- **`index.json`** (constant `PureFnArtifactIndexFile = "index.json"`), sorted by id,
  two-space indent, trailing newline, non-HTML-escaping encoder:

  ```json
  {
    "format": 1,
    "package": "@acme/text",
    "pureFns": [
      {"id": "@acme/text#pf_9Zt1bRm4cVaPqL", "bindingName": "slugify", "file": "src/slug.ts"},
      {"id": "@acme/text#pf_Q2xVn7eK0sLmYb", "bindingName": "title", "file": "src/title.ts"}
    ]
  }
  ```

  `bindingName` is the binding the registration was assigned to, `file` the source path relative
  to the package root: the two fields `BindingID` reads (`purefnindex.go:483-513`) to map a
  `.d.ts` import to an id, `file` doubling as the tiebreak between two rows sharing a name.
  `format` stays `1`: the single-file shape never shipped in a release and this replaces it on
  the same branch; no reader looks for `mion-pure-fns.json` any more.
- **Discovery.** The consumer walks the package root as today (`filesUnder`,
  `purefnindex.go:231-260`: listings only, `node_modules` and hidden dirs skipped) for
  directories named `mion-pure-fns`, reads each `index.json`, and does not descend into them.
  An index naming another package is ignored (a vendored copy); a higher `format` is PFE9017 and
  that directory is treated as absent.
- **Lazy rows.** `PackageIndex` keeps, per id, the artifact directories whose index lists it,
  plus `bindingName` and `file`. `Closure` (`purefnindex.go:564-624`) asks `idx.Row(id)`: cached
  row, or read `<dir>/<module path>` from every directory listing the id, parse the module with
  the TypeScript parser as JavaScript and read the tuple (the reader that main's
  `purefnindex.go` had before the JSON lane, `tupleEntry` and `stringArray`, restored from git
  history), check slot 3 is the requested id, compare the copies (an ESM and a CJS build both
  write the directory; identical rows merge, different bodies are PFE9018 naming both files,
  first copy kept), cache the served row, drop the parse. A listed module that is missing or
  holds no such tuple is PFE9017 for that copy; when no copy remains the id is a `Miss` with
  `Built: true` (PFE9012), as a built package lacking an id is today. A conflict on a body the
  consumer never demands is never read and never reported: the check covers what the build
  uses.
- **Index conflicts** are eager (the index is small): two directories giving one id a
  different `bindingName` or `file` is PFE9018, first kept.
- **The source lane is unchanged.** No artifact directory and shipped TypeScript means
  `extractSource` (`purefnindex.go:302-340`) fills every row eagerly as today; `Row(id)` reads
  that map. The marker package stays on it.
- **Whoever owns an output dir syncs the directory.** Generate returns the artifact as a map
  of file path (inside the directory) to content on the Response; the bundler adapters, the Next
  broker and `mion compile` sync it into `<outputDir>/mion-pure-fns/` once the bundle is on
  disk. Sync means: write a file only when its bytes changed, delete every other file in the
  directory, remove the directory when the map is empty. No separate canonical copy under
  `<genDir>/types/`: the cache modules are the canonical copy.
- **A missing artifact is an error.** A consumer's pure fn that depends on an installed
  package's id, where that package ships neither the directory nor its sources, fails the
  build: PFE9016 (`diagnostics/codes_purefn.go:54-59,86`) moves from `LevelWarning` to
  `LevelError`, its wording says the package must be built with mion (or ship its sources) and
  the consumer cannot be. The runtime-only lane (a package that registers at runtime and
  ships no artifact) is no longer a lane a consumer's build passes through; the consumer's own
  registrations and the PFE9012 check are untouched.
- **The consumer never reads a library's build configuration.** It locates the directory by
  walking the installed package, wherever the library's bundler put its output; a library
  whose `files` left the directory out reads as unbuilt, which is the error above.
- **No option, no manifest field.** `files: ["dist"]` publishes the directory.

## Plan

Line numbers are the current branch's (`claude/clever-ritchie-vm5swp` at 2192738b1).

### 1. Go: render the artifact from the module render (`internal/compiler/resolver/`)

- `dispatch.go` `collectEntryModules` (`:149-227`): after `RenderGrouped` (`:214`), render the
  pure-fn slice of `graph` (entries of `KindPureFn`, and `KindMissing` stubs keyed by a pure-fn
  id, which `directDeps` needs present) per entry with a nil grouping, keep the keys whose
  `purefnindex.PackageOfID` is the own package (`marker.PackageOfFile` of the program's cwd, as
  `collectPureFnArtifact` does at `render.go:348-364`), relativize their imports with
  `relativizeModuleImports` (`relimports.go:49`), and return them beside `modules` keyed by the
  path inside the artifact directory. Add `index.json` from the same own-package entries
  (`purefnindex.RenderArtifactIndex(packageName, packageRoot, entries)`).
- `render.go` `collectPureFnArtifact` (`:340-364`) becomes the index half only, or folds into
  the above; the own-package filter is unchanged.
- `dispatch.go` OpGenerate (`:1008-1015`): drop the canonical write, set
  `genResponse.PureFnArtifact` to the map. `generate.go`: delete `pureFnArtifactPath`
  (`:242-250`); replace `WriteOrRemoveFile` (`:252-271`) with exported
  `SyncArtifactDir(dir string, files map[string]string) error` (write-on-change per file, delete
  extras, remove the dir when empty; `materializeModules` at `:457-474` is the pattern). The
  comment at `:43-52` on non-module files under `types/` loses its artifact sentence.
- `protocol/protocol.go:274-278` and the marshaller at `:708-710`:
  `PureFnArtifact map[string]string`, emitted when non-empty.
- `batchcompile/compile.go:246-259`:
  `resolver.SyncArtifactDir(filepath.Join(outDir, constants.PureFnArtifactDir), gen.PureFnArtifact)`.

### 2. Go: read the index and the modules (`internal/cachegen/purefnindex/`)

- `artifact.go`: `Artifact` becomes `ArtifactIndex{Format, Package, PureFns []ArtifactIndexRow{ID, BindingName, File}}`;
  `RenderArtifactIndex` replaces `RenderArtifact` (`:53-80`, same encoder, no body fields);
  `ParseArtifactIndex` replaces `ParseArtifact` (`:86-106`, same checks). New
  `ModulePath(id) string` (the `ModuleName` minus `pf/` plus `.js` rule, the one place it lives)
  and `ReadModule(id, content string) (purefunctions.Entry, bool)`: parse as JavaScript, find the
  one `export const` array literal, `tupleEntry` (slots 0, 3, 4, 5 or 7, 6). `IsArtifactFile`
  (`:120`) becomes `IsArtifactDir(name)`.
- `purefnindex.go`: `PackageIndex` (`:124-148`) drops the public `Rows` map for `listed`
  (id to artifact dirs), `names` (id to bindingName and file), a `rows` cache and
  `Row(id) (purefunctions.Entry, bool)`; `Built()` (`:153`) is `len(listed) > 0 || len(rows) > 0`.
  `Package` (`:157-202`) walks with a directory predicate (extend `filesUnder` with a
  `visitDir` callback, or add `dirsUnder`), reads each `index.json`, merges through `addIndex`.
  `addArtifact` (`:207-222`) and `artifactOf` go; `byName` and `rowFile` are fed from the index.
  `Closure` calls `idx.Row` and appends every visited root's `Problems` and `Conflicts` AFTER
  the queue drains (lazy reads add to them during the walk). `BindingID` is unchanged in shape.
  The package doc (`:1-33`) describes the directory, the index and the on-demand read. The
  tsgo parser imports return for `ReadModule`.
- `diagnostics/messages.go:333,337`, `prose.go:245-250`, `codes_purefn.go:60-68`: PFE9017 and
  PFE9018 wording names the directory, its index and its modules. Catalog regenerated
  (`pnpm miondevx core codegen all`).

### 3. TS: sync the directory (`packages/devtools/src/`)

- `core/protocol.ts:523` `pureFnArtifact?: Record<string, string>`;
  `core/resolver-client.ts:401,539` `pureFnArtifact: Record<string, string>` defaulting to `{}`.
- `core/unplugin.ts`: `pureFnArtifact` (`:483`, set at `:886`) holds the map;
  `writePureFnArtifact(dir)` (`:896-907`) becomes the sync of `<dir>/mion-pure-fns/` (recursive
  readdir, write-on-change each file as `writeMirrorFiles` does at `:740-767`, unlink extras,
  remove empty subdirectories and the directory itself when the map is empty). `outputDirOf`,
  `writeArtifactForOutput`, `writeArtifactAfterEmit` (`:911-931`), the hooks at `:1302-1323`
  and `rtWritePureFnArtifact` (`:1163`) are unchanged.
- `runtypes/next/broker.ts:188-192,384-391` and `next/index.ts:93-96`: unchanged.
- Mirror regenerated: `PURE_FN_ARTIFACT_DIR` and `PURE_FN_ARTIFACT_INDEX` replace
  `PURE_FN_ARTIFACT_FILE` in `core/go-generated/runtypes-constants.generated.ts`.

### 4. Drift fixed on the way

- The done record of the single-file artifact lane describes a layout that no longer ships;
  its "What shipped" section is reconciled to the module directory when this lands.

## Tests

Go (`go -C ts-go-runtypes test ./internal/... ./cmd/...`):

- `purefnindex/artifact_test.go`: `FuzzArtifactRoundTrip` (`:17-78`) becomes the module oracle:
  a random entry rendered through the real renderer in each emit mode (`code`, `functions`,
  `both`), read back with `ReadModule`, equals `served(entry)`; the index round-trips through
  `RenderArtifactIndex` / `ParseArtifactIndex`; `ModulePath(id)` equals `ModuleName(id)` minus
  `pf/` plus `.js` and holds no `..`. `TestRenderArtifact_EmptyIsNil` (`:81`) becomes an empty
  map.
- `purefnindex/purefnindex_test.go`: fixtures move from one JSON file to the directory (an
  index plus modules written by the real renderer). New with the `recordingFS` (`:98-111`): a
  package listing three ids, one demanded, opens `package.json`, `index.json` and ONE module,
  nothing else (the memory pin); discovery opens no module. Conflicts (`:152`): a demanded
  module differing between `dist/` and `dist/cjs/` is PFE9018 naming both files; an undemanded
  differing module is silent; two indexes disagreeing on a `bindingName` is PFE9018. Unreadable
  (`:176`): a module whose tuple carries another id, a listed module missing (PFE9017 then
  `Miss{Built: true}`), a module with no tuple, `format: 2`, a foreign `package`. A
  `functions`-mode module and a `code`-mode module of the same entry yield the same row.
  Existing cases keep their meaning: identical repeats merge (`:136`), binding tiebreak
  (`:220`), closure across packages (`:253`), missing, unbuilt and unresolved (`:287`), nested
  `node_modules` and hidden dirs skipped (`:335`), source fallback (`:392`), artifact wins over
  source (`:433`), the equivalence oracle (`:448`), the marker lane (`:496-609`).
- `resolver/package_purefns_test.go` (`:85-252`): fixtures become directories; served from the
  artifact, unbuilt ERRORS with PFE9016 (`:169-200`, and the newer-index case at `:236` now
  ends in the error), built lacking the id errors PFE9012, conflict PFE9018 on a
  demanded module, newer index warns PFE9017; a `functions`-mode library served into a
  `code`-mode consumer and the reverse; the paired `getRunTypeId<T>()` / `getRunTypeId(value)`
  shapes (`:252`) stay.
- `resolver/pure_fn_artifact_test.go` (`:40-140`): generate returns the map with `index.json`
  and one module per own-package row; each module's bytes equal the file generate wrote under
  `<genDir>/types/pf/`; in `allSingle` mode the map is still per entry; own-package only; the
  map is empty when the package registers nothing; the paired `getRunTypeId` shapes.
- `resolver/generate` sync: `SyncArtifactDir` writes, leaves unchanged bytes alone, deletes a
  stray file, removes the directory when given an empty map.
- `batchcompile/compile_test.go:267`: `mion compile` writes `<outDir>/mion-pure-fns/index.json`
  plus the modules; `--no-emit` writes nothing.

JS (`pnpm test`; `pre-publish-e2e` label on the PR):

- `packages/devtools/test/pure-fn-artifact.test.ts`: `expectLibArtifact` reads the index and
  both modules and checks each module equals its `<genDir>/types/pf/` twin; every bundler case
  keeps its output-dir assertion; the empty case (`:257-271`) pre-seeds a stale module and an
  unrelated file in the directory and expects the directory gone; a second build after removing
  one fn leaves exactly the surviving module and a re-rendered index.
- `packages/run-types/test/third_party/package-pure-fns-e2e.test.ts`: `readArtifact` /
  `textIds` (`:218-227`) read the index; the hollowed-bundle case (`:307-323`) asserts the two
  modules; the app cases (`:372,395`) assert the consumer's own directory; the `@acme/legacy`
  runtime-only lane (`:127,356`) now asserts the build FAILS with PFE9016 naming the id and
  the package.
- `packages/devtools/test/next-broker.test.ts:98` reads `<distDir>/mion-pure-fns/index.json`.
- `packages/devtools/test/pure-fn-report.test.ts:134-135`: `types/` holds no `mion-pure-fns`
  entry at all any more (no canonical copy), and the `pf/` modules are the only pure-fn output.
- `pnpm miondevx core codegen all --check` green with the two constants.

## Docs

- Website `container/website/content/02.runtypes/02.guide/09.pure-functions.md:70-90`
  ("Sharing Pure Functions From a Package"): the tree shows the directory with `index.json`
  and one compiled module per function, one sentence says a consumer's build reads only the
  functions it uses, and the closing sentence says a package without the directory (and without
  its sources) fails the consumer's build, so build libraries with mion. Plain language, no
  internals. `website` label.
- `ts-go-runtypes/CLAUDE.md:17-23` cachegen block: the modules are the artifact, the index,
  the on-demand read, the sync rule, no canonical copy. `packages/devtools/CLAUDE.md:59` and
  `packages/devtools/src/runtypes/next/CLAUDE.md:96`: the directory name and the owned-directory
  rule.
- Diagnostics catalog entries regenerated for the reworded PFE9017 / PFE9018 and the
  now-error PFE9016 (`messages.go:327`, `prose.go:239-243`).

## Fuzzing

Yes: `FuzzArtifactRoundTrip` becomes the render-then-read oracle over the real module renderer
in all three emit modes, plus the index round trip. No new harness.

## Out of scope

- A binary encoding: the program file system returns decoded text (byte order mark stripping,
  UTF-16 transcoding), and it would be unreadable from JavaScript tests.
- A different file extension for the copies: they are the cache modules, and the same name is
  what makes them the same file.
- Reading the single-file `mion-pure-fns.json` shape: it never shipped.
- Letting a consumer's bundle import the library's modules instead of re-rendering them in its
  own emit mode.
- Hollowing third-party registrations, moving run-types off its source lane, any option or
  manifest field.

## Done when

- Every build lane (`mion compile`, vite, rollup, rolldown, esbuild, webpack, rspack, bun
  bundler host, the Next broker) syncs `mion-pure-fns/` into its output directory: the index
  plus one module per own-package pure fn, byte-identical to the `<genDir>/types/pf/` file,
  stale files removed, the directory removed when the package registers none.
- A consumer's compiler opens, per package, `package.json`, each `index.json`, and exactly the
  modules of the ids `Closure` visits, pinned by the recording-FS test; no bundle is opened.
- A consumer's pure fn importing a library id is served from the directory through both the
  plugin and `mion compile`, with the library bundle hollowed, from a `code`-mode and from a
  `functions`-mode library, and the paired `getRunTypeId` shapes agree.
- Conflicting demanded modules and disagreeing indexes fail the build naming both files; an
  unreadable index or module warns; a demanded id from a package with no artifact directory
  and no sources FAILS the build with PFE9016.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`,
  `pnpm miondevx core codegen all --check` and `pnpm run check:builds` pass; the website page
  and the three CLAUDE.md blocks describe the module directory.
