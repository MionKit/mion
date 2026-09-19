---
type: chore
spec: guidelines
status: done
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

- [x] `git ls-files` no longer lists `ts-go-runtypes/gen-run-type-kind`.
- [x] `.gitignore` covers Go build artifacts under `ts-go-runtypes/`, so a rebuilt
  binary never shows as untracked noise or gets committed again.
- [~] The blob is absent from history, and the repo is measurably smaller: done
  on the 8 side branches, blocked on `main` and `prod` by a repository rule (see
  Outcome). The remainder is its own `docs/todos/` spec.
- [x] Everyone with a clone has been told they need to re-clone or reset (this
  doc and the PR description).
- [x] `pnpm miondevx core codegen all --check` and
  `go -C ts-go-runtypes test ./internal/...` still pass, proving the generator
  still works from source.

## Plan — untrack, ignore, sweep, rewrite (approved 2026-09-19)

1. Rewrite history first, in a fresh `git clone --mirror` with `git filter-repo
   --invert-paths --path ts-go-runtypes/gen-run-type-kind`. The rewrite is limited
   with `--refs <de6a41cf7^>..<branch>` to the commits after the one that added the
   blob: an unrestricted run also rewrote every older commit, tag and dead branch
   (5355 of 6706 commits changed), which is churn nothing needs. Only the 10 refs
   that hold the blob are rewritten; no tag holds it.
2. `git rm --cached` the file and add `ts-go-runtypes/.gitignore`: an
   extensionless file at the module root or inside a `cmd/<x>/` dir is a build
   output (Go sources always carry an extension), plus `*.exe`.
3. A fourth whole-tree sweep in `scripts/ci/check-tree.mjs`,
   `compiledExecutables()`: the first four bytes of every tracked file, flagged on
   an ELF or Mach-O magic, or a PE magic on a mode `100755` file.
4. Tests in `packages/devtools/test/repo-contracts.test.ts`: the classifier on
   fixture headers, and `git check-ignore --no-index` on the ignored and kept
   paths. `ci-lane-contracts.test.ts` pins the sweep count at four.
5. No website docs (contributor-only). One line in `ts-go-runtypes/CLAUDE.md`.

## Outcome

Shipped: steps 2 to 5 as planned, and the rewrite on every branch the push rules
allow. `git filter-repo` (2.47, limited to `de6a41cf7^..<branch>`) rewrote the
3110 commits after `de6a41cf7` on all 10 branches holding the blob; the
mirror's branches and tags then referenced it from zero commits. The 8 side
branches were force-pushed:

| branch | before | after |
| --- | --- | --- |
| chore/finding-json-size-bound | b6c777540 | 20efb2db0 |
| chore/finding-jsonsize-binary-view | bc2254a35 | 58abe08c0 |
| claude/error-handling-review-qp9zc4 | e486e1e3f | ea57d407e |
| claude/lucid-mccarthy-c4n9qm | 9ff5ec830 | 591481939 |
| claude/mion-binary-serialization-pr-keyuly | b4d79b681 | f439a46e8 |
| claude/per-route-encoder-strategies-6if7av | 414be08a7 | 0bb178f97 |
| docs/router-doc-drift | dd435318b | 7df291b8c |
| todo/test-ci-missing-runtypes-projects | 9dbc1df57 | d1c256f61 |

Not shipped: `main` (1062e86a0, rewritten as 083d5de4b) and `prod` (83669a5c3,
rewritten as ac0e1494b). GitHub refused both pushes with `GH013`: the ruleset
forbids force-pushes and non-PR changes on those branches, and on `main` also
merge commits (the 16 history-join merges are re-created by the rewrite, so the
push trips that rule too). Lifting the rules needs the repository owner, so the
force-push of those two branches is a separate `docs/todos/` spec with the full
procedure. Until it runs, every fresh clone still carries the blob through
`main`; the mirror measured 64.05 MiB of packs before and 62.25 MiB after.

Every clone of a rewritten branch must be reset, never merged: `git fetch origin
&& git reset --hard origin/<branch>`, and any local work on top of it rebased
onto the new tip. A merge of the old and new lines would bring the blob back.
