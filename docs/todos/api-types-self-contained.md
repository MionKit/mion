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

The implementer plans the details. What the maintainer has settled so far:

- **What stays a dependency.** Only the libraries the tsconfig lists (`lib` / `types`): those are treated as native
  types already, and RunTypes treats any type from them as not data-only. Every other package the API reaches gets put
  inside the types package. The mion packages need a decision of their own (below).
- **How to put a type inside.** Two candidates, pick the simpler and cheaper one that keeps type ids equal:
  - print the resolved type in place of the reference (the maintainer's hunch: simpler);
  - copy the reached declarations of that package under the types package and point the import there.
  Watch recursive types, classes, generics and declaration merges, which a printed type can lose.
- **Pure functions.** Third-party pure functions the client's compiled code needs ship in the package too
  (today they make their owning package a peer: `reachedArtifact` in
  `ts-go-runtypes/internal/compiler/apitypes/pkg.go`).
- **Open question: `@mionjs/run-types`.** It may need to stay a peer. Think through what happens when a pure function
  ships inside the package and the client also has run-types installed: duplicate copies, clashing ids, which one wins.
  Settle the general rule before building.
- Pointers: externals are collected in `followModule` (`apitypes/trim.go`); peers are built in `BuildPackage`
  (`apitypes/pkg.go`). The api-types fuzz lane under `apitypes/` already checks that no unreached package becomes a
  peer; extend it so a reached outside package does not either.

## Docs

Existing section "Publishing a Types-Only Package" in `container/website/content/01.rpc/07.devtools/04.cli.md`:
say which dependencies the package keeps and that everything else ships inside it.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A client installs only the types package (plus the tsconfig libraries and the decided mion peers) and its build
  type-checks and computes the same ids as the server.
- The run-types / pure function question is answered and the answer is tested.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
