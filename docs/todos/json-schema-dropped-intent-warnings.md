---
type: feature
spec: guidelines
status: ready
created: 2026-08-02
---

# Warn when an accepted schema keyword's intent is dropped

The doctrine is "a constraint can never go missing without you hearing about
it", and the reject rows honor it loudly. But a small class of ACCEPTED
keywords carries intent the pipeline cannot honor, and today they are
silently read-and-ignored:

- `readOnly: true` at a NON-property position (root, items, combinator
  members). At property positions it now lifts to the `readonly` modifier,
  so only the unliftable positions drop intent.
- `writeOnly: true` anywhere (no read/write direction modeling exists).
- Any future annotation-with-intent in the same class.

## Why no existing channel can carry the warning

- The RESOLVER never sees the schema: the door is deliberately type-level
  only ("zero Go-side changes" in runTypeFromJsonSchema.ts), so the engine's
  Warning diagnostics cannot fire on schema content.
- The LINT plugin's rules are pure routers over resolver wire diagnostics
  (eslint/index.ts states the single-diagnostics-engine doctrine); no
  local-AST rule lane exists yet.
- The TYPE level has only errors, and an error would block real-world
  OpenAPI documents over an annotation the spec says is non-constraining.

## Shape

Add the first LOCAL-AST rule lane to the shared lint plugin (the oxlint
jsPlugin and the ESLint adapter are one module): a rule that finds
`runTypeFromJsonSchema({...})` literals, walks the schema object tracking
whether the current node is a `properties` VALUE, and reports a WARNING for
`readOnly: true` at unliftable positions and `writeOnly: true` anywhere,
each message naming the guide's annotations section. This is an explicit,
documented exception to the router-only doctrine (update the eslint/index.ts
header note), and the lane then exists for future schema-literal hygiene
warnings. Tests ride the existing oxlint-e2e + eslint adapter suites.

## Done when

- Both lint surfaces warn on the two spellings with position-accurate spans,
  quiet on lifted/ordinary annotations; rule listed in oxlint-recommended.
- The guide's annotations paragraph mentions the warning.
- eslint/index.ts documents the local-rule exception.
