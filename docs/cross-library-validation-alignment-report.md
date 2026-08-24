# Cross-library validation alignment report

This report inventories every place the benchmark competitors (zod, TypeBox, ajv,
typia) disagree with RunTypes about what counts as a valid value, explains why
each disagreement happens, and answers the question the audit exists to answer:
is RunTypes ever the surprising one?

It is produced by the alignment audit under
[`container/benchmarks/_audit/`](../container/benchmarks/_audit/). The audit is an
analysis pass, not a code change. Nothing in the library, the rewrite pipeline, or
any competitor case file is modified by it. Everything it recommends is captured
at the end of this document as follow-up candidates.

## How the audit works

The runtime benchmark feeds every competitor the same valid and invalid sample
sets per case and flags a competitor red only when its boolean answer disagrees
with the shared sample's labelled truth. Two things keep that benchmark green by
design, and both hide real divergences:

1. A competitor may declare a `SampleOverride` that REPLACES the shared samples
   for a case, so a value it treats differently is simply removed from the set.
2. A competitor may declare a case `NOT_SUPPORTED`, opting out entirely.

The audit looks behind both. For each competitor it runs the real validator
(`createValidateFn` for RunTypes, `.Check` for TypeBox, the compiled `validate`
for ajv, `safeParse` for zod, the generated check for typia) against the SHARED
samples, never the competitor's own override, and records every individual sample
where the answer differs from the shared truth. Each record is one row:

```jsonc
{
  "caseKey": "ATOMIC.number",
  "competitor": "ajv",
  "metric": "validate",
  "path": "reject",
  "sampleIndex": 2,
  "sampleValueRepr": "NaN",
  "expected": false,
  "got": true,
  "samplesOverridden": true,
}
```

`samplesOverridden: true` means the competitor already declared this divergence
with an override (the benchmark cell is green only because the override hid this
exact sample). A row with `samplesOverridden: false` would be an undeclared
divergence. There were none.

### What was run

All four competitors were executed for real and produced live per-sample data. zod,
TypeBox, and ajv build their schemas at runtime. typia needs its build-time
transform, but that transform (samchon's ttsc plus typia's native plugin, driven
through the esbuild adapter) ships as plain npm packages with an embedded Go
toolchain, so it builds on a normal host with no container and no system Go. The
typia bundle was built and run directly, and its live results line up exactly with
the 50 `SampleOverride` notes it already carries.

RunTypes is the reference: the shared samples encode its semantics and it carries
no overrides, so against the shared truth it has zero divergences by construction
(the benchmark gates on exactly this).

To reproduce:

```bash
# zod / TypeBox / ajv / typia, on the host (no container needed)
node container/benchmarks/_audit/host-collect.mjs
node container/benchmarks/_audit/run-audit.mjs
node container/benchmarks/_audit/classify.mjs

# all five competitors, inside the shared image (the canonical full run, runs
# ts-runtypes for real too)
pnpm rtx bench audit
```

## Summary

Live per-sample divergences against the shared truth (114 distinct findings, every
one a reject-path acceptance, meaning the competitor accepts a value RunTypes
rejects):

| competitor  | live divergences | direction        | bucket                      |
| ----------- | ---------------- | ---------------- | --------------------------- |
| zod         | 0                | none             | fully aligned               |
| TypeBox     | 8                | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| ajv         | 36               | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| typia       | 70               | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| RunTypes | 0 (reference)    | n/a              | n/a                         |

By root cause:

| root cause                                  | TypeBox | ajv | typia |
| ------------------------------------------- | ------- | --- | ----- |
| non-finite number (NaN / Infinity)          | 0       | 36  | 46    |
| Invalid Date (instanceof only)              | 0       | 0   | 22    |
| plain-object guard (class instance / array) | 8       | 0   | 0     |
| collection element validation (Map / Set)   | 0       | 0   | 1     |
| format regex difference (email)             | 0       | 0   | 1     |

(Counts above are distinct case-and-sample findings. Each is measured on both the
`validate` and `validationErrors` paths, so the raw record total is double: 228.)

Declared divergences each competitor already carries in its case file:

| competitor  | NOT_SUPPORTED cases | SampleOverride cases |
| ----------- | ------------------- | -------------------- |
| RunTypes | 3                   | 0                    |
| zod         | 37                  | 0                    |
| TypeBox     | 77                  | 3                    |
| ajv         | 116                 | 27                   |
| typia       | 71                  | 50                   |

Three observations set up the rest of the report:

- Every live divergence is in the same direction. A competitor ACCEPTS a value
  RunTypes rejects. No competitor is ever stricter than RunTypes on a value
  the shared truth accepts.
- Every live divergence is already declared (an override exists for it). The audit
  found no undeclared drift in the runnable competitors.
- Where two libraries diverge on the same case (ajv and typia on non-finite
  numbers), they are both looser than RunTypes in the same direction, and the
  remaining libraries side with RunTypes. RunTypes is never alone against a
  consensus.

## The divergence clusters

All 114 live findings collapse into five root causes: three main ones and two with
a single finding each.

### 1. Non-finite numbers (NaN, Infinity, -Infinity)

The largest cluster (36 ajv findings, 46 typia findings). Both accept `NaN`,
`Infinity`, and `-Infinity` wherever a number is expected, across atomics, arrays,
tuples, object properties, index signatures, unions, and utility-type projections.
RunTypes gates every number on `Number.isFinite`, so non-finite values are
rejected. The relevant ajv note states it plainly:

```text
override: ajv {type:number} accepts NaN/Infinity; drop them from invalid
```

This is a genuine semantic choice. JSON Schema's `{"type":"number"}` admits any
JavaScript number, and ajv does not add a finiteness gate by default. RunTypes
rejects non-finite numbers because they are not representable in JSON and are
almost never what an API or persistence layer wants.

Witnesses: zod (`z.number().finite()`) and TypeBox (`Type.Number()`) both reject
non-finite numbers, agreeing with RunTypes. So on this cluster RunTypes sits
with the majority (RunTypes, zod, TypeBox) and ajv and typia are the looser
pair.

**Now configurable.** `Number.isFinite` remains the default, but the divergence is
no longer fixed: the `numberMode` ValidateOption selects the base number check per
validator (`typeof` accepts `NaN`/`Infinity` like ajv and typia; `notNaN` rejects
`NaN` but keeps `Infinity`), and a project-wide `validate.numberMode` plugin/tsconfig
default applies it everywhere. So a codebase migrating off ajv or typia can adopt
their number semantics with one setting instead of hitting this cluster of
differences. See the validation guide for details.

### 2. Invalid Date

typia validates `Date` by `instanceof` only (22 findings), so an Invalid Date (one
whose `getTime()` is `NaN`, such as `new Date('invalid')`) passes every Date
position: atomic, array element, tuple slot, property, index value, union arm, rest
element. RunTypes additionally gates on `getTime()` not being `NaN`. typia's
notes name it directly:

```text
override: typia Date prop is instanceof (accepts Invalid Date); invalid drops the two Invalid Date entries
```

Witnesses: zod (`z.date()`) and TypeBox (`Type.Date()`) both reject Invalid Date,
agreeing with RunTypes. ajv has no Date instance type at all (it declares those
cases NOT_SUPPORTED). So RunTypes again sits with the majority and typia is the
outlier on this cluster.

### 3. Plain-object guard versus structural object

For an object type whose properties are all optional (`interface_all_optional`,
`Partial<T>`, a recursive `DeepPartial<T>`), TypeBox accepts builtin class
instances and arrays: `Date`, `Map`, `Set`, `RegExp`, `[]`. Structurally those
values satisfy a shape with no required members, so TypeBox's `Type.Object` admits
them. RunTypes applies a plain-object guard: the value must be an ordinary
object, not a class instance or array, even when every property is optional. The
shared case title says so directly, calling it the "plain-object guard".

This is the one cluster where the question "are we too strict?" is worth asking,
because pure structural typing would accept a `Date` for `{ a?: string }`. The
answer is that RunTypes has a witness here. zod reaches the same result on
purpose, with a hand-written guard, and its note explains why:

```text
interface_all_optional: all-optional object but arrays/Date/Map/Set rejected — use custom to enforce plain-object guard
```

So on the all-optional object cases, RunTypes and zod agree (both apply the
guard), and TypeBox is the lone library that does not. TypeBox cannot express the
guard through `Type.Object`, which is why it falls back to a `SampleOverride`. This
reads as a LIBRARY_LIMITATION on the TypeBox side rather than a RunTypes
problem.

### 4. Collection element validation (one finding)

For `Map<string, number>`, typia accepts a `Map` instance whose entries do not match
the declared key and value types, validating the container kind but not its
contents. RunTypes validates the entries too. zod and TypeBox also validate the
entries, so RunTypes is again on the majority side. One finding
(`NATIVE.map_string_number`).

### 5. Format regex difference (one finding)

typia accepts the string `"a@b.co"` as a valid email, where RunTypes rejects it
(its built-in email pattern is stricter about the domain). Every library ships its
own format regexes, and the shared samples were authored against RunTypes'
built-in patterns (see [`packages/ts-runtypes/src/formats/`](../packages/ts-runtypes/src/formats/)),
so a competitor with a looser or stricter regex shows up here. Only one finding
surfaced, because the format suite is the one place competitors lean most heavily on
`SampleOverride` and `NOT_SUPPORTED` already (see the catalog below). It is the
predicted format cluster, just mostly pre-absorbed by the competitors' own overrides.

## Documented divergences (the declared catalog)

Beyond the per-sample clusters, each competitor opts out of large families of
cases it cannot express. These are legitimate, already declared, and listed here
so the catalog is complete.

### ajv

ajv carries 116 NOT_SUPPORTED cases and 27 overrides. The NOT_SUPPORTED reasons
group as:

- About 55 builtin-class cases. JSON Schema has no `Date`, `RegExp`, `Map`, or
  `Set` instance type.
- 27 bigint cases. JSON Schema has no bigint type.
- A handful each for symbol, undefined and void, function and callable shapes, and
  recursive or self-cyclic types (which would stack-overflow the compiler).
- Roughly 20 cases that lean on a RunTypes-specific option with no JSON Schema
  equivalent.

The 27 overrides are all the non-finite-number cluster from above.

### typia

typia carries 71 NOT_SUPPORTED cases and 50 overrides. The 50 overrides are the
non-finite-number, Invalid-Date, collection-element, and format clusters, and the
live typia run reproduced every one of them. The NOT_SUPPORTED reasons are more
interesting because several of them are places where typia is STRICTER or simply
different from RunTypes, the opposite direction from the clusters above:

- typia validates function-valued and other non-serialisable properties, and so
  rejects samples where RunTypes silently drops them. RunTypes validates
  serialisable data only, by design (see the validate contract below). typia's
  note: "typia validates the function prop (cb); we silently drop it, so valid
  samples with cb:42/null fail here".
- `typia.is<object>()` rejects arrays, where RunTypes treats `[]` as a valid
  `object` (the TypeScript `object` type includes arrays).
- `typia.is<never>()` accepts `undefined`, where RunTypes rejects everything for
  `never`.
- For a template-literal index key, typia ignores keys that do not match the
  pattern, where RunTypes requires every own key to match.

These are recorded as NOT_SUPPORTED rather than overrides because the difference is
structural, not a single edge sample.

### TypeBox

TypeBox carries 77 NOT_SUPPORTED cases and 3 overrides. The 3 overrides are the
all-optional plain-object cases from cluster 3. They are the only overrides in the
suite with no inline reason. The live audit explains all three (class instances
and arrays accepted by a structural object schema), so the catalog is complete,
but adding a one-line note at each TypeBox override call site would bring them in
line with how ajv and typia annotate theirs.

### zod

zod carries 37 NOT_SUPPORTED cases and 0 overrides, and 0 live divergences. Where
the shared truth needs a guard the schema language does not provide (the
plain-object guard, symbol identity by description, and similar), zod authored a
`z.custom` predicate that matches RunTypes exactly. It is the most closely
aligned competitor in the suite.

## Samples to revisit

None. The audit looked for cases where the shared label itself is wrong and
RunTypes happens to agree with the wrong label (the "silent agreement on the
wrong thing" case). It found none. Every shared label that a competitor disagrees
with is defensible on TypeScript semantics, and the disagreement is always the
competitor being more permissive, not the label being too loose.

## Are we the outlier?

This is the question the audit exists to answer. Treating the other four libraries
as independent witnesses, is there any case where RunTypes alone gives the
surprising answer on unambiguous TypeScript semantics?

No. The evidence points the other way in every cluster.

- **Non-finite numbers.** RunTypes rejects; zod and TypeBox also reject; ajv and
  typia accept. RunTypes is with the majority. Rejecting NaN and Infinity is
  also the safer default for the JSON and persistence use cases RunTypes
  targets. Keep current behaviour.
- **Invalid Date.** RunTypes rejects; zod and TypeBox also reject; typia
  accepts; ajv has no Date type. RunTypes is with the majority. Rejecting a Date
  whose `getTime()` is `NaN` is clearly the more useful answer. Keep current
  behaviour.
- **Plain-object guard.** RunTypes rejects class instances for all-optional
  object types; zod agrees on purpose with a custom guard; TypeBox cannot express
  the guard and accepts them. RunTypes has a witness and a documented rationale.
  Keep current behaviour.
- **Collection element validation.** RunTypes validates Map/Set entries; zod and
  TypeBox do too; only typia stops at the container kind. RunTypes is with the
  majority. Keep current behaviour.
- **Format regex (email).** RunTypes rejects `"a@b.co"`; typia accepts it. This
  is a regex-strictness difference, not a correctness bug on either side, and only a
  single sample surfaced it. Keep current behaviour; the format regexes are a
  separate, deliberately tuned surface.

There is also a set of cases where RunTypes is intentionally DIFFERENT from a
competitor, surfaced by typia's NOT_SUPPORTED notes: it drops non-serialisable
members (functions, methods, symbol-keyed properties) rather than validating them.
This is the validate contract, documented in
[CLAUDE.md](../CLAUDE.md#validate-contract--serializable-data-only) and
[docs/ARCHITECTURE.md](ARCHITECTURE.md). It is a deliberate scope choice, not an
accidental divergence, and the audit explicitly does not treat it as an outlier
signal.

### Should we change anything?

No behavioural change is recommended. RunTypes is never the lone surprising
library on any contested value, and every divergence traces to a deliberate,
defensible choice.

One small, non-behavioural follow-up is worth considering, and would be its own
todo:

- **MAYBE: annotate the three TypeBox overrides.** They are the only overrides in
  the suite without an inline reason. Adding a one-line note at each call site
  (for example, "TypeBox Type.Object is structural; accepts Date/Map/Set/RegExp for
  all-optional shapes") would make the override catalog self-documenting. This is a
  competitor-case-file edit, out of scope for this analysis pass, and should land
  as a follow-up alongside any other override-hygiene work.

Everything else stays as it is. The audit's conclusion is that the RunTypes
definition of valid is the conservative, JSON-oriented one, consistently backed by
at least one other mainstream library on every point where libraries disagree.
