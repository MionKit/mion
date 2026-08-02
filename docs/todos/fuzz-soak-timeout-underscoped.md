---
type: bug
spec: rough-idea
status: ready
created: 2026-08-02
---

# Fuzz soak vitest timeouts under-account compile time (clean soaks report as failures)

## Symptom

The opt-in soak tests size their vitest timeout as `soakMs + 60_000`
(e.g. [nonDataTypeFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/type/nonDataTypeFuzz.integration.test.ts)),
but `runTypeFuzzForDuration`'s wall clock overshoots its budget by roughly
2.4x (a 180s budget ran 429s over 742 types; a 60s budget also ran ~429s), so
vitest marks the soak timed-out even though it completes and prints
`soak finished: N types, 0 violation(s)`. Every soak longer than about a
minute therefore reports as a FAILURE while being clean, which cost a
diagnosis round during the binary-union-desync verification (2026-08-02) —
the "failure" perfectly mimics a real finding until the log is read.

## Fix sketch

Either make the duration runner respect wall-clock (check the deadline before
STARTING an iteration and count compile time against the budget), or size the
test timeout from the observed per-iteration cost (`soakMs * 3 + 60_000` is
the cheap fix). Apply to every soak lane that follows this pattern (nondata,
wild type sweep, roundtrip, binary-size). The fixed-iteration batch tests are
unaffected.

## Provenance

Observed 2026-08-02 while verifying the binary-union-function-member-arm fix;
same artifact on 60s and 180s nondata soaks, both with zero violations.
