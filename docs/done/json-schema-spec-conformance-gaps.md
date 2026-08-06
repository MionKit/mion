---
type: fix
spec: guidelines
status: done
created: 2026-08-03
---

# Four JSON Schema conformance gaps found by the spec corpus

Found on the first run of the new spec-conformance lane
([json-schema-spec-conformance-section.md](../done/json-schema-spec-conformance-section.md)),
`pnpm rtx bench spec`. Our door scores **61/65** against draft 2020-12; ajv
scores 62/65 with only the three documented, intentional divergences.

Each finding below is a case where **ajv agrees with the spec label and we do
not**, so they are ours, not bad labels. Reproduce any of them with:

```bash
RT_BENCH_USE_LOCAL=1 pnpm rtx bench spec
```

## 1. `allOf` silently drops a bare numeric constraint (worst of the four)

```json
{"allOf": [{"type": "integer"}, {"minimum": 10}]}
```

We **accept `9`**. The spec and ajv reject it: it is an integer, but the second
branch requires `>= 10`. The `{"minimum": 10}` branch carries no `type`, so it
appears to be resolving to an unconstrained `unknown` and the constraint is lost.

This is the dangerous one: no diagnostic, no error, just a validator that checks
less than the document says. `SPEC_SUITE.COMBINATORS.all_of`.

## 2. A bare constraint at the root trips MKR009 instead of validating

```json
{"oneOf": [{"multipleOf": 3}, {"multipleOf": 5}]}
```

Halts the build with `MKR009: Type IteratorObject re-instantiates itself with
fresh type arguments at every level`. A bare `multipleOf` is a legal document
that constrains numbers and is vacuously true for everything else, so its
recovered type is effectively `unknown`, and reflecting that hits a
self-instantiating built-in.

Loud rather than silent, so less severe than 1, but it is a legal document we
refuse. Same root cause as 1 (a constraint keyword with no `type` sibling),
which is why they are filed together. The corpus works around it by gating each
branch with `type: 'integer'`; see the comment on
`SPEC_SUITE.COMBINATORS.one_of_exclusive`.

## 3. `dependentSchemas` over-constrains when the trigger key is absent

```json
{
  "type": "object",
  "properties": {"kind": {"type": "string"}},
  "dependentSchemas": {"kind": {"required": ["size"], "properties": {"size": {"type": "integer"}}}}
}
```

We **reject `{"other": 1}`**. `kind` is absent, so the dependent subschema never
applies and the value is valid. Suspect the recovered union's "no trigger key"
arm is closed against unrelated properties.
`SPEC_SUITE.OBJECTS.dependent_schemas`.

## 4. Two string formats disagree with the spec

- ~~`format: 'ipv4'` **accepts `"localhost"`**, which is not an IPv4 literal.~~
  **FIXED** (see the 2026-08-05 update below): `allowLocalHost` now defaults to
  false on every IP preset and covers the hostname spelling only, so `ipv4`
  turns `"localhost"` down while `127.0.0.1` and `::1` stay valid.
  `SPEC_SUITE.STRINGS.format_ipv4`.
- `format: 'uri'` **rejects `"mailto:ada@example.com"`**, a valid absolute URI.
  Our pattern may require an authority (`//`).
  `SPEC_SUITE.STRINGS.format_uri`.

Both are format-pattern definitions rather than schema-door logic, so they are
likely a much smaller fix than 1-3 and may want to be split out.

## Update 2026-08-05 — the official-suite lane now tracks these

The full official JSON-Schema-Test-Suite lane
(`packages/ts-runtypes/test/json-schema-official/`, see its README) now runs
1988 draft 2020-12 cases and records every divergence in its
`known-divergences.json` ledger — the four gap families below all appear there
as non-byDesign entries (dependentSchemas/dependentRequired, allOf/oneOf bare
constraints, ipv4/uri format patterns), alongside the larger newly measured
surfaces (unevaluated* annotation tracking, optional/format pattern
strictness). One correction to finding 2: the bare-constraint `oneOf` document
no longer halts the build with MKR009 — it now compiles and validates, merely
diverging on verdicts — so the halt half of that finding is already fixed;
the constraint-dropping half remains. Fixes should make the corresponding
ledger entries disappear (the lane's stale-entry assert enforces the ledger is
trimmed with `report --update-ledger`).

The ipv4 half of finding 4 is now **done**, along with the whole `ipv4` /
`ipv6` suite files (41/41 and 40/40 conforming, 21 ledger entries dropped).
Two things were wrong beyond the reported one: the octet check went through
`Number()`, which accepts `''`, `'0x7f'`, `'1e2'`, `'+1'` and trailing
whitespace/newlines, and the v6 group scan accepted a lone leading or trailing
`:` while rejecting valid elisions (`::`, `1::d6:192.168.0.1`). Both parsers
were rewritten, `allowLocalHost` was redefined to gate the HOSTNAME spelling
only (so it no longer excludes the `::1` address) and flipped to default false.
The `uri` half of this finding is untouched and stays open.

## Direction

Investigate 1 and 2 together: both point at how a constraint keyword with no
`type` sibling is resolved, and 1 is a correctness hole worth fixing on its own
merits. 3 is its own question about how `dependentSchemas` lowers to a union. 4
is two pattern fixes.

Each fix needs a unit test in
`packages/ts-runtypes/test/suites/json-schema-define/` alongside the existing
structural-keyword coverage, and the corresponding case in the spec corpus
should go green without being edited. The benchmark page is the acceptance
check: `pnpm rtx bench spec` must report 65/65 for ts-runtypes.

## Done when

`pnpm rtx bench spec` reports **65/65 conforming for ts-runtypes**, the corpus
is unchanged except for removing the MKR009 workaround comment on
`one_of_exclusive`, and each fix carries a unit test.

## Closed 2026-08-06 — all four conform

Every finding above now passes, verified against the door directly and pinned by
the official-suite lane's ledger. What each one turned out to be:

1. **`allOf` dropping a bare numeric constraint.** The arms were combined with a
   plain `&`, and a type-LESS arm lowers to the six-kind union, so
   `(string | Number<min 10> | …) & (…)` stayed unreduced and both bounds were
   lost. Arms now combine through `Conj`, which distributes over the union and
   prunes the cross-kind pairs. `allOf: [{type: 'integer'}, {minimum: 10}]`
   rejects 9. Same change closed `allOf: [{maximum: 30}, {minimum: 20}]`.
2. **Bare constraints under `oneOf`.** The MKR009 halt was already gone (noted in
   the 2026-08-05 update); the constraint-dropping half went with finding 1, and
   sibling keywords beside `oneOf` now push INTO each branch rather than
   resolving the schema to an impossible type.
3. **`dependentSchemas` over-constraining with the trigger absent.** Two causes,
   both fixed: the keyword is object-scoped so every non-object now passes
   untouched, and the "trigger absent" arm was an exact object that rejected
   unrelated keys — object arms inside a kind union carry the open record now.
4. **The two formats.** `ipv4` was recorded done on 2026-08-05; `uri` became its
   own RFC 3986 pattern accepting any scheme, so `mailto:ada@example.com` and
   `urn:isbn:…` validate. `format: 'uri'` lowers to `TF.Uri` rather than the
   narrower `TF.Url`.

The official suite is the live scoreboard now
(`packages/ts-runtypes/test/json-schema-official/CONFORMANCE.md`); the remaining
open divergences are tracked in their own specs, not here.
