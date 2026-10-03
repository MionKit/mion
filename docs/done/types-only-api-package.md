---
type: feature
spec: guidelines
status: in-progress
created: 2026-10-03
---

# A types-only API package, published for clients

## Intent

A mion API built with `mion compile` already writes a `.d.ts` whose API type names the server build version
(`ApiBuildVersion<"…">`), and a client built from it checks its own ids against that version (MET012, MET013).
Today a client gets those types by installing the WHOLE server package, source and handlers included.

An API should be able to publish a separate, types-only package for its clients: everything a client build needs,
and nothing of the server's code. It plays the role an OpenAPI spec plays for other stacks, for TypeScript clients
built with mion.

| | Types-only package | OpenAPI spec |
| --- | --- | --- |
| Who can read it | TypeScript clients built with mion | Any language or tool |
| Validation | The client compiles the same validators the server runs, from the same types | Each tool builds its own from the schema, so they can differ |
| Drift check | The build fails on a mismatch (MET012); the version is also checked at runtime | None built in |
| Version | A hash of the route ids, set by the build | Written by hand |

The closer twin of SERVING a spec is the fetch road (`client: {routes: 'fetch'}`), where the server sends its own
route metadata at runtime and no package is needed. This todo is about the build-time road.

## Direction

What the package must carry for a client to build and run against it, as found while building the
`container/pre-publish-e2e/mion-api-types/` lane (which installs the full package today):

- **The API's `.d.ts`**, as `mion compile` writes it: the routes, the middlewares and the build version.
- **The `mion-pure-fns/` artifact**, whenever the API registers overrides or pure fns its route types use.
  Without it the client computes other ids (MET012) or cannot find a body (PFE9016).
- **The server manifest** (`.mion/api/manifest.json`), so `mion api-check` works in the client's CI.
- **Peer dependencies** on `@mionjs/router`, `@mionjs/core` and `@mionjs/run-types`, plus every library whose types
  the routes name: the `.d.ts` refers to their types (`import("@mionjs/router").PublicRoute<…>`).
- **No server JavaScript.** A client only does `import type {api} from '…'`.

**Built-by-mion marker.** The package carries a marker file written by `mion compile` (with the compiler version
and the build version). A client refuses a types-only package without it, with one clear error naming the package,
instead of a scatter of MKR016 / MET012 / PFE9016 findings from a `.d.ts` some other tool wrote. Plain server and
fullstack builds are unaffected: only the types-only road needs the marker.

Trim the declarations: every type in the generated `.d.ts` that no public route or middleware reaches is removed.
Server-only helpers, internal classes and anything a handler uses but does not take or return must not ship.
What stays is the closure of the public API type (each route's params, return and headers, each middleware's), so
the trimmed file still type-checks on its own and gives the client the same ids.

Constraints already known, which the implementer must plan around:

- Both sides must run the same mion compiler version; override rows of another version are skipped (PFE9017).
- Plain `tsc` writes a TS `private` member as `private name;` with its type erased, and a client reading such a class
  fails its build (MKR016). `mion compile` writes those members as `protected` with their type, so a package it built
  gives the client the server's ids.
- Generated code can change without its id changing (the text in `Symbol('x')`, a lost `@nonEnumerable`
  tag); the version check cannot see it. The open todo about using published artifacts as they are covers it.

Open questions for the implementer: whether this is a `mion compile` flag or its own command, how the package's
`package.json` is produced, and how a monorepo keeps the server and its types package on one version. The
implementer plans the details.

## Docs

New section on `container/website/content/01.rpc/07.devtools/04.cli.md`, after "Building a Client From Published
API Types": publishing a types-only package, with the comparison table above.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- One command builds a types-only package from a mion API: the trimmed `.d.ts`, the pure-fn artifact when there
  is one, the manifest, the built-by-mion marker, and a `package.json` with the peer dependencies.
- A client build fails with one error on a types-only package that has no marker, and a test pins it.
- The trimmed `.d.ts` holds no type that no public route or middleware reaches, and a test pins that.
- A pre-publish e2e lane packs it, builds a client against it with the Vite preset and with `mion compile`
  (bundling and fetching), and runs the client against the real server.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan (approved 2026-10-03)

Decisions taken with the user:
- Own subcommand `mion api-types`.
- Types-only = package.json with NO JS entry; such a package must carry a `mion.apiTypes` package.json field AND the
  marker file it names, else ONE error.
- Default name `<server name>-types`, version copied from the server package.json (`--name` / `--version` override).
- Private and raw middlewares are never published: their types and imports are removed (the reverse of the
  private-fields pass, which forces private members INTO declarations).
- No fuzz test: fixed Go + CLI tests compare ids from trimmed vs full.

### Steps

0. Spec bookkeeping: `git mv docs/maybe/types-only-api-package.md docs/todos/`, append `## Plan (approved 2026-10-03)`.

1. **Declarations-only compile** (`internal/compiler/batchcompile/compile.go`, `declarations.go`)
   - `Options.DeclarationsOnly` + virtual `DeclarationOutDir`; `Result.Declarations`, `Result.PureFnArtifact`, `Result.GenDir`.
   - Use `program.Options.Overrides` (`program/program.go:38`): `declaration`, `emitDeclarationOnly`, outDir/declarationDir = virtual dir, no declaration maps. `emitDeclarationFiles` merges its `IsolatedDeclarations:false` into these instead of replacing them.
   - Run pass 1 + dump + generate (gen dir = temp dir from the CLI), skip transform / pass 2 / JS emit, capture the `.d.ts` in memory. Value splices and private→protected still apply. The user's tsconfig is never touched.

2. **Marker metadata leaf package** `internal/compiler/apitypes/apitypesmeta`: `Marker{Format, Package, Compiler, BuildVersion}`, `ReadPackage(root, fs)` → name, `TypesOnly` (no main/module/browser, every `exports` leaf under `types` or `.d.ts`), the `mion.apiTypes` path, the marker, a problem string. Constants `ApiTypesMarkerFile = "mion-api.json"`, `ApiTypesMarkerFormat = 1`.

3. **Trimmer** `internal/compiler/apitypes` (overlay program over the emitted `.d.ts`, tsconfig `extends` the user's)
   - Entry: exports whose type passes `apimeta.ServerBuildVersion` (same check a client runs); `--entry` overrides; error on zero or several entry files.
   - **Private / raw middleware removal pass** (before reachability). `PublicApi<R>` already maps these keys to `never` (gone from the resolved type), but the emitted text still spells them out inside `PublicApi<{…}>`, with their handler types and imports. The pass deletes them from the text: a key the literal has but the checker's resolved API type lacks is a private/raw entry, so its member is cut out. The reachability step then removes, in cascade, every type and import only those entries used.
   - **Shared types are never lost in the cascade**: every top-level declaration and import binding carries a use count (uses from kept statements, counted across files). Cutting a statement decrements the counts of what it uses; only a count of 0 removes a declaration (and decrements in turn). A type used by both a removed middleware and a public route keeps count ≥ 1 and stays. The final counts are cross-checked against a plain mark-from-roots pass; a mismatch is a command error, never a silent drop. Recurse into nested groups. If the argument is `typeof routes` or a named alias, edit that declaration in place when nothing else kept uses it, else fail naming the type. Cross-check: surviving leaf paths equal the manifest's method ids.
   - Reachability at statement level (a kept class/interface/alias is kept whole, so `protected` members and alias names stay and ids match): roots are the API exports; follow identifiers, relative imports, `export *` / re-export chains and `import()` types across emitted files; drop unreached statements, imports and files; keep `declare global` / `declare module` blocks of reached files; keep or add `export {}`. A bare specifier resolving into the emitted set (a `paths` alias) is an error. External packages are recorded for peer deps.
   - Output: original text sliced by statement range, holes removed, file names unchanged.
   - Validation: standalone type check of the output (`skipLibCheck: false`, output files only), and the build version stored in the trimmed entry and recomputed (`Session.ApiTypeVersion`) must equal the manifest's.

4. **CLI** `cmd/mion/apitypes_cli.go`, `"api-types": runApiTypes` in `main.go` dispatch + usage. Flags: shared flags + `--out` (default `api-types`), `--name`, `--version`, `--entry`. Writes a clean out dir:
   trimmed `.d.ts` tree, `mion-pure-fns/` (verbatim, still owned by the server name), `.mion/api/manifest.json`, `mion-api.json`, `package.json` (`types`, `exports: {".": {"types": …}}`, `files`, `mion: {apiTypes: "./mion-api.json"}`, `peerDependencies`: the 3 `@mionjs` packages + every external package the trimmed `.d.ts` imports + owners of pure-fn deps; ranges from the server's deps / peerDeps / devDeps, `workspace:` → `^<installed>`, else `*`). A server package.json with no `name` is an error. Factor `printBuildDiagnostics` out of `runCompile`.

5. **Client reads pure fns through a renamed package** (`cachegen/purefnindex/purefnindex.go`): accept an index whose `package` equals the types package's marker `Package`; `PackageIndex.Owner`; `Closure` compares same-package deps by owner; `ResolvePackage` also matches a root whose marker serves that owner (the real server package, when installed, still wins).

6. **Client check** `compiler/resolver/apitypes_check.go`, run from `generateApiBundle` over `clientFacts()` (covers bundle AND fetch):
   - New **MET015** (RuntimeError, NotSource, whole program): types-only package without the field / marker, or an unreadable one. One per package, naming it.
   - New **MET016** (Warning): marker written by another mion compiler version.
   - One post-filter drops MET012 / MET013 / MKR016 tied to a refused package. PFE9016 stays (it is an Error; hiding it under a downgradeable code could ship a missing body).
   - Codes in `codes_apimeta.go`, `messages.go`, `prose.go`; regenerate with `pnpm miondevx core codegen diag`.

7. **E2E lane**: extend `container/pre-publish-e2e/mion-api-types/`. `run.mjs` runs `mion api-types` on `libs/api` (adding a raw middleware using node's `IncomingMessage` and a private middleware using a server-only class), packs it, installs it into the clients instead of the full tarball (server still runs from the full tarball): vite + `mion compile`, bundle + fetch, run against the real server, `mion api-check` against the types package's manifest, plus a no-marker variant expecting one MET015. Assertions in `test/api-types.test.mjs` (no JS in tarball, no private/raw middleware names, peer deps). Also add the dir to `.containerignore`.

### Tests

- Go `internal/compiler/apitypes`: unreached statements/files/imports dropped; overloads, merges, namespaces kept whole; re-export chains; `import()` types; `declare global`; `export {}`; `paths` error; zero/several entries; **middleware removal** (raw with `IncomingMessage`, private with `Db`, nested; names and imports gone; same version), `typeof routes` twin, shared-alias error. **Reused types** (each must survive while the middleware-only ones go): a type declared in the same module used by a raw middleware AND a public route; the same with the type imported from another emitted file (the import and the file stay); one imported from an external package (the import and its peer dep stay); a chain where the shared type is reached only through another shared type; one import statement with two bindings where only one is middleware-only (that binding goes, the other stays).
- Go `batchcompile`: declarations-only writes nothing, overrides beat `declaration:false`.
- Go `purefnindex` + `package_purefns_test.go`: artifact under a renamed package with marker works; without marker skipped.
- Go resolver (`apiversion_test.go` style): no marker → one MET015 and no MET012/MET013/MKR016, both client modes; other compiler → MET016; package with `main` unchanged.
- Vitest `packages/devtools/test/compile-cli-mion.test.ts`: `mion api-types` on a server, install output as `node_modules/@acme/api-types`, client compiles clean with the same version, `api-check` passes, package contents checked; the existing hand-built fixture gets a `main` so it keeps testing the full-package road (MET013).
- Marker coverage rule: the client fixture uses both `getRunTypeId` shapes on a type from the types package.

### Docs

- New section in `container/website/content/01.rpc/07.devtools/04.cli.md` after "Building a Client From Published API Types": "Publishing a Types-Only Package" (command, what is inside, private/raw middlewares are left out, the comparison table from the spec). MET015/MET016 prose lands in the generated diagnostics catalog.
- `docs-simplifier` + `comments-simplifier` passes, each committed alone.

### Finish

Gate (`pnpm test`, Go tests, `pnpm run lint`, `pnpm run format`), spec reconciled and `git mv` to `docs/done/`, review-pr (automatic), simplification passes, PR labelled `website` + `pre-publish-e2e`, drive CI green.

