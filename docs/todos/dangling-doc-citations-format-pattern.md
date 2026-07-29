---
type: fix
spec: guidelines
status: ready
created: 2026-07-29
---

# Dangling doc citations in format-pattern sources and tests

## Intent

Incidental finding while investigating the pattern/mockSamples surface: three load-bearing comments cite documentation files that do not exist on disk, so the "read the source doc" pointers dead-end for anyone following them.

- `packages/ts-runtypes/src/formats/string/string-patterns.ts:11` cites `docs/format-pattern-typelevel.md` — no such file.
- `packages/ts-runtypes/test/features/mockSoundness.test.ts:3` cites `docs/done/mocking-gaps-format-transforms-and-domain-allowedvalues.md` — not in `docs/done/` (12 files, none pattern/mock related).
- `packages/ts-runtypes/test/features/mockSoundness.test.ts:4` and `ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go` (near the `:392` "every format param is id-relevant" note) cite `docs/done/format-pattern-samples-dedup-and-length-soundness.md` — also missing.

## Direction

Likely the docs were renamed or removed after the code landed. Implementer decides per citation: repoint to the file's current home if it moved, or rewrite the comment to carry the one or two facts it was outsourcing (the mockSoundness header already summarizes its contracts, so trimming the links may be enough). Check `git log --follow`/`git log --diff-filter=D` for the old paths before assuming they never existed. No behavior change; comments only.

## Done when

- Every doc path cited from `packages/` and `ts-go-runtypes/internal/` (grep for `docs/` in comments) resolves to a real file, or the citation is gone.
