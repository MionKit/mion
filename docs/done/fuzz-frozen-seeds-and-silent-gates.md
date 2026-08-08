---
type: fix
spec: guidelines
status: ready
created: 2026-08-08
---

# The fuzz lanes explore one frozen sample, and three gates can hide real findings

Split out of the [fuzz-followups audit](../done/fuzz-followups.md) (2026-08-08).
Four independent defects, all of the same family: the harness looks like it is
fuzzing more than it is.

## 1. Every default-run lane uses a frozen literal base seed

`value` uses `0xc0ffee`, `types` `0xc0ffee`, `nondata` `0xda7a01`, `cloning`
`0xc10e5eed`, `jsonschema` `0x5eeded`, `enrich` `0x0e17c0de`, `i18n`
`0x118a10ca`, `typemod` `0x7b9e4d11`. `RT_FUZZ_SEED` is read **only** in the
soak / replay branches for 9 of the 11 lanes (`sidecar` and `patterngen` are the
exceptions — they honour it in the default run).

So in CI, the generic-property oracles re-execute over ONE frozen sample of the
generated space, on every run, forever. The oracles really are properties; the
runs are not exploring. A bug in a region the frozen seeds never reach is
invisible until someone runs a soak by hand.

The tension is real and should be resolved deliberately, not by flipping a
default: a per-run random seed makes CI nondeterministic, and a red build whose
seed nobody recorded is worse than a green one. The usual resolution is to keep
the pinned seed AND add a small randomized budget on top, with the seed printed
on every run so a failure replays. Decide, then apply uniformly.

## 2. Two violation-suppressing gates that assert nothing

[typeFuzzRunner.ts:193-204](../../packages/ts-runtypes/test/fuzz/type/typeFuzzRunner.ts)
and
[jsonSchemaFuzz.integration.test.ts:164-173](../../packages/ts-runtypes/test/fuzz/jsonschema/jsonSchemaFuzz.integration.test.ts)
both discard **all** violations recorded for a generated type when that type
fails a TypeScript re-check. The reasoning is sound (tsgo is lenient and still
produces a RunType for non-compilable input, so a violation there is a false
positive).

The defect is that the suppression counter, `skippedInvalidTypes`, is asserted
**nowhere** — it is only printed in the soak log. A generator regression that
started emitting, say, 100% invalid TypeScript would suppress every violation and
turn both lanes green and silent.

Fix: assert a ceiling on the suppression rate in the batch tests, so the gate
cannot swallow the lane. Something like "fewer than N% of runs were suppressed",
sized from the observed rate (currently 0 on a 466-type soak).

## 3. The typemod flake filter can hide a real nondeterministic bug

[typeModFuzz.integration.test.ts:86-93](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts)
fails only on a **shrink-confirmed** violation; anything that does not reproduce
under the shrinker is logged as a flake and passes. A genuinely nondeterministic
reconciler bug is therefore unreportable by construction — which is a shame,
because nondeterminism in a file-rewriting reconciler is exactly the bug class
worth catching.

Fix direction: keep the filter (it exists for a reason) but count unconfirmed
flakes and fail above a threshold, so a rising flake rate surfaces instead of
accumulating silently in the log.

## 4. Uneven anti-vacuity guards

`shapeValue.unit.test.ts:136,154`, `typeGen.unit.test.ts:210`,
`patternGenFuzz.test.ts:179` and `typeModFuzz…:98` all guard against a degenerate
run (assert that a meaningful number of samples actually exercised the oracle).
The `value`, `types`, `cloning`, `jsonschema`, `enrich` and `i18n` lanes guard
only with `report.runs === N`, which proves the loop ran, not that any oracle
evaluated a non-trivial input.

Fix: give each of those lanes a coverage counter and assert a floor, matching
what the four good examples already do.

## Done when

A recorded decision on seeding that is applied uniformly across the lanes; the
two suppression counters and the typemod flake counter are asserted rather than
merely logged; and the six lanes without anti-vacuity guards have one.
