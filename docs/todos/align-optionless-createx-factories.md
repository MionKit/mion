---
type: chore
spec: guidelines
status: ready
created: 2026-09-29
---

# Give every createX factory the same three parameters

## Intent

Most createX factories take `(value or RunType, compile-time options, id the compiler fills in)`, so the id is
always the third argument. Two do not: `createFormatTransformFn` (`packages/run-types/src/createRTFunctions.ts`)
and `createJsonSchemaFn` (`packages/run-types/src/standard/createJsonSchemaFn.ts`) have no options slot, so their
id is the second argument. The source gives a reason next to the factories ("Leaf families take no options: a
slot would let callers pass values the Go emitter silently ignores"). The maintainer wants every factory aligned
anyway, so callers and tools see one shape.

## Direction

The implementer plans the details. Constraints:

- Switch both to the three-slot shape (for example `createTypeFnArgsFunction` with an options type that accepts
  nothing yet, or a real option if one is wanted), and drop the option-less `createRTFunction` helper when it has
  no callers left. Replace the "Leaf families take no options" comment with the new rule.
- The scanner finds the id slot from the signature, so the Go side should need no change; confirm it.
- Any hand-written call that passes the id itself (test harnesses, `packages/run-types/test/util/deserializeRTFunctions.ts`)
  needs the extra `undefined`.
- Tests: both call shapes still resolve for both factories.

## Docs

The factory list on the runtypes "all compiled functions" page, if it shows parameters.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every createX factory takes value or RunType first, options second, the compiler-filled id third.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
