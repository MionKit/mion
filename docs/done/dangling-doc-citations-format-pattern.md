---
type: fix
spec: guidelines
status: done
created: 2026-07-29
completed: 2026-08-01
---

# Dangling doc citations in format-pattern sources and tests

## Intent

Incidental finding while investigating the pattern/mockSamples surface: three load-bearing comments cite documentation files that do not exist on disk, so the "read the source doc" pointers dead-end for anyone following them.

- `packages/ts-runtypes/src/formats/string/string-patterns.ts:11` cites `docs/format-pattern-typelevel.md` — no such file.
- `packages/ts-runtypes/test/features/mockSoundness.test.ts:3` cites `docs/done/mocking-gaps-format-transforms-and-domain-allowedvalues.md` — not in `docs/done/` (12 files, none pattern/mock related).
- `packages/ts-runtypes/test/features/mockSoundness.test.ts:4` and `ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go` (near the `:392` "every format param is id-relevant" note) cite `docs/done/format-pattern-samples-dedup-and-length-soundness.md` — also missing.

## Direction

Likely the docs were renamed or removed after the code landed. Implementer decides per citation: repoint to the file's current home if it moved, or rewrite the comment to carry the one or two facts it was outsourcing (the mockSoundness header already summarizes its contracts, so trimming the links may be enough). Check `git log --follow`/`git log --diff-filter=D` for the old paths before assuming they never existed. No behavior change; comments only.

## What the full sweep found

The three cited above were a sample, not the population. Applying the "Done when"
grep across all of `packages/` and `ts-go-runtypes/` turned up **126 dangling
citations across 95 files, pointing at 40 distinct missing docs**. The heaviest
single target was `docs/UNSUPPORTED-KINDS.md` with 42 citations.

The intent's guess ("renamed or removed") resolves to **removed** in every case.
The repo history (the local clone is shallow by default; `git fetch --unshallow`
is required before any of this is visible) shows three deliberate prune commits:

- `80b740bd` "docs cleanup" — deleted 17 design docs / 4504 lines with **zero**
  additions, including `UNSUPPORTED-KINDS.md`, `atomic-types.md`,
  `CROSS-FAMILY-RT-DEPS.md`, `DEMAND-DRIVEN-FN-CACHES.md`, `port-status.md`,
  `value-first-formats.md`.
- `04596519` "docs(claude): restructure CLAUDE.md" — deleted **137** files under
  `docs/`, also with zero additions: the `docs/done/` archive purge. This is the
  source of every dangling `docs/done/*` and `docs/todos/*` pointer.
- `bcb8279f` "Drop mion references" — deleted `value-first-typecheck-cost.md`
  and `format-pattern-typelevel.md`.

Because these were pure deletions with no relocation, **repointing was not an
option for any of them** — the content does not exist anywhere in the tree
today. (`docs/AI_ENRICHMENT_TEST_PLAN.md` was the one plausible fold-in
candidate, deleted in `5f86ca9c` alongside a large `AI_ENRICHMENT.md` rewrite,
but `AI_ENRICHMENT.md` carries no test-plan content, so it was treated the same
way.)

## What shipped

126 sites rewritten, one per citation. Every site turned out to be a trailing
"see also" pointer whose surrounding prose already carried the fact, so the
uniform fix was to drop the pointer and keep the sentence grammatical:

- `... for free. See docs/UNSUPPORTED-KINDS.md "Wire format".` → `... for free.`
- `... (see docs/X.md).` → `...`
- Where the removal left a bare clause, the spec NAME was folded into prose
  instead of dropped, so the breadcrumb survives without pretending a file
  exists: `Regression for docs/done/verr-record-array-disagreement.md.` →
  `Regression for the verr/validate record-vs-array disagreement.`
- Where a line lost its only content (`// See docs/X.md.`), the line was
  deleted.
- Where the removal left a 2-word ragged continuation line, the comment block
  was reflowed.

**One citation was repointed rather than removed:** `enrichModel.ts:8` cited
`docs/talks/.../framework-fuzzy-testing.md` with a literal `...` elision. The
real file exists, so the full path was written out.

## Out of scope: `docs/` prose carries the same rot

This spec's "Done when" scoped the sweep to code comments — `packages/` and
`ts-go-runtypes/` — and that is what shipped. The same purged specs are ALSO
cited from inside `docs/` itself, which was never in scope and is deliberately
left alone here. It is a different job, not more of the same one:

- These are inline **markdown links whose text is part of the sentence**
  (`see [docs/done/oxlint-diagnostics-plugin.md](./done/…)`), so each needs the
  sentence reworded rather than truncated — the mechanical pass that handled 126
  code comments does not apply. They are also relative links GitHub renders, so
  they are visible 404s for a reader rather than stale comments.
- A blind sweep would **destroy evidence**: some of those citations are bug
  reports NAMING the missing files (this very document's own Intent section, and
  `docs/done/stale-docs-drift-cluster.md`). Fixing them would delete the finding.
- Two apparent hits in `docs/talks/…/research/` are false positives — substrings
  of external GitHub URLs, not local paths.

Tracked and fixed separately in
[#310](https://github.com/MionKit/ts-run-types/pull/310): 19 citations across 6
files (`ROADMAP.md`, `AI_ENRICHMENT.md`, `FUZZING.md`,
`done/reconcile-publish-docs-to-token-model.md`,
`maybe/support-circular-refs-validation.md`,
`done/mock-format-registry-side-effect-import.md`), leaving the evidence
citations and the URL false positives in place.

## Verified

- The "Done when" grep returns **zero** dangling paths across `packages/`,
  `ts-go-runtypes/internal/`, and `ts-go-runtypes/cmd/`.
- `gofmt -l` clean; `go -C ts-go-runtypes build ./...` and
  `go -C ts-go-runtypes test ./internal/...` green.
- `pnpm test` green: 241 files / 8316 tests passed.
- `pnpm run lint` and `pnpm run format` green.

Comments only — no behavior change anywhere in the diff.

## Done when

- [x] Every doc path cited from `packages/` and `ts-go-runtypes/internal/` (grep for `docs/` in comments) resolves to a real file, or the citation is gone.
