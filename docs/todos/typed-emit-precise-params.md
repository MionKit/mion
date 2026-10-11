---
type: feature
spec: guidelines
status: ready
created: 2026-10-11
---

# Typed emit: precise parameters and typed calls in function bodies

## Intent

In emitMode 'ts' only the boundaries are typed: inside a body every value is `any`, a validator takes
`unknown`, and an encoder or decoder types its JSON side `unknown`. Native compilers optimize from
types, so the bodies need real ones where the generator knows them: every parameter (outer fn, inner
fn, ctxFn helpers) and every pure-fn and rtUtils call gets its resolved type, printed inline (no
references to outside type modules or user declarations). No parameter stays `any` or `unknown`.
Other locals and expressions keep what TypeScript infers: there is no extra data to type them with.

## Direction

- Validators take the expected type: `(v: T) => v is T`, so a native compiler can specialize the call
  before validation runs. Errors validators the same.
- Encoders (prepare / stringify) are fully typed: input `T` at each node, output the node's JSON wire
  type. Decoders (parse / restore) take the wire type and return `T`. The wire type comes from a
  per-node wire printer built on `JSONShape<T>` (Date stays an ISO string); build that first.
- Print each parameter's type inline from the RunType node it receives (`internal/convert` printer),
  replacing `v: any`, ctxFn `any` params and the loose-family `as unknown as` casts
  (`typefunctions/tsmark.go`, `walker.go`, `createFnInContext`, the emitters). Pure-fn and rtUtils
  calls follow the exact typing of those calls. The `T_<id>` type modules may then shrink to boundary
  use or go away.
- Restore mutates `v` in place today (`json_restore.go`), which a typed body cannot express; the
  emitter may need a new local per node.
- The code string must stay byte-identical to emitMode 'both' (strip parity, the `typedemit` lane).
- The implementer plans the details; it may split by family (validators, encoders, decoders).

## Docs

Existing section "Typed Output" in
`container/website/content/02.runtypes/01.introduction/04.configuration.md`: update the example and
what is typed.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No generated parameter is `any` or `unknown`, validators included, and no factory casts through
  `unknown`; pure-fn and rtUtils calls are exactly typed.
- Strictest-tsconfig checks and the `typedemit` fuzz lane stay green; strip parity holds.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
