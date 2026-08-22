# `serializeBinaryBody` walks the execution chain more times than it needs

**Status:** todo — found while shipping
[binary-pooling-review-findings.md](../done/binary-pooling-review-findings.md); deferred because the
fix needs a decision about this lane's no-allocation invariant, not because it is large.
**Created:** 2026-08-22

## Evidence

`packages/core/src/binary/bodySerializer.ts` walks `executionChain` twice per request — once in
`planBuffer` (and a third time in `measureEnvelope` when the size is measured), then again in
`writeEnvelope` — and `willSerialize` is re-evaluated for every method on every walk. It is not
expensive per method, but it is the hot path of a lane whose entire purpose is per-request cost.

Measured in `packages/router/src/routes/routesFlowBuffer.bench.ts`: a hand-rolled equivalent that
resolves the contributing methods ONCE and reuses that list across plan, measure and write runs at
**2660 hz vs 2440 hz** for the shipped path on steady two-method traffic (~9%). The gap closes as
payloads grow — it is a fixed per-method overhead, so it hurts exactly the small steady responses
that are otherwise cheapest.

## Why it was not just fixed

Collapsing the walks means materialising the contributing methods somewhere. The obvious form — a
per-request array — is the allocation this lane exists to avoid (the whole buffer-pool design is
about not allocating per request). The allocation-free form is a REUSED module-level scratch array,
which is safe today (serialization is synchronous and a compiled `toBinary` never re-enters
`serializeBinaryBody`; registered class serializers write into the same serializer) but hard-codes
that non-reentrancy as an invariant nothing currently enforces.

That trade — accept one small per-request array, or take reusable mutable module state plus a
documented non-reentrancy invariant — is the call to make before writing the code.

## Fix plan

1. Decide the shape: reusable scratch array (allocation-free, needs the invariant written down and
   ideally a dev-mode assertion that it is not re-entered) vs a per-request array (simple, one small
   allocation per response).
2. Resolve the contributing methods once, before `planBuffer`, and thread that list through
   `planBuffer` / `measureEnvelope` / `writeEnvelope` in place of `willSerialize` re-evaluation.
3. Re-run `pnpm exec vitest bench --project router routesFlowBuffer` and record the STEADY throughput
   against the 2440 hz baseline above; the memory columns must not move.
