---
type: feature
spec: guidelines
status: ready
created: 2026-09-17
---

# Serve a package's pure functions to its consumers on demand

## Intent

Only run-types' own pure fns reach a consumer whose program sees just a `.d.ts`: their bodies
travel in a table the compiler serves on demand (`serveBuiltinPureFns`,
`internal/compiler/resolver/dispatch.go`), which is what lets the dist ship hollowed
(`scripts/core/hollow-builtin-purefns.mjs`) and keeps the bodies out of every consumer bundle.

A third-party library gets no such lane. The consumer's compiler cannot extract from
`node_modules`: the lazy expansion in `ValidatePureFnDependencies` only reaches files already in
the program (`purefunctions/walker.go`, `extractFromFile` returns nil otherwise). So the library
ships the full body in its compiled JS, registers it at load, and a consumer pure fn that
references it gets a soft dep the graph stubs out, resolved at runtime only if the library module
loaded first. Bundle cost in full, no build-time guarantee, and mion's own packages are in the same
position as any other library.

One mechanism for any package, with no source in the tarball, and run-types riding it like
everyone else.

## Direction

The implementer plans the details. Verified pointers and constraints:

- **The artifact is the pure-fn report, shipped.** The transform already produces, per
  registration, the rows a serving table needs: key, bodyHash, paramNames, code, deps
  (`protocol.PureFnSite`; written to disk by the `pureFnReport: 'file'` option,
  `packages/devtools/src/core/unplugin.ts`). A library build writes that table next to its
  compiled output and `package.json` points at it (a field such as `"mion": {"pureFns": "..."}`).
  JSON keeps it readable by the Go binary with no evaluation. The bodies are exactly the bytes the
  library tested, with their bodyHash.
- **Location comes from the import edge.** The consumer's compiler resolves the imported binding
  to its `.d.ts`, walks up to the package root (`marker.PackageOfFile`), and reads the table. A
  `.d.ts` emitted by tsc cannot carry the injected id, so the table must also map each module's
  exported binding names to ids, and the dep walker resolves a `.d.ts`-declared binding through
  that map. The string-literal-type resolution case the dep walker already has stays as the fast
  path for explicitly typed ids.
- **Serving is what the built-in path does today, generalised.** Demanded rows plus their
  transitive closure are merged into the graph through `purefunctions.CollectEntries`, emitted in
  the CONSUMER's emit mode and module layout, never by importing the library's own generated
  modules (the tuple layout is a compiler-version wire shape, and emit mode is the consumer's
  choice). A row records the package each of its deps lives in, so closure crosses packages by
  resolving the dep's package from the dependent package's directory, not from the consumer's.
- **Bundled versus external is a per-row choice.** A row whose body ships inline in the package's
  JS is external: the consumer only validates the edge and relies on the load-time registration. A
  hollowed row is bundled: the consumer emits it as a hard edge, so a missing body is a build error,
  not a stub. Library mode of the transform emits `registerPureFn(null, id)` and writes the table;
  a plain-tsc library gets a CLI post-build step producing the same table; a library with no table
  keeps today's runtime lane and is reported, not rejected.
- **run-types becomes an ordinary package on this lane.** Its table is the same artifact, its
  hollow script becomes the generic library mode, and the compiled-in Go table can go once the
  resolver reads run-types' table from `node_modules`. The Go emitters keep their generated id
  constants; only the source of the bodies moves.
- **Constraints.** Bodies never come back into consumer bundles. Tables are read through the
  program FS so `mion compile` and every bundler adapter behave the same. Two versions of one
  package in a tree with different bodies for one id is the existing collision diagnostic, naming
  both package paths. Dep tracking stays build-time and total: an edge to a package with a table
  is verified against it; an edge to a package without one is a reported soft dep, never silent.

## Done when

- A fixture library under `node_modules` holding only compiled JS, a `.d.ts` and its table,
  consumed by a fixture app: the app's pure fn imports the library's id, the emitted module carries
  the body from the table, the library's registration is hollow, proven end to end through both
  the plugin and `mion compile`, and without mion's own built-ins.
- Transitive closure across two packages works (app → library B → library C).
- A library built without a table still works at runtime as today, and the build says so.
- run-types' built-ins ride the same lane, or the reason they cannot yet is written in the code
  next to the table that keeps them.
