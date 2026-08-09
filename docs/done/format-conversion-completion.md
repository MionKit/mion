---
type: feature
spec: full-plan
status: done
created: 2026-08-08
completed: 2026-08-09
---

# Format conversion — completion (phases 2–8)

## Intent (as filed)

Finish the format conversion layer whose scaffolding + atomic slice shipped in
[format-conversion-layer.md](format-conversion-layer.md): the remaining kind
ladder (formats, composites, circulars, natives, schema tail), the ship gate
(website docs, examples, roadmap), and the carried oracle obligations (C6,
the fuzz lane wiring, CLI e2e).

## Shipped

Everything below is id-oracle-verified per conversion leg (C2), C6-verified
against the canonical reflection graph, chain-tested (type → builders →
json-schema → type), idempotence-pinned (C5) and swept by the seeded fuzzer
(`pnpm rtx core fuzz convert`, arms for every row; `RT_FUZZ_SEED` replays,
`RT_FUZZ_ITER` widens):

- **Formats, complete.** Generic families print their pretty spellings
  (`TF.String<{…}>` / `TF.string({…})`); named presets print the exact
  `TypeFormat<base, name, params>` constructor where the pretty spelling is
  not provably identical (defaults merge); uuid's enumerated versions print
  `TF.uuid/uuidv4/uuidv7`; every family rides `jsFormat` on the schema
  target; bigint-param families embed (JSON cannot carry bigint).
- **Structural param bags** (`FormattedArray`/`FormattedObject` +
  contains/patternProperties/propertyNames/closedness) across all targets.
  Bags whose values equal a 2020-12 default (`minItems: 0`,
  `minProperties: 0`, `uniqueItems: false`) EMBED on the schema target — the
  standard keyword reads back as absent and would drop the brand (fuzz find).
- **Objects, remaining:** readonly members now convert on the schema target
  via the whole-object embed; method / call-signature members (type target
  prints signature syntax, builders/schema escape the whole object; readonly
  callables print property-arrow form since method syntax cannot spell
  `readonly` — fuzz find); quoted keys; string-keyed records.
- **Enums, classes, natives:** enum references print the live symbol
  (`Color` / `getRunType<Color>()` / `embedType<Color>()`) with an in-scope
  check (aliased imports refuse loudly); user classes print
  `RT.classType(User)` (generic instantiations escape through `getRunType`);
  RegExp joins the natives (`RT.regexp()` + the new `jsType: 'RegExp'` door
  row beside Date/Map/Set/Promise).
- **Functions & template literals:** the type target prints arrow types with
  their reflected parameter labels (labels fold into the id) and reconstructs
  backtick template spellings; builders/schema ride the `getRunType` /
  `embedType` escapes.
- **Brand metadata (TypeMeta):** `string & {readonly __brand: 'email'}`
  round-trips — the type target restores the intersection, builders/schema
  escape it whole. (This is where TS intersections live on the wire — the
  serializer collapses them, so there is no residual KindIntersection row.)
- **Circulars:** self-cycles close at the root in every target
  (`RT.circular` + `RT.self()` ⇄ `{$ref: '#'}` ⇄ the type's own name);
  mutual cycles inline the partner in builders/schema (a name reference
  would make the const's type self-referential) while the type target keeps
  both names; cycles through a NAMED inner declaration convert by reference.
- **Cross-declaration references & multi-file sets:** a run converts files as
  a SET (`convert.BuildSet`); declarations that reference each other stay
  name references in every target, imports are added (`import {type B}`) and
  pruned (a builders-const import the conversion made unused), and a
  reference to a convertible declaration OUTSIDE the set errors (CNV004) —
  the decided policy — instead of inlining silently.
- **Ship gate:** website guide page
  (`container/website/content/02.guide/11.converting-forms.md` +
  `packages/examples/src/guide/convert-forms.ts`), ARCHITECTURE (experimental
  tag dropped), ROADMAP (shipped row), FUZZING.md (the convert lane),
  `rtx core fuzz convert` registration, the CLI e2e suite
  (`packages/ts-runtypes-devtools/test/convert-cli.test.ts`: --check /
  --out-dir / .tsx / exit codes / --portable, plus the marker-pair
  compile-diff — both `getRunTypeId` call shapes compile to the same
  injected id before and after conversion).
- **C6, the no-info-loss oracle** (`internal/convert/canonical.go`): every
  leg's declarations must also be equal as CANONICAL REFLECTION GRAPHS — the
  net for fields the id ignores (Description, DefaultVal). The projection's
  exclusion list is documented in the file header and pinned by a
  field-coverage tripwire test; union member order is compared sorted (the
  id folds unions order-insensitively and the checker reorders between
  sessions — C6's first fuzz find).

## Decisions logged during the finish run

1. **Enum builders spell `getRunType<Color>()`, not `RT.enum(Color)`.** The
   enum builder carries the VALUE union (`E[keyof E]`), which reflects to a
   different graph (and id) than the enum type. Assignment-equivalent is not
   id-equivalent; the conversion contract is id-exactness. (Pre-existing
   behavior of `enumType`, surfaced by the oracle — not changed by this PR.)
2. **Enum MEMBER references normalize to their literal value** (`Color.Red`
   → `0`): the reflected graph models a member as its literal, so the ids are
   equal by construction and no information moves. The member-reference
   spelling itself is not recoverable (the container name is not reflected);
   single-member nodes that DO carry the `enumMember:` flag refuse.
3. **Readonly members embed on the schema target; no `jsReadonly` keyword.**
   The door deliberately dropped the standard `readOnly` modifier lift
   (annotation-only per 2020-12), and a dialect keyword would need a
   four-way mapped-type split taxing every object translation. The
   whole-object embed carries the modifier exactly, at zero door cost.
4. **Functions/template literals/brands escape in builders** via
   `getRunType<…>()` rather than `RT.func`/`RT.templateLiteral`: the
   value-first spellings default parameter labels / part groupings, which
   fold into the id (the pinned callableBuilder divergence). The escape is
   id-exact by definition. Label-capable builders remain their own roadmap
   line; when they land, the printer can switch spelling without moving ids.
5. **`--portable` inlines in-set references** (embedType is dialect) — a
   portable schema is self-contained by intent, and inlining is id-exact.
   Everything dialect-only refuses under the flag (CNV006).
6. **`@nonEnumerable` members and parameter defaults refuse** (CNV001): both
   carry reflection information with no printed spelling (the first folds
   into the id; the second is C6-visible), so conversion refuses rather than
   silently dropping them.
7. **Temporal refuses** (`CNV001 "Temporal types are not convertible yet"`):
   conversion output would depend on the consumer's lib gating story, which
   is the Temporal roadmap line's problem, not this feature's.
8. **Marker-call-site rewrite on `--to type` stays out** (the
   `createValidateFn(myRT)` → `createValidateFn<MyType>()` rewrite): CNV003
   now scans the WHOLE program (not just the file) before converting a const
   away, so the failure mode is a loud refusal, never a broken call site.
9. **CNV codes stay CLI-local** — catalog + wire registration lands with the
   lint surfacing that would consume them (nothing reads them off the wire
   today).
10. **The Go-side sweep IS the convert fuzz lane** (registered as
    `rtx core fuzz convert`). It drives the same `ConvertFile` the CLI calls,
    directly against the checker — a JS lane spawning the binary per
    iteration would test the same code slower. The CLI plumbing is covered
    by the e2e suite instead. The lane found six real bugs during this run
    (edit ordering at offset 0, union-member precedence, embeds at
    `additionalProperties`, default-valued structural params, intersection /
    arrow parenthesization under suffixes, readonly callables) plus a
    PRE-EXISTING serializer bug: method/call-signature parameters interned
    under a colliding empty-id key, the last projection overwriting the rest
    (fixed in `internal/cachegen/runtype/serialize.go` with its own commit).
11. **Structural twins print as references**: an inline shape structurally
    identical to a named in-set declaration converts to a reference to that
    name (same id — same type). First declaration wins on collisions;
    atoms/literals/format leaves always stay inline.
12. **Alias-of-alias declarations reference their target** (`type C = B` →
    `const cRT = getRunType<B>()`), preserving the authored indirection.

## Known refusals (loud, by design)

Generic declarations (CNV002), labeled tuples (label-capable builders
pending), cycles that never pass through a named declaration root, enum
member references, aliased imports of live symbols, Temporal, mixed
named+index objects, non-string index signatures, symbol-keyed members,
`@nonEnumerable` members, parameter defaults, stacked negations / contains /
propertyNames, pattern-scoped closedness on the schema target, and dialect
spellings under `--portable`. Each reports a per-declaration CNV diagnostic;
the declaration stays untouched and the exit code is non-zero.

## Deliberately not carried forward

The remaining ideas from the original plan that did not survive contact:
`jsLabels`/`jsIndexKeys`/`jsMeta`/`jsReadonly` dialect keywords (superseded
by the embed escapes — each would have taxed the door's hottest paths for
spellings the escape already carries exactly), the schema-tail
reconstruction of `if/then/else` / `unevaluated*` sugar (inputs already
convert through their resolved graphs; re-printing the sugar is authoring
cosmetics the id cannot see), and a separate JS fuzz lane (decision 10).
Labels remain the one true sub-project, tracked on the roadmap.
