---
type: feature
spec: guidelines
status: done
created: 2026-10-03
---

# Make the api-types package self-contained

## Intent

`mion api-types` keeps an outside type the API reaches as an import, and its package becomes a peer dependency of
the published types package. The client then has to install that package (for example a validation or date library)
only to read types. The package should hold everything the client needs, so the client installs nothing extra.

## Direction

The implementer plans the details. What the maintainer has settled:

- **Print every reached outside type in place.** Every type the API reaches from a package outside the project is
  printed into the types package as a declaration of its own, and the import to that package is dropped. Nothing is
  copied from `node_modules`.
- **What stays a dependency.** Only two groups:
  - the libraries the tsconfig loads (`lib` / `types`). Their globals are the platform types RunTypes treats as not
    data (`ts-go-runtypes/internal/cachegen/runtype/typeid/libglobal.go`). That decision depends on the CLIENT's
    tsconfig, so the package's entry `.d.ts` writes `/// <reference types="…" />` and `/// <reference lib="…" />`
    for what the server loaded: a reference line counts as platform, so both sides agree whatever the client lists.
    A module export of such a package (`import {X} from 'node:url'`) is data and gets printed like any other.
  - the mion packages (`@mionjs/core`, `@mionjs/router`, `@mionjs/run-types`), one copy each on the client.
- **The printer.** Extend the `mion convert` type printer (`ts-go-runtypes/internal/convert/printtype.go`), which
  prints from the RunType graph and already has an id oracle in the convert fuzz lane. Do not use the checker's
  `TypeToString`: it truncates deep types, loses class names and drops JSDoc tags. What the printer must learn, each
  printed so the id equals the original's:
  - **classes**: `declare class Name { … }` with the same name and members, plus `#private;` when the original has
    private fields. The class id is its members, that flag and its name, never a package name (`typeid.go`, the
    `isClass` branch of the structural id).
  - **unique symbols**: the `declare const name: unique symbol;` declaration plus the members keyed by it, same name.
  - **enums**: `declare enum Name { … }` with the same members and values.
  - **recursive types**: a named alias that refers to itself, never an inline expansion.
  - **generics**: the instantiation the API reaches, printed as a named alias.
  - **JSDoc tags that change ids or serializers** (`@nonEnumerable`, format and enrichment tags) are kept.
  - **ambient declarations**: a `declare global` the reached types need is printed into the package as is; a server
    `declare module '<pkg>'` augmentation of a printed package is folded into the printed declaration.
- **Runtime stays the client's job, as today.** The package ships no code for printed types:
  - a printed class deserializes once the client registers the real class; the registry finds it by exact id, or by
    class name when the client's version has different members (`classSerializerRegistry.ts`);
  - a printed enum behaves like a project enum does today (a declaration only, no JS).
- **Pure functions.** Third-party pure functions the client's compiled code needs ship inside the package (today
  their owning package becomes a peer: `reachedArtifact` in `ts-go-runtypes/internal/compiler/apitypes/pkg.go`).
  `@mionjs/run-types`'s own pure functions stay with the run-types peer. When the client also registers a pure
  function with the same id: same body, the first one wins silently; a different body warns.
- **Known limit, documented and not designed around.** When the client also installs the real package and mixes its
  types with the printed ones, a class with private fields, a unique symbol or an enum is a second declaration, so
  TypeScript reports "not assignable". Ids and runtime are unaffected.
- **Acceptance case on hand.** The drizzle reference app (`packages/private-drizzle-example-app`) has routes that
  return plain drizzle row types (`typeof usersDb.$inferSelect`). `apitypes/drizzle_test.go` pins those
  `*.drizzle.d.ts` files as the only ones importing `drizzle-orm` today; once this lands, no `drizzle-orm` import or
  peer ships at all.
- Pointers: outside packages are collected in `followModule` (`apitypes/trim.go`), which is where printing replaces
  the peer; peers are built in `BuildPackage` (`apitypes/pkg.go`).

## Tests

- **Go fixtures in `apitypes/`** with a fake `node_modules`, one case per shape: interface, alias, generic,
  recursive, class (plain, `private`, `#private`), enum, unique symbol brand, interface + namespace merge, `export *`
  chain, `export =`, `exports` subpath, a package depending on another package, `declare global`, a server
  `declare module` augmentation, `@nonEnumerable`, a package in tsconfig `types`, `node:` imports. Each case checks:
  - no peer but the tsconfig libraries and the mion packages;
  - the output type-checks on its own (`apitypes.Check`);
  - id parity: every route parameter and return id computed on the server equals the one computed on a client
    program that imports only the package;
  - data / not-data parity: each type is classified the same on both sides.
- **Client tsconfig mismatch**: the server lists `types: ["node"]`, the client lists nothing, ids still equal.
- **Printer**: extend the convert id oracle and its fuzz lane to classes, unique symbols, enums and recursive
  aliases.
- **api-types fuzz lane** (`apitypes/fuzz_trim_test.go`): it already checks that no unreached package becomes a
  peer; add random reached outside packages and assert none becomes a peer, plus the id parity check.
- **Pure functions**: a shipped third-party pure function, with and without the client registering the same id
  (same body, different body).
- **Class registry**: a printed class deserializes once the client registers the real class, both with the same
  members (exact id) and with different ones (name lookup).
- **Drizzle acceptance**: flip `drizzle_test.go` to zero `drizzle-orm` imports or peers, ids equal.
- **Real install**: the `pre-publish-e2e` lane installs only the types package into a fresh client, builds it and
  compares ids with the server's. Label the PR `pre-publish-e2e`.
- Marker API tests follow the paired `getRunTypeId` call-shape rule in `ts-go-runtypes/CLAUDE.md`.

## Docs

Existing section "Publishing a Types-Only Package" in `container/website/content/01.rpc/07.devtools/04.cli.md`: say
which dependencies the package keeps (tsconfig libraries, mion packages), that every other type ships inside it, that
the client still registers its classes, and the "not assignable" limit when the client also installs the real package.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A client installs only the types package (plus the tsconfig libraries and the mion peers), its build type-checks,
  and it computes the same ids as the server.
- Every shape in the Tests list is covered and passes, the drizzle app ships no `drizzle-orm` import or peer.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan (approved 2026-10-03)

### Context

`mion api-types` keeps every outside type the API reaches as an import, so its package becomes a peer of the
published types package and the client must install it only to read types. Settled with the maintainer: print every
reached outside type into the types package; only tsconfig libraries (lib / types) and the mion packages stay peers;
extend the `mion convert` printer; ids must equal the server's; no runtime code for printed classes / enums; third
party pure functions ship inside. What the printer drops (method type parameters, overloads, statics) is dropped from
the id too, because both come from the same view of the type, so ids still match; the client only gets looser typing
on those parts. A printed id that does not match is a printer bug: the build fails with an internal error.

### Changes

#### 1. Printer declarations (`ts-go-runtypes/internal/convert`)
- New `declprint.go`: `DeclPrinter{Resolve, Table, Origins}` with `PrintAlias`, `PrintClass`, `PrintEnum`,
  `PrintUniqueSymbol`, each building a `printContext` (print.go:30) in type target.
- Classes: members, methods with exact parameter names, accessors (`get`/`set`), function fields as properties,
  `#private;` for `FlagPrivateFields`, `private x;` for typeless private members, `/** @nonEnumerable */` (replaces
  the refusal at print.go:835), `extends Base` with the base printed as its own class (lib bases stay by name).
- Enums: `declare enum` from the enum values; `Name.Member` references (replaces print.go:735).
- Unique symbols: `declare const <name>: unique symbol` + `[name]` keys, name taken from the checker (replaces
  print.go:831); well-known symbols print as `[Symbol.x]`.
- Recursive types: `anonymousCycleDiag` (print.go:74) becomes a hook that invents a named alias.
- Generic instantiations print as named aliases (`Name$n`).

#### 2. Trimmer: replace outside uses (`internal/compiler/apitypes`)
- `textRange` (items.go:75) gains replacement text; `slice` (items.go:480) writes it. Replacements sit in `holes`,
  so reads inside them stop on their own.
- A kept type node is *outside* when it resolves to a declaration in an outside package that is neither platform
  nor mion, or is a `typeof x…` whose root is a project value typed by one. The outermost one is replaced:
  - `Address` → `import("./_outside/geo.js").Address`; the unread import binding drops via `rebuildList`.
  - `PgTableWithColumns<{…}>` → a printed instantiation alias.
  - `typeof usersDb.$inferSelect` → a printed alias of the resolved row type; `usersDb` then drops.
- Printed declarations go to `_outside/<pkg>.d.ts` (one file per outside package). Plain types keep their names;
  classes / enums / unique symbols that collide are wrapped in a namespace so the name (part of the id) stays.
- New `origins.go`: a checker walk that finds the classes, enums and unique symbols a use reaches, so they print
  named and project ones point back at their kept file.
- Platform types (lib, tsconfig `types`, ambient `declare module` in a loaded `@types` package, e.g. `node:http`'s
  `IncomingMessage`) are never printed: their import stays and the `@types` package stays a peer.
- `followModule` (trim.go:489) no longer adds printed packages to `Externals`; any other surviving outside import is
  an internal error naming the file.
- `Trim` (trim.go:61) loops mark → print → keep what printing referenced → drain until stable.
- `Check` (trim.go:112) recomputes every printed and API member id on the check program; a mismatch fails with
  "printing `<pkg>`'s `<Name>` changed its id", an internal error.

#### 3. Ambient
- The entry gets `/// <reference types="…" />` for each tsconfig `types` entry and `/// <reference lib="…" />` for
  each `lib` entry (or the target's default), so the client classifies platform types like the server.
- A `declare global` block a printed type needs is copied into its `_outside` file.
- A server `declare module '<printed pkg>'` augmentation is already merged into the printed type, so it is not kept.

#### 4. Pure functions
- batchcompile (DeclarationsOnly) returns foreign pure fn modules (`renderPureFnArtifact`, resolver/render.go:300).
- `reachedArtifact` (pkg.go:134) vendors a non-mion owner's closure into `.mion/vendor/<owner>/mion-pure-fns/`
  instead of making it a peer; `ParseArtifactIndex`'s own-rows rule stays.
- `apitypesmeta.Marker` gains `Vendored`; `purefnindex.ownerOf` (purefnindex.go:223) serves vendored owners; a real
  install still wins in `ResolvePackage`.
- Runtime: `addPureFn` (packages/run-types/src/runtypes/rtUtils.ts:104) warns when the same id arrives with a
  different body; same body stays silent.

### Tests
- `apitypes/outside_test.go`: one subtest per shape (interface, alias, generic, recursive, class plain / `private` /
  `#private` / accessor / inherited / Error base, enum, unique symbol brand, interface + namespace merge, `export *`,
  `export =`, `exports` subpath, package → package, `declare global`, `declare module` augmentation,
  `@nonEnumerable`, package in tsconfig `types`, `node:` platform and data). Each asserts no peer beyond mion +
  tsconfig `@types`, `Check` passes, and id parity.
- New `apitypes/parity_test.go` `assertIDParity`: writes the package into a fresh client project with only the types
  package and mion stubs, computes ids and data / not-data per API member, compares with the server; includes server
  `types:["node"]` vs client `[]`.
- `convert/roundtrip_test.go` + `fuzz_atoms_test.go`: printed class / enum / unique symbol / recursive alias keeps
  the original id.
- `fuzz_trim_test.go`: reached outside packages on some seeds, no peer, parity; negative control.
- `drizzle_test.go`: zero `drizzle-orm` imports or peers, parity.
- `pkg_test.go` + purefnindex tests: foreign pure fn vendored, resolves, real install wins.
- JS: rtUtils duplicate-body warning; class registry finds a printed class by exact id and by name.
- `packages/devtools/test/compile-cli-mion.test.ts`: outside lib with a class → `_outside/`, no peer.
- e2e `container/pre-publish-e2e/mion-api-types`: add an outside lib (class + enum), assert no peer, flip the
  `@types/node` assertion (test/api-types.test.mjs:106), client builds with `types: []`. PR label `pre-publish-e2e`.
- Fuzzing: extends the two existing fuzz lanes above (id oracle); no new suite.

### Docs
New page `container/website/content/01.rpc/07.devtools/05.api-types.md` ("API Types Package"), since the feature
now has several sections of its own:
- moved from `04.cli.md`: "Publishing a Types-Only Package", "Building a Client From Published API Types",
  "Types-Only Package Compared With OpenAPI" (cli.md keeps a one-line link in their place);
- new sections: "What the Package Contains" (files, `_outside/`), "Dependencies the Client Installs" (tsconfig
  libraries + mion packages, the reference lines), "Classes and Enums From Other Libraries" (printed, client still
  registers its classes), "When the Client Also Installs the Library" (the "not assignable" limit);
- every in-site link to the moved anchors updated (`pnpm exec vitest run website-links` checks it).

### Finish
Gate (Go tests, `pnpm test`, lint, format), review-pr (automatic), docs-simplifier and comments-simplifier passes
each committed on their own, `git mv` the spec into `docs/done/` reconciled with what shipped, open the PR with the
`pre-publish-e2e` label, drive CI green.

### Done when (from the spec)
- A client installs only the types package (+ tsconfig libraries + mion peers), type-checks and computes the
  server's ids.
- Every shape above is covered; the drizzle app ships no `drizzle-orm` import or peer.
- Both simplification passes ran and are committed on their own.

## What shipped

Built as planned, with these differences:

- **Platform types** stay imports, and the entry gets `/// <reference types>` / `/// <reference lib>` lines only for
  the tsconfig libraries kept code actually reaches. A `types` line names the tsconfig entry as written (a subpath
  included). `lib` lines skip the `es*` and `decorators*` libs, which every client target already loads, so only
  libs such as `dom` get one. A `declare global` block of another package needs no copy: printing resolves its types
  structurally.
- **A use the printer cannot keep** (one naming a type parameter, a heritage clause in a script file, a printer
  refusal) stays an import with a warning and keeps its package a peer, instead of failing the build. The tests and
  the fuzz lane count any warning as a failure, so a refusal cannot slip in unseen.
- **The id check lives in `Check`**: it type-checks the package, reads its build version and compares every API
  member's id with the server's (`Output.apiIDs`); a moved id fails the build as an internal error.
- **Printer details:** method type parameters print as `unknown` (the id reads them that way); statics are left out
  (not in the id); members print sorted by name, because merged declarations list them in the order the compiler
  bound the files, which varies; a recursive shape prints once as a named alias shared by every use; a class with an
  abstract member prints `abstract`; a refused class or alias refuses every later use. The checker types printing
  reads are kept only for api-types (`KeepTypes`) and dropped on a program swap.
- **Printer shape follows TypeScript's node builder.** The declaration printer is `convert/printdecl.go`
  (`DeclPrinter`, `TypeToString`, `expandClassDecl`, `expandEnumDecl`, `serializeTypeAlias`, `LayoutDecls`,
  `MakeUniqueName`), not a new `declprint.go` with `PrintClass` / `PrintEnum`. Its modes are named print flags
  inside the shared switch arms, a class body goes through the object member printer plus class modifiers (as
  `typeElementsToClassElements` / `addClassModifiers`), and a recursive shape is one the serializer flagged
  `IsCircular`. `TestPrintersCoverRunType` gives every `RunType` field a declaration-printing decision too, and
  `TestPrinters_EveryKindHasAnArm` makes every kind name the arm that prints it or be refused. On the trimmer side,
  one switch, `visitTypeUse`, reads every syntax node that names a type, with one `transformX` arm per kind as
  TypeScript's `visitDeclarationSubtree` does; `TestOutside_EveryTypeNodeKindHasARow` gives every type syntax kind a
  row. A declaration's kind is asked through `DeclKind.KeepsItsName` / `HasHome`, each one switch that a test runs for
  every kind.
- **A class or enum from a mion package** inside a printed type stays a `import("@mionjs/…")` reference, and that
  package becomes a peer like any other mion package.
- **Pure functions** of other packages are vendored through the pure fn store's closure into
  `.mion/vendor/<owner>/mion-pure-fns/`, which the marker (format 2, only when something is vendored) lists. The
  client's pure fn index serves a vendored copy only from the types package's own `.mion/vendor/`, and falls back to
  it when the installed copy of that package lacks the id; a real install that has the id wins. A mion package stays
  a peer without a warning; a package that is not installed or ships no artifact stays a peer with a warning. No
  duplicate-body warning was added: a pure fn id is the hash of its shipped body, so two copies under one id are the
  same code.
- **Found and fixed on the way:** a shipped file holding only an augmentation or globals was never loaded by a
  client (it loads what the entry reaches), so its members went missing; the entry now references each such file.
  The fuzz lane's new client-parity oracle found it, along with two printing gaps it also fixed (a mapped `X[K]`, a
  conditional's true branch). A global declared in a project script file (no import or export) was dropped even
  when the API read it; it now ships, referenced from the entry the same way. A package file named `lib.*.d.ts` is
  no longer taken for the bundled lib, and a printed declaration never takes a name a format import uses.
- **Review items left as they are:** splitting an earlier fuzz commit and rewording old commit bodies (a history
  rewrite for no behaviour change, the regression tests landed on their own); a heritage prefix carried outside the
  placeholder text (the flag has to travel with the text the trimmer reads back); dropping the parity test's own
  server id computation (it checks the `apiIDs` plumbing independently); unexporting the printer's `Decls` (the
  external test package needs it); `lib` lines for `es*` feature libs (noise, a client already targets at least
  the server's ES edition).
- **Docs:** a new page, `container/website/content/01.rpc/07.devtools/05.api-types.md`, holds the types-only
  package sections moved off the CLI page plus the new ones.
- **Tests:** `apitypes/outside_test.go` (one fixture per shape, each checked on a bare client by `assertIDParity`),
  `apitypes/parity_test.go`, the fuzz lane's `lib-pkg` positions and client-parity oracle, `convert/printdecl_test.go`,
  the flipped drizzle test, `pkg_test.go` + `purefnindex_test.go` for vendoring, `convert/printdecl_fuzz_test.go`
  (the `convert-decl` seed lane), two devtools CLI tests (a printed package, and the type-parameter warning), a
  run-types class-registry test over both call shapes, and the pre-publish e2e lane's `@acme/geo` fixture (an
  interface, an enum and a `#private` class).
