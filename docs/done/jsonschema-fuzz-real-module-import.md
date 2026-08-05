---
type: chore
spec: guidelines
status: done
completed: 2026-08-05
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

## What shipped — and why no resolver change was needed

The premise above is right: serve/ops builds its program from the overlay keys
alone. The wrong conclusion was that a fixture therefore cannot reach the real
sources. It can — by putting them IN the overlay.

`test/fuzz/core/srcOverlay.ts` reads the whole `src/` tree and hands it to
`setSources` alongside the fixture. `src/` imports nothing non-relative (its
only bare specifiers live in comments), so the graph closes with no stubs, and
the fixture imports the shipped `FromJsonSchema` by relative path.

Deleted from the json-schema fuzz as a result: `buildJsonSchemaModule`, all ~10
atomic brand stand-ins, both `#region` slices and their extraction helpers. The
translation module is now one line:

```ts
export type {FromJsonSchema} from './src/json-schema/fromJsonSchema.ts';
```

Verified to be reading the real tree rather than passing vacuously: breaking the
shipped lowering (`format: 'uuid'` mapped to `Email`) makes the fuzz fail with a
translation violation; reverting it makes it pass again. It runs 100 generated
types per batch.

The same helper removed the last hand-written `TypeFormat` copy from the
binary-size fuzz (`TYPE_FORMAT_OVERLAY`, two files instead of the whole tree).

## What is deliberately still hand-written

`FUZZ_FORMAT_PREAMBLE` (typeGen.ts) — the `Fz*` aliases are the INDEPENDENT
type-first oracle the translation is checked against. Importing the shipped types
there would compare a type with itself and the convergence check would pass by
construction. Independence is the point.

`test/fuzz/enrich/i18nModel.ts` still writes inline brand intersections into the
`.ts` source it generates: that fixture is a scaffolded project on disk with no
package resolution, and the brand is incidental scaffolding for a fuzz about
FriendlyText/MockData reconciliation, not about the format encoding. The Go side
accepts the string spelling permanently (see
[structural-brand-symbol-keys.md](structural-brand-symbol-keys.md)), so it cannot
silently break — but it would keep testing an older encoding, so it is worth
revisiting if that fixture ever gains package resolution.
