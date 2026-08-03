---
type: feature
spec: guidelines
status: blocked
created: 2026-08-03
---

# Add TypeBox as a third document reader once Schema.Compile ships

Blocked on an upstream release. Raised while building the JSON Schema
spec-conformance section
([json-schema-spec-conformance-section.md](../done/json-schema-spec-conformance-section.md)),
which today compares only ts-runtypes and ajv because they are the only two
libraries that can take a schema document as input.

## Why it is blocked

TypeBox's next major adds a `Schema.Compile` entry point that consumes a plain
JSON Schema document:

```ts
const VectorB = Schema.Compile({
  type: 'object',
  required: ['x', 'y', 'z'],
  properties: {x: {type: 'number'}, y: {type: 'number'}, z: {type: 'number'}},
})
```

That is exactly the door the conformance section needs. It is **not published**:

- Pinned in the bench image: `@sinclair/typebox@0.34.49`. Its main entry exports
  no `Schema` at all (verified by enumerating the ~200 exports).
- Latest on npm at the time of writing: **0.34.52**. No 1.x, and the only
  prereleases are `0.32.0-dev-*`.
- Empirically, on the pinned build: `TypeCompiler.Compile({type: 'string'})`
  fails with `Preflight validation check failed to guard for the given schema`,
  and `Type.Unsafe({type: 'string'})` compiles to `Unknown type`. The compiler
  dispatches on TypeBox's own `Kind` symbol, which a plain document lacks.

A git dependency is not an option: the bench `_deps` policy is registry-only
(`allowNonRegistryProtocols: false`) with exact pins and a 30-day
`minimumReleaseAge`.

## Direction

When TypeBox 1.x publishes:

1. Bump `container/benchmarks/_deps/competitors/typebox/package.json` and
   rebuild + republish the website image (`pnpm rtx container push website`).
2. Add `container/benchmarks/competitors/typebox/specCases.ts`, importing the
   shared documents exactly the way `competitors/ajv/specCases.ts` does. It must
   NOT re-author them; the point is that all readers compile the same bytes.
3. Add `'typebox'` to `SPEC_COMPETITORS` in
   [scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)
   and in `buildSpecBench` in
   [scripts/website/bench-data/gen-docs.mjs](../../scripts/website/bench-data/gen-docs.mjs).
   Both lists are deliberately one line each so this stays a small change.
4. Update the Correctness page prose, which currently states that only two
   libraries can read a document.

Expect divergences rather than a clean column, and treat them as findings about
TypeBox rather than about us. Two are already proven on 0.34.x: it accepts
`propertyNames` and `dependentRequired` into a schema object and never compiles
either into a check. Also note TypeBox targets **Draft 7** while the corpus is
2020-12, so tuple-shaped cases (`prefixItems` versus `items: [...]`) may need a
per-case note.

## Done when

The conformance table shows a third column, populated from the same shared
documents, and any TypeBox divergence is either explained on the page or filed.
