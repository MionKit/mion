# purefnindex: pure fns an installed package ships

Serves the pure fns an INSTALLED package ships, marker package's built-ins included. Read before changing that lane.

## The artifact lane

- One lane, no table compiled into the binary.
- Every mion build syncs the package's own pure-fn CACHE MODULES into one dir in its output dir:
  `mion-pure-fns/` (`constants.PureFnArtifactDir`).
- Contents: the same `<package>/<hash>.js` files generate writes under `<genDir>/types/pf/`, byte for byte.
- Plus `index.json`: each binding name + source file → its id (shape in [artifact.go](artifact.go)).
- Consumer's compiler decodes the index on first touch of the package (a `.d.ts` import is a NAME, never an id).
- Opens a module only for an id its build demands → memory follows what the consumer uses, never a bundle.
- No artifact dir found → rows extracted from the package's TypeScript sources, same extractor a build runs.
- `@mionjs/run-types` is on this lane too: its build runs `mion compile` → writes `dist/mion-pure-fns/` beside the emit.
- Its dist stays hollowed → those bodies never reach a consumer's bundle twice.

## Five rules

### 1. Never open the bundle; open a module only on demand

- Bundle = whatever the library's bundler produced: minified, chunked, tree-shaken, in the library's emit mode.
- Reading it costs its size and misses what the bundler dropped.
- Artifact is rendered by the library's own generate step from the whole program.
  Renderer: `renderPureFnArtifact` (`resolver/render.go`).
- It is the pure-fn slice of the final graph, per entry whatever the module mode, imports relativized as on disk.
  → a registration the bundle lost is still there.
- `ReadModule` reads one tuple off one module, in whatever emit mode the library used.
- A `functions`-mode module carries the body as a live function literal; its block text is the code string.
- Pinned with a recording FS: `TestArtifact_BundleIsNeverOpened`, `TestArtifact_OnlyDemandedModulesAreOpened`.

### 2. An id is matched, never decoded

- Id = package + hash of the body that ships → says nothing about where that body lives.
- Served row keeps the library's id verbatim. Its module path is derived from the id (`ModulePath`).
- Demanded id that a package with rows does not produce → `purefn-not-registered`.
- Package shipping nothing to serve at all → ERROR `purefn-package-not-built`, per id, marker package included.
  Consumer's pure fn cannot be built → package must be built with mion (or ship its sources).
- File this compiler cannot use → warning `purefn-artifact-unreadable`, naming the file.
  Cases: index of a newer `format`, not an index, listed module missing, module holding no tuple for its id.
- Two artifact dirs of one package disagree on an id → error `purefn-artifact-conflict`.
  Cases: different body when demanded, different name in the index.
- Identical copies from an ESM + a CJS build merge silently. A body no build demands is never compared.

### 3. `purefunctions` produces the ids, not this package

- `resolveCtx` already resolves a registration recursively + memoises it, following a dep through its import.
- `purefnindex` only picks which files to hand it and indexes what comes back.
- Reuses the SESSION's checker + `FileCache` whenever the session's program already holds those sources
  (in-repo, via the `source` condition). Else two resolvers hash the same bodies → one fn split into two entries.

### 4. A package's own build is the single producer of its built-ins

- `collectProgramPureFns` drops every `purefnids.Has` entry from the whole-program graph.
- Why: in-repo consumer resolves the marker package via the `source` condition → 2nd body for an id the table serves.
- Filter lifts for the package that OWNS them (`sess.ownPackage()`) → its artifact comes out complete.
- Rewrite filter in `extractPureFnsForScan` does NOT lift: own registration call sites stay unrewritten.
- So they keep their explicit id from `pure-fn-ids.generated.ts` → no emitted import dangles when nothing demands it.
- `cmd/gen-builtin-purefns` writes that TS file + the Go id constants from one extractor pass.
  → constants and served bodies cannot disagree.

### 5. A dep resolves from the package that names it

- Walk of a package root for artifact dirs skips `node_modules` + hidden dirs.
  (A consumer's `.mion` holds served COPIES of other packages' rows.)
- Visits every child of a dir before descending (shallower dir listed first). Never enters an artifact dir.
- A row's dep on another package: located by a node_modules walk from that row's package root.
  → a nested install lands on the copy the package was built against.
- Only the building package's own rows go into its artifact.
- A workspace sibling the program reaches via the `source` condition belongs to its own artifact.

## Output side

- Generate returns the artifact as a map (path inside the dir → content) on the Response.
- No second copy under `<genDir>/types/`.
- `mion compile` syncs it into the tsconfig `outDir`. Each bundler adapter syncs into its own output dir.
- Adapters sync from their post-bundle hook: generate runs at `buildStart`, before a bundler empties that dir.
- Sync = `SyncArtifactDir` + its TS twin: write-on-change, delete every other file, remove the dir when empty.
