---
type: fix
spec: guidelines
status: ready
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

- `format: 'ipv4'` **accepts `"localhost"`**, which is not an IPv4 literal.
  `SPEC_SUITE.STRINGS.format_ipv4`.
- `format: 'uri'` **rejects `"mailto:ada@example.com"`**, a valid absolute URI.
  Our pattern may require an authority (`//`).
  `SPEC_SUITE.STRINGS.format_uri`.

Both are format-pattern definitions rather than schema-door logic, so they are
likely a much smaller fix than 1-3 and may want to be split out.

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
