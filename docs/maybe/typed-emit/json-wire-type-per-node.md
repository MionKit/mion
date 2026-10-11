---
type: feature
spec: guidelines
status: ready
created: 2026-10-11
---

# JSON wire type printed per node, proven against the encoder

## Intent

Typed encoders and decoders need the exact JSON wire shape of each type: what the encoder writes and
the decoder reads (a Date is an ISO string, a bigint a digit string, a Set an array, a Map
`[key, value][]`, …). `JSONShape<T>` (`packages/run-types/src/runtypes/jsonShape.ts`) already spells
that shape at the TypeScript level, mirroring the Go emitters, but nothing prints it per node and
nothing fuzzes it. Build on it: a Go printer that writes the concrete wire type of every node, and
tests that keep the printer, `JSONShape<T>` and the real encoder in agreement.

## Direction

- Keep `JSONShape<T>` as the public TypeScript type; the Date wire stays an ISO string.
- Add a wire mode to the type printer (`ts-go-runtypes/internal/convert`, a flag in `printFlags`,
  checked inside the arms, per the visitor rule in `ts-go-runtypes/AGENTS.md`). It prints each node's
  wire type inline, with no reference to user declarations.
- Cover every JSON strategy the encoder has (clone, mutate, compact), unions and their envelopes, and
  the corners `JSONShape`'s header lists as best-effort.
- Test like DataOnly: type-level tests (`test/types/jsonShape.test.ts`), a printer coverage test per
  kind, and a fuzz lane: for generated types and values, the encoder's output parsed from JSON must
  satisfy the printed wire type (tsc) and match `JSONShape<T>` (follow the fuzzy-testing skill; the type
  fuzz harness is `packages/run-types/test/fuzz/type/typeFuzzHarness.ts`).
- The implementer plans the details.

## Docs

`container/website/content/02.runtypes/`: the page that documents `JSONShape` (grep the content tree),
existing section; note the printed wire type only if it becomes user-visible.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The Go printer writes the wire type for every RunType kind and strategy, with a coverage test.
- A fuzz lane proves encoder output always matches the printed wire type and `JSONShape<T>`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
