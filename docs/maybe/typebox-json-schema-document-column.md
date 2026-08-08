# Add TypeBox as a third document reader once Schema.Compile ships

**Status:** maybe — parked 2026-08-08, no commitment to implement. It needs a
TypeBox release that does not exist yet, and there is no announced date for it, so
this is not schedulable work. Revisit if TypeBox 1.x ships and a third column in
the conformance table still looks worth having.
**Created:** 2026-08-03 (as item 6 of
[bench-website-e2e-followups.md](../done/bench-website-e2e-followups.md); the
other five items shipped and that spec is done).
**Type:** feature. **Spec depth:** guidelines — the direction below is sound, but
anyone picking it up should re-verify the API against whatever TypeBox has
published by then rather than trusting these notes.

Raised while building the JSON Schema spec-conformance section
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

- Installed in the bench image: `@sinclair/typebox@0.34.49`. Its main entry
  exports no `Schema` at all (verified by enumerating the ~200 exports).
- Latest on npm: **0.34.52** (published 2026-07-11; re-checked 2026-08-08). No
  1.x, and the only prerelease line is `0.32.0-dev-*`.
- Empirically, re-verified 2026-08-08 against the build actually installed in the
  bench image (`0.34.50` — the manifest's `^0.34.0` had floated up from the
  `0.34.49` the original spec named). Every door a plain document could go
  through is shut:

  | call | result |
  | --- | --- |
  | `Value.Check({type: 'string'}, 's')` | throws `Unknown type` |
  | `Value.Check({type: 'object', …}, {x: 1})` | throws `Unknown type` |
  | `TypeCompiler.Compile({type: 'object', …})` | throws `Preflight validation check failed to guard for the given schema` |

  Both the dynamic checker and the compiler dispatch on TypeBox's own `Kind`
  symbol, which a plain document lacks. Note this is not merely "no fast path":
  TypeBox cannot read the document at all.

  Attaching `Kind` ourselves would make it work, and that is exactly what must
  NOT happen — the column would then measure a RunTypes-authored adapter wearing
  TypeBox's name, and the conformance table's whole claim is that every reader
  compiles the same bytes.

**Correction (2026-08-08):** the original spec said a git dependency "is not an
option" because the bench `_deps` policy is registry-only with exact pins. That is
wrong on both counts, and the real policy is worth knowing before anyone plans
around it. `allowNonRegistryProtocols: false` is the **root** workspace's setting
([pnpm-workspace.yaml:119](../../pnpm-workspace.yaml)); the bench workspace
([container/benchmarks/_deps/pnpm-workspace.yaml](../../container/benchmarks/_deps/pnpm-workspace.yaml))
does not set it. What that file sets is `blockExoticSubdeps: true`, which blocks
exotic **transitive** sources while its own comment says "direct deps may declare
any source", plus a 30-day `minimumReleaseAge` that a git ref would simply
bypass. Nor are the bench pins exact: `savePrefix: ''` only governs `pnpm add`,
and the manifest declares `^0.34.0`.

So a git dependency is technically possible. It is still the wrong move: it would
make the one library being measured the only unaged, non-registry input in the
image every benchmark number comes from. Wait for the release.

The caret range matters for step 1 below: because the manifest says `^0.34.0`, a
plain image rebuild will **not** pick up a 1.x on its own. The bump has to be
explicit.

## Direction

When TypeBox 1.x publishes:

1. Bump `container/benchmarks/_deps/competitors/typebox/package.json` and
   rebuild + republish the website image (`pnpm rtx container push website`).
2. Add `container/benchmarks/competitors/typebox/specCases.ts`, importing the
   shared documents exactly the way `competitors/ajv/specCases.ts` does. It must
   NOT re-author them; the point is that all readers compile the same bytes.
   Add the new file to `competitors/typebox/tsconfig.json`'s `include`, so
   `pnpm rtx bench typecheck` covers it (that gate landed with item 1).
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
