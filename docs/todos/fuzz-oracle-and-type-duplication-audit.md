---
type: chore
spec: guidelines
status: ready
created: 2026-08-05
---

# Audit the fuzz suites: are the oracles generic, and what types are we duplicating?

## Intent

The fuzz lanes look like they carry per-Format / per-Type assertions that belong
in ordinary tests, and they sustain a hand-written parallel type hierarchy that
duplicates shipped types largely to serve those assertions. Before adding
anything else to them, work out whether we are fuzzing correctly.

The principles to measure against:

- A fuzz oracle is a property that holds over the WHOLE generated space — "any
  generated type's mock value validates against that type", "the compiled clone
  equals the reference interpreter". Not "does format X accept string Y"; that is
  a regular test.
- The random type GENERATOR is itself a component that must be correct, and
  deserves its own oracle (a string type can never have children, and so on). Its
  output feeds every other oracle, so a wrong generator quietly weakens all of
  them.
- To check that a type and its equivalent JSON Schema spelling resolve to one id,
  the schema spelling should be emitted BY the generator from a single source of
  truth, not re-derived by a parallel hand-written hierarchy kept in sync by hand.
- An assertion that runs identically on every seed is not a fuzz property.
  `FzUri` pinning the output of the `PresetFormat` / `FormatDefaults` merge is a
  fixed unit assertion in a fuzz costume.

## Direction

Investigate and recommend; do not fix. The implementer plans the changes.

Cover every lane `pnpm rtx core fuzz` exposes: `unit | value | types |
jsonschema | cloning | enrich | i18n | typemod | race | sidecar | patterngen`.

**Classify each oracle** as a generic property or a fixed assertion. Cross-check
against the numbered invariant catalogue in [FUZZING.md](../FUZZING.md) § "The
oracle layer" (O1–O7, TR1–TR4, O15–O17) — that catalogue looks like the right
model already, so the question is mainly which checks live outside it and why.

**Inventory every duplicated definition.** Known starting points:

- `FUZZ_FORMAT_PREAMBLE` in
  [test/fuzz/core/typeGen.ts](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts).
  Note the two tiers are not equally justified: `FzTF` / `FzNot` / `FzString` /
  `FzNumber` restate the raw sentinel encoding (`__rtFormatName` /
  `__rtFormatParams`) the Go scanner reads, which is genuinely independent;
  `FzEmail` / `FzUri` / `FzIri` / … restate post-merge params including whole
  regex sources, and there are nine more of them as of 2026-08-05.
- [test/fuzz/enrich/i18nModel.ts](../../packages/ts-runtypes/test/fuzz/enrich/i18nModel.ts)
  (~line 120) — an inline brand intersection, already flagged as worth revisiting
  in [jsonschema-fuzz-real-module-import.md](../done/jsonschema-fuzz-real-module-import.md).

**Re-examine the blanket no-import rule** in
[test/fuzz/core/srcOverlay.ts](../../packages/ts-runtypes/test/fuzz/core/srcOverlay.ts)
(the header comment, ~lines 14-18). Its stated reason — "importing the shipped
types would compare a type with itself and the convergence check would pass by
construction" — looks overstated. A door row (`readonly uri: Uri`) and the brand
it names are separate declarations, so a wrong mapping still fails against an
imported oracle. Evidence from 2026-08-05: `test/features/formatLengthOverrides.test.ts`
and the whole `test/suites/id-integrity/` suite import shipped brands, and both
caught the `hostname` / `uri` remapping and the `ipv4` params change. What an
import genuinely stops checking is narrower: the post-merge params shape — which
is a fixed assertion, and one leaf proves it as well as nine do.

Read [jsonschema-fuzz-real-module-import.md](../done/jsonschema-fuzz-real-module-import.md)
first for the history: one de-duplication round already ran (it deleted ~10
stand-in brands by putting the real `src/` tree in the resolver overlay) and it
explicitly carved out `FUZZ_FORMAT_PREAMBLE` as "the ONE deliberate exception".
This audit asks whether that carve-out was right; the nine aliases added on
2026-08-05 grew it rather than shrank it.

## A worked example: the id-convergence check

The clearest case, and the one that motivated this todo. The json-schema fuzz
lane asserts, per generated fixture:

```ts
getRunTypeId<FzUri>() === getRunTypeId(jsonSchemaOf({type: 'string', format: 'uri'}));
```

"a format keyword and its type-first spelling resolve to one structural id".

**Why it is not a fuzz property.** The set of format keywords is fixed and small
(16 today). There is nothing to explore: every seed re-runs the same handful of
comparisons, so a random draw is strictly worse than enumerating them — it covers
less and takes longer. Sampling only beats enumeration when the space is too big
to enumerate, and this one is a lookup table.

**It is already a regular test, twice over.**
`test/suites/id-integrity/jsonSchema.test.ts` runs exactly this comparison for
every case in the validation + format-validation suites, and
`test/features/formatLengthOverrides.test.ts` covers the length-sibling variants.
Both are enumerated, both import the shipped brands, and both caught the
2026-08-05 `hostname` / `uri` remapping and `ipv4` params change — the fuzz lane
added nothing the enumerated tests missed.

**What the fuzz lane should keep.** The genuinely unbounded part: that the door
and the type-first spelling still converge once leaves are *composed* — nested
objects, unions, optionality, tuples, `$defs` / `$ref`, negation. That space is
combinatorial and worth sampling. It does not need per-format aliases, only
leaves already known to be equivalent, which is what the enumerated id-integrity
suite establishes.

**The consequence to check.** If the per-format comparison moves out (or is
recognised as already living outside), the per-format `Fz*` aliases lose their
reason to exist and the generator can draw its format leaves from the shipped
brands — which is the duplication this todo is chasing.

## Done when

Every lane's oracles are classified generic vs fixed-assertion, each with a
recommendation (keep / move to a unit test / delete / fold into the generator);
every duplicated type definition is listed with where it should live; a decision
is recorded on the `srcOverlay.ts` no-import rule and on whether
[FUZZING.md](../FUZZING.md) and the root [CLAUDE.md](../../CLAUDE.md) need
correcting; and anything larger than a tidy-up is split out into its own todo
rather than done here.
