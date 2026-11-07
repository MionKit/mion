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
for ajv, the compiled `validate` and `safeParse` for zod, the generated check for typia) against the SHARED
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
typia bundle was built and run directly, like the others.

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
# mion for real too)
pnpm miondevx bench audit
```

## Summary

Live per-sample divergences against the shared truth: **none**. Every competitor answers every shared
sample the way RunTypes does, on both the `validate` and `validationErrors` paths, and no competitor
replaces the shared samples with its own.

| competitor | live divergences | NOT_SUPPORTED cases | SampleOverride cases |
| ---------- | ---------------- | ------------------- | -------------------- |
| RunTypes   | 0 (reference)    | 9                   | 0                    |
| zod        | 0                | 2                   | 0                    |
| TypeBox    | 0                | 2                   | 0                    |
| ajv        | 0                | 2                   | 0                    |
| typia      | 0                | 8                   | 0                    |

An earlier run of this audit found 111 divergences, every one a competitor ACCEPTING a value RunTypes
rejects, each hidden behind a `SampleOverride`. They came from five causes, and each was closed in the
competitor's own case file, with the library's own features, following the benchmark's
[fair comparison rules](../container/benchmarks/README.md#fair-comparison-rules):

| cause                                       | how the competitors now match RunTypes                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| non-finite number (NaN / Infinity)          | ajv runs in its default strict mode (`strict: false` disabled its finite check); typia sets its `finite` plugin option |
| Invalid Date (instanceof only)              | a leaf custom check on the Date (typia: a custom tag on `object`)              |
| plain-object guard (class instance / array) | a leaf plain-object check (zod `z.custom`, TypeBox `Type.Refine`, ajv keyword, typia tag) |
| collection element validation (Map / Set)   | a leaf check on the entries                                                    |
| format regex difference (email)             | the same rule as RunTypes' format                                              |

## Remaining Not-Supported Cases

- **Every competitor**: `ATOMIC.symbol` and `ARRAY.symbol_array`. The shared cases have no samples:
  RunTypes refuses a bare `symbol` at the root as non-data, so there is nothing to check.
- **typia**: also `ATOMIC.literal_symbol`, `ATOMIC.never`, `OBJECT.function_top_level` and
  `OBJECT.interface_callable`. typia emits no check for a symbol or a function type and no tag can target
  one; `is<never>()` accepts `undefined`. And `UNION.union_with_index_arm` / `UNION.union_mixed_with_index`:
  a tag on a union arm makes `createValidate` skip that arm's index loop, so RunTypes' plain-object check has
  no place there.
- **RunTypes**: the 9 cases it refuses as non-data (`factoryThrows` in the shared case): a symbol, a
  `RegExp`, a `Promise`, a function root, a callable interface, a tuple with a function slot. The
  competitors still run the ones they can express, and the website scores RunTypes at the worst result
  among them there.

## Samples to revisit

None. The audit looks for cases where the shared label itself is wrong and RunTypes happens to agree with
the wrong label. It found none.

## Are we the outlier?

No. In every former cluster RunTypes sided with at least one other mainstream library, and the remaining
libraries reached the same answer once they used their own strict options or a small custom check.

RunTypes is intentionally DIFFERENT in one place: it validates serialisable data only and drops
non-serialisable members (functions, methods, symbol-keyed properties) instead of validating them. This
is the validate contract, documented in
[architecture.md](../.agents/docs/architecture.md#validate-contract-serializable-data-only). It is a
deliberate scope choice, not an outlier signal.

No behavioural change to RunTypes is recommended by the audit.
