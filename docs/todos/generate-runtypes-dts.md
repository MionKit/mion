---
type: chore
spec: full-plan
status: ready
created: 2026-08-08
---

# Stop hand-maintaining `RUNTYPES_DTS` — one canonical fixture, generated or read

Split out of [fuzz-undocumented-type-duplication](../done/fuzz-undocumented-type-duplication.md)
(2026-08-08), which fixed the other duplications and left this one because it is
a codegen design, not a tidy-up.

## Problem

There are TWO hand-written `declare module '@ts-runtypes/core'` stand-ins of the
public marker surface, and they call each other mirrors while having already
drifted apart:

- `packages/ts-runtypes-devtools/test/helpers/inline.ts` — `RUNTYPES_DTS`,
  71 lines. Loaded by every plugin test AND every fuzz harness
  (`type/typeFuzzHarness.ts`, `roundtrip/roundtripHarness.ts`,
  `binary/binarySizeFloors.test.ts`, `jsonschema/jsonSchemaFuzz.integration.test.ts`).
- `ts-go-runtypes/internal/testfixtures/runtypes.d.ts` — 53 lines, used by the
  Go resolver tests.

A line diff shows they differ in declaration set, ordering, and commentary, not
just formatting: the JS one carries `ValidateOptions` / `ValidateFn` and other
runtime-adjacent shapes the Go one lacks; the Go one carries doc comments and a
slightly different factory roster. Neither fails when `src/markers.ts`,
`src/createRTFunctions.ts`, `src/overrideRTFunctions.ts`, or `src/standard/`
change — the copy silently keeps testing the old surface, which is the failure
mode the fuzz harness's no-hand-copies rule exists to prevent. This is the
single largest hand-written copy in the test infrastructure.

## Direction

Decide between two shapes (investigate first, the tradeoff is real):

1. **One canonical fixture, two readers.** Promote one file (probably the Go
   fixture, since the Go tests cannot read across the package boundary as
   cheaply) and make `inline.ts` `readFileSync` it. Cheap, kills the
   mirror-of-a-mirror immediately, but the surviving copy is still
   hand-maintained against `src/`.
2. **Generate it.** A `gen-runtypes-dts` sibling of the existing `gen-*` /
   `extract-*` codegen commands (cmd/), deriving the `declare module` body from
   the shipped `src/` declarations, with a `--check` mode wired into
   `pnpm rtx core codegen all --check` so CI fails on drift. Strictly better,
   but the derivation has judgment in it: the fixture deliberately SIMPLIFIES
   (e.g. a minimal `DataOnly` stand-in) because the resolver's scanner only
   needs the marker signatures, not the full type machinery — a naive dump of
   `src/` would slow every harness compile and could change scan behaviour.

Either way, the first step is reconciling the existing drift: diff the two
fixtures declaration-by-declaration, decide which differences are load-bearing
(the resolver keys on trailing `InjectRunTypeId<T>` params declared in the
marker module), and land the merged surface with both test suites green before
touching the mechanism.

## Done when

Exactly one hand-written (or zero, if generated) copy of the fake marker module
exists; JS and Go tests consume the same bytes; drift against `src/` either
fails CI (option 2) or is at least confined to one file (option 1); the
`srcOverlay.ts` exception list is updated to match.
