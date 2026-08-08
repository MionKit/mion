---
type: feature
spec: full-plan
status: ready
created: 2026-08-08
---

# Format conversion — completion (phases 2–8)

## Intent

Finish the format conversion layer whose scaffolding + atomic slice shipped in
[done/format-conversion-layer.md](../done/format-conversion-layer.md) (read its
"Shipped" section first — it records the landed architecture and the decided
divergences). The converter (`ts-runtypes convert`, leaf
`ts-go-runtypes/internal/convert/`) already proves the whole mechanism on
atoms: recognition, projection, three printers, import management, id-exact
chain oracles, the `embedType` escape and the first `jsType` dialect rows.
This todo carries everything else. **The per-feature mapping tables in the
done doc remain the authoritative action list** — do not re-derive them.

## Remaining work, in the shipped plan's phase order

1. **Formats** (cut from phase 1): the reverse mapping `FormatAnnotation
   (name+params)` → `TF.*` call / standard schema keywords / `jsFormat`
   fallback, one printer row per format family, pinned against the generated
   `FormatName` roster. Needs a per-family params table (the door's forward
   mapping is the reference); the id oracle catches every mis-mapping.
2. **Arrays + tuples + structural params bags; label-capable builders** via
   the `__rtLabels` sentinel + `jsLabels` (restores the pinned
   `callableBuilder.test.ts` divergence to convergence).
3. **Objects**: optional/readonly (`jsReadonly`), `@nonEnumerable` spellings
   (`propMod` option + `jsNonEnumerable`), member JSDoc/`description`
   carriage (populate `RunType.Description`), index signatures, records,
   patternProperties/propertyNames, key counts, closedness, `jsMeta`,
   symbol-keyed members.
4. **Unions/intersections/enums (via `embedType`)/oneOf/anyOf/not.**
5. **Circulars**: `RT.circular`/`self()`, `$defs`/`$ref` both directions,
   hoisting rules, embedded cross-references, multi-file sets end-to-end
   (imports retargeting is built; the cross-file reference policy — error
   outside the set — activates here).
6. **Natives**: Date/RegExp/Map/Set/Promise/Temporal (`jsType` +
   `typeArguments`), classes via `embedType`, function/method/callable
   signatures.
7. **Schema tail**: conditionals/dependents (desugared print), `unevaluated*`
   reconstruction, content keywords, boolean subschemas, template literals.
8. **Ship gate**: website guide page + `packages/examples` code-imports,
   ARCHITECTURE (drop the "experimental" tag) / ROADMAP / FUZZING updates.

## Carried obligations (decided in the shipped plan, not yet built)

- **The JS fuzz lane** `pnpm rtx core fuzz convert` under
  `packages/ts-runtypes/test/fuzz/convert/`: reuse `core/typeGen.ts`, drive
  the real CLI per iteration, oracles C1–C5 over the full generated space plus
  **C6** (serialized reflection-graph deep-equality across legs — the
  no-info-loss oracle) and the `--portable` coverage census. The shipped
  Go-side seeded sweep (`internal/convert/fuzz_atoms_test.go`) stays as the
  fast lane; widen its space alongside the printers until the JS lane
  subsumes it.
- **CLI e2e via the JS harness** (spawn the binary over a tmp fixture
  project: `--check`, `--out-dir`, `.tsx`, exit codes, marker-rule pairs).
- **CNV diagnostics into the catalog** (`internal/diagnostics` + gen-diag-catalog
  regen) once the lint surfacing wants them on the wire.
- **Marker-call-site rewrite on `--to type`** (`createValidateFn(myRT)` →
  `createValidateFn<MyType>()`) replacing today's `CNV003` skip.
- **No-info-loss inventory completion**: per-row goldens; `Description`
  population (the audit confirmed it and `DefaultVal` do not fold into the id,
  so only C6 can catch them).

## Done when

The shipped plan's own "Done when" (see the done doc) holds in full: every
kind/feature converts in all six directions with pinned goldens, the dialect
is complete (pure-data keyword or documented `embedType` escape per kind),
labels converge, the JS fuzz lane C1–C6 is green including soak, imports and
multi-file sets work end-to-end, and the website documents the command.
