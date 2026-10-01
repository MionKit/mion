---
type: fix
spec: guidelines
status: ready
created: 2026-10-01
---

# One Code List for Format Params That Never Fail

## Intent

Three places each keep their own list of format params that can never produce a validation error:

- Go: `nonFailingParams` in `ts-go-runtypes/internal/enrichment/enrich.go` (scaffold skips them, FT003
  rejects them): `isCurrency`, `mockSamples`, `multipleOfTolerance`, `transform`.
- TypeScript: the `NonFailingParams` type in `packages/run-types/src/enrich/friendlyText.ts`, the same four
  names, hand mirrored.
- The bench contract test `packages/devtools/test/bench-lane-contracts.test.ts` (describe "the shared cases
  never assert a presentation-only format tag as failable") does not use either list. It scans the JSDoc in
  `packages/run-types/src/formats/` for the phrases `NEVER a failable constraint` or
  `PURE PRESENTATION METADATA` and expects exactly `['float', 'isCurrency']`.

Two problems:

1. **A comment is test data.** Rewording the `isCurrency` or `float` JSDoc silently changes what the test
   guards. A comment cleanup pass already dropped the phrase once and the test failed:
   `expected [ 'float' ] to deeply equal [ 'float', 'isCurrency' ]`.
2. **The lists disagree.** `float` never fails (the Go emitter says "`float` never produces an error" in
   `ts-go-runtypes/internal/cachegen/typefunctions/formats/numeric/numberformat.go`), but it is in neither
   `nonFailingParams` nor `NonFailingParams`. It is also listed in `knownConstraintKeys`
   (`ts-go-runtypes/internal/enrichment/mirror/merge.go`). So enrichment likely scaffolds, and the
   FriendlyText type likely requires, an `rt$errors` message for `float` that can never show. Confirm with a
   repro first.

## Direction

- Make the TypeScript list a real exported constant (for example `NON_FAILING_PARAMS` as a readonly tuple)
  and derive `NonFailingParams` from it.
- Point the bench contract test at that constant instead of the comment regex, and drop the two magic
  phrases' special role (the comments stay as plain explanations).
- Add `float` to the Go and TS lists if the repro confirms the bug, with a Go test and a TS test that fail
  without it. Decide whether `float` belongs in `knownConstraintKeys`.
- Keep Go and TS in sync with a test rather than a "MIRROR of" comment, if a cheap one fits (for example a
  test that reads the Go map, or a generated file).
- The implementer plans the details.

## Docs

Only if the FriendlyText or enrichment pages say which format params need a message. Check
`container/website/content/` for `float` and `isCurrency` in the enrichment pages.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

One code list (plus its Go twin) defines the params that never fail, the bench contract test reads it, no
test depends on comment wording, `float` is handled the same everywhere, tests pin the fix, and the
simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
each committed on its own.
