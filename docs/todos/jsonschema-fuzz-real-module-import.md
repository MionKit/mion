---
type: chore
spec: guidelines
status: open
created: 2026-08-03
---

# Let the FromJsonSchema fuzz import the REAL module (drop its atomic stand-ins)

## Problem

`test/fuzz/jsonschema/jsonSchemaFuzz.integration.test.ts` verifies that the
schema-door lowering (`FromJsonSchema<S>`) and the hand-written type-first
spelling resolve to ONE structural id. The schema-door side references the real
format brands (`Email`, `Base64`, `String`, `Number`, `FormattedArray`,
`FormattedObject`, `OneOf`, …). Because the fuzz can't reach the real modules
(below), it feeds the sliced `#region jsonschema-extract` block a set of
**stand-in** brand types. `FormattedArray` / `FormattedObject` / `OneOf` are now
the REAL definitions (sliced via `#region structural-slice` / `#region
oneof-slice`), but ~10 atomic brands (`Email`, `UUID`, `Base64/32/16`,
`JsonContent(Base64)`, `StringDate/Time/DateTime`, `Domain`, `IPv4/6`, `Url`,
`StringFormat`, `NumberFormat`) are still hand-written copies of the shipped
types' structure.

The budget test (`jsonSchema.compile.test.ts`) was already switched to import the
REAL `FromJsonSchema` + formats graph (it runs the real `tsc`, which reads disk).
The fuzz can't do the same today.

## Why the fuzz can't just import the real module

The fuzz drives the Go resolver in **serve/ops mode** (`serve --sources ops`,
`ResolverClientOptions.serverMode`). That mode builds a per-request Program whose
root files are EXACTLY the overlay keys (`setSources({...})`) — a pure in-memory
filesystem. A fixture that `import`s `../../../src/json-schema/fromJsonSchema.ts`
does not resolve against the real source tree there, so `FromJsonSchema<S>`
degrades to `unknown` and every schema collapses to one id (empirically: the
constant `Zlx1z5X`). Verified twice — the import resolves but the type degrades,
and pointing the child at the package tsconfig (`openClient(sizing, tsconfigPath)`
was tried) made no difference, because serve/ops does not consult a project
tsconfig / does not overlay on a real Program.

The **batchcompile** path already overlays rewritten sources ON TOP of the real
program (see `ts-go-runtypes/internal/compiler/batchcompile/compile.go` header,
"the rewritten sources OVERLAID at the same paths"). serve/ops does not.

## Fix (sketch)

Teach the resolver's serve/ops mode to overlay the virtual `setSources` files ON
the real on-disk program (rooted at the client `cwd`), the way batchcompile does,
so a fixture can import real source by relative path and pull the real graph.
Then in the fuzz:

- fixture: `import type {FromJsonSchema} from '<real relative>/fromJsonSchema.ts'`;
- overlay the fixture at a real-mirroring key so relative imports resolve;
- delete `buildJsonSchemaModule`, all atomic stand-ins, and the `#region
  jsonschema-extract` / `structural-slice` / `oneof-slice` markers + their
  slicing (the real module supplies every type);
- keep `FUZZ_FORMAT_PREAMBLE` (the type-first raw-sentinel oracle — INDEPENDENT by
  design; importing the real type there would make the convergence check
  tautological).

Ends with zero hand-written format types in the fuzz. The real-type convergence
is already covered meanwhile by the dedicated suites (`contentFormats`,
`boundAliases`, `structuralKeywords`, `formatLengthOverrides`), so this is a
test-fidelity + de-duplication win, not a coverage gap.

## Risk / size

Touches the core Go resolver's program construction — the riskiest area. Gate on
the full JS suite + `go -C ts-go-runtypes test ./internal/...` and confirm the
other serve/ops consumers (the general type fuzz, enrich fuzz, the 28 RUNTYPES_DTS
resolver suites) are unaffected.
