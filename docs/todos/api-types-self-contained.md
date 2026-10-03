---
type: feature
spec: guidelines
status: ready
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
