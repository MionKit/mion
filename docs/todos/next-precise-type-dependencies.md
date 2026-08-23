---
type: feature
spec: guidelines
status: ready
created: 2026-08-23
---

# Declare precise type dependencies to the Next.js loader

## Intent

A file's rewrite depends on types declared in OTHER files, and Turbopack cannot
see that: it only knows the import graph. Without a declared dependency it will
happily serve a cached, stale rewrite after a type changes somewhere else, which
is a silent-wrong-output failure rather than a crash. Next 16.3's persistent
build cache makes it worse, because a stale result now survives across builds.

The Next adapter handles this today with a coarse stamp. The broker tracks the
generated module set (content-addressed names, so a changed type means a changed
listing), writes a digest to `<genDir>/types/.rt-stamp`, and every rewritten file
declares that one path through `this.addDependency`. Correct, but it means ANY
type change re-runs EVERY marker-bearing file.

The blast radius is bounded (only files the scan found sites in are transformed
at all, and a transform is a couple of milliseconds), so this is a real but
modest cost, not a correctness gap. It is worth replacing with the precise thing.

## Why it could not be done in this task

The resolver wire carries no per-file type-dependency graph. `TransformResult`
is `code` / `map` / `importBlock` / `edits` / `sourceHash` / `emittedModules`,
and `siteFiles` on the generate response is the set of files that CONTAIN marker
sites, not the set of files a given rewrite DEPENDS on. There is nothing precise
to declare without adding it on the Go side first, which is a protocol change
rather than a plugin change.

## Fix plan

1. Go side: while walking a call site's type, record the source files the walk
   actually read (the declaration file of every type and member it touched).
   `internal/compiler/resolver` already has that information in hand while
   resolving; it is only discarded.
2. Protocol: add the per-file dependency list to `TransformResult` (say
   `typeDeps: string[]`), documented as absolute program paths, in
   `internal/protocol` and its JS mirror `src/protocol.ts`.
3. Broker: return `typeDeps` on the reply, alongside (then instead of) `stamp`.
4. Loader: declare each entry with `this.addDependency` rather than the stamp.
5. Keep the stamp as the fallback for the case where the resolver reports no
   deps, so a gap in the Go-side recording degrades to today's behaviour rather
   than to stale output.

## Tests

- Extend `packages/ts-runtypes-devtools/test/hot-update-overlay.test.ts`: after
  editing a type source, assert the reported `typeDeps` for a dependent file
  names that source, and that a file with no relationship to it does NOT.
- The e2e lane (`container/pre-publish-e2e/apps/smoke-next`) already proves the
  build end to end; add a second build after a type edit asserting the injected
  id changed, which is what a stale cache would break.

## Notes

Verify against Turbopack's persistent build cache
(`turbopackFileSystemCacheForBuild`, new in 16.3), not just an in-process dev
session: the whole point is surviving a cache that outlives the process.
