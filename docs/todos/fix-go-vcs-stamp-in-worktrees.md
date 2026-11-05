---
type: fix
spec: guidelines
status: ready
created: 2026-11-05
---

# Stop worktree Go builds stamping the main checkout's git state

## Intent

A Go build ID should depend on the source, not on what another checkout is doing. Today `go build` in a `.claude/worktrees/`
worktree reads the main checkout's git state, so the build gate fails when that checkout moves.

## Evidence

Failing case: `a linux slot stamp that disagrees forces the cross-build compare, then re-stamps` in
`packages/devtools/test/build-gate.test.ts`. It is Mac-only, so CI never runs it.

```text
-> Replacing mion-bin/mion-linux-arm64 (stale: build ID mismatch)...
```

Measured in a worktree at `09c7d87a9`, with the main checkout on `feat/class-accessors-as-props` at `867b5bc2f`:

```text
build  vcs.revision=867b5bc2f9d762e9d36293d54878558ee7a8332e
build  vcs.time=2026-11-05T21:07:28Z
build  vcs.modified=true
```

- That revision is the main checkout's HEAD. `vcs.modified=true` is its 23 uncommitted files. The worktree itself is clean.
- A worktree's `.git` is a file, so Go walks up to the main checkout's `.git` directory.
- Empty commits and edits inside the worktree left the build ID the same. A commit in the main checkout changed it.

## Direction

Pass `-buildvcs=false` in `checkStampedGoBin` in `scripts/core/build.mjs`. First check that nothing reads `vcs.*` from the
binaries.

## Done when

- The build ID stays the same when the main checkout commits or gets dirty, and the case passes from a worktree.
- Comment simplification pass done.
