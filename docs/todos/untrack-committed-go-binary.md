---
type: chore
spec: guidelines
status: ready
created: 2026-08-31
---

# Untrack the committed gen-run-type-kind binary and purge it from history

## Intent

`ts-go-runtypes/gen-run-type-kind` is a 3.2 MB compiled Linux ELF executable
committed to the repo. It is a stray `go build` artifact, not a source file, and
every clone of this repo pays 3.2 MB for it forever.

It was swept in accidentally on 2026-08-08 by `de6a41cf7`
("refactor(go): extract the reflection model into internal/reflection").

Surfaced while renaming the `@ts-runtypes` namespace: the old package name is
baked into the binary's compiled payload, so it showed up as an unreachable
reference that no source edit could fix.

## Direction

Verified before filing:

- **It is the only committed executable in the repo.** A sweep of every
  `100755` file in `git ls-files` returns exactly this one.
- **Nothing depends on it.** Every caller runs the generator from source via
  `go run ./cmd/gen-run-type-kind`, including
  [scripts/miondevx.mjs:144](../../scripts/miondevx.mjs:144). Its source lives at
  `ts-go-runtypes/cmd/gen-run-type-kind/`, so deleting the artifact loses
  nothing.
- **`.gitignore` has no pattern for Go build outputs at all**, so the same
  mistake can happen again with any other `cmd/` binary.

Two parts, and the second one is the reason this is not a one-liner:

1. **Untrack and ignore.** `git rm --cached` the file, then add a `.gitignore`
   pattern. Make the pattern cover the general case (any `cmd/` build output
   landing in `ts-go-runtypes/`), not just this one filename, or the next stray
   binary lands the same way.

2. **Purge it from history.** The maintainer wants the 3.2 MB blob gone from
   past commits, not merely untracked going forward. **This rewrites shared
   history**, so it needs care: every existing clone has to re-clone or hard
   reset, and any open branch or PR built on the old history must be rebased.
   Coordinate the timing before running it.

The implementer plans the details: which rewrite tool, the exact ignore pattern,
and the sequencing against any in-flight branches. Note that the
`chore/rename-ts-runtypes-namespace` line of work is in flight at the time of
filing, so a rewrite should probably wait until it has landed.

## Done when

- `git ls-files` no longer lists `ts-go-runtypes/gen-run-type-kind`.
- `.gitignore` covers Go build artifacts under `ts-go-runtypes/`, so a rebuilt
  binary never shows as untracked noise or gets committed again.
- The blob is absent from history, and the repo is measurably smaller.
- Everyone with a clone has been told they need to re-clone or reset.
- `pnpm miondevx core codegen all --check` and
  `go -C ts-go-runtypes test ./internal/...` still pass, proving the generator
  still works from source.
