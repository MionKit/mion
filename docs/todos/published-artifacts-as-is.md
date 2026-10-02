---
type: feature
spec: guidelines
status: ready
created: 2026-10-02
---

# Use what a mion-built package publishes as-is

## Intent

A client that reads a mion-built package recomputes the package's type ids and generated code with its own
tsconfig and library versions. The build version check (`MET012`, a client hashing its route ids against the
`ApiBuildVersion` the server's `.d.ts` carries) catches ids that drift. It cannot catch code that changes while
its id stays the same, for example the text inside `Symbol('x')` (read from the initializer in source, from the
name in a `.d.ts`) or a `@nonEnumerable` tag lost to `removeComments`. The consumer should use the package's
published ids and generated functions as they are.

## Direction

Extend the existing pure-function artifact (`dist/mion-pure-fns/`, read by `cachegen/purefnindex`) to the
type-function caches and route ids a package's API needs: the package ships them, and the consumer's compiler
serves them on demand instead of recomputing. The implementer plans the details.

## Docs

`container/website/content/01.rpc/07.devtools/04.cli.md`, existing section Building a Client From Published
API Types, and `container/website/content/02.runtypes/02.guide/09.pure-functions.md`, existing section Using Pure Functions From
a Package.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

A client built from a published package uses the package's ids and generated code unchanged under a different
tsconfig, pinned by a pre-publish e2e case. The simplify-docs pass ran on every touched page and the
simplify-comments pass on every touched source file, each committed on its own.
