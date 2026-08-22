# `serializeBinaryBody` resolves the execution chain ONCE per request

**Status:** done — shipped on `claude/serialize-chain-single-pass-6s2pb2`
**Created:** 2026-08-22 · **Completed:** 2026-08-22

Follow-up to [binary-pooling-review-findings.md](binary-pooling-review-findings.md), which left this
open because it needed a decision about the lane's no-allocation invariant.

## The problem

`packages/core/src/binary/bodySerializer.ts` walked `executionChain` twice per request — once in
`planBuffer`, then again in `writeEnvelope` — and a third time in `measureEnvelope` when the size was
measured. `willSerialize` was re-evaluated for every method on every walk, as were the `toBinary`
lookup and the `body[key]` read. Not expensive per method, but this is the hot path of a lane whose
entire purpose is per-request cost.

## The decision the todo deferred, and why it dissolved

The todo framed it as a choice between a per-request array (an allocation on a lane built to avoid
them) and a reused module-level scratch array (allocation-free, but hard-coding non-reentrancy as an
invariant nothing enforced).

That was a false dilemma, and its own evidence said so: the hand-rolled comparator it measured at
2660 hz (`hybridStraddle` in `routesFlowBuffer.bench.ts`) resolves its methods with a plain
`chain.filter(...)` — it ALREADY pays the per-request allocation and still beat the shipped path. The
allocation was never what the gap was about.

So neither option was taken. What shipped is a **reused scratch list plus an `inUse` flag**: the
common request is allocation-free, and a re-entrant call — the only way two lists can be live at
once, since serialization is synchronous — gets a fresh list instead of clobbering the outer walk.
The non-reentrancy assumption is now ENFORCED rather than documented.

## What shipped

A `WriteList {methods, fns, values, length, isResponse}` is resolved in ONE pass and threaded through
`planBuffer` / `measureEnvelope` / `writeEnvelope`; `serializeMethod` is gone. Per method per request,
`willSerialize`, the `toBinary` resolution and the `body[key]` read each happen once instead of two or
three times. `serializeBinaryBody` releases the list in a `finally`, nulling the value slots so no
request data is retained between requests.

Caching the VALUE closes a second hole the old code documented but did not fix: a getter that does not
return the same object twice could make the measure pass and the write pass disagree, which was the
one remaining way a MEASURED pooled size could overflow. `writeList.spec.ts` pins it — that test reads
3 times on the old code and 1 on the new.

## Measured

`pnpm exec vitest bench --project router routesFlowBuffer`, `core-hybrid STEADY`, 10 alternating full
runs (order reversed halfway to cancel slot bias), on a shared cloud container:

| | median | mean |
| --- | --- | --- |
| before | 2926 hz | 3023 hz |
| after | 3091 hz | 3218 hz |
| | +5.6% | +6.5% |

**The memory columns did not move** on any profile (A: 2.6x over-allocation, 32 KB peak,
`measured=1526`; B: 1.8x, 64 KB, `measured=1989`) — this is purely per-request CPU.

Caveat on the number: that container drifts ±20% run to run, and the UNCHANGED `hybrid-straddle`
control drifted -4.7% across the same rounds, so the real delta is likely nearer the ~9-11% the todo
predicted than to +6%. The 2440 hz baseline in the original spec was measured elsewhere and is not
comparable to the absolute numbers above; re-measure on a quiet machine if the exact figure matters.

## Found while doing it: thrown errors were dropped on the binary wire

Not in scope, fixed in the same PR (see [binary-thrown-errors-dropped.md](binary-thrown-errors-dropped.md)).
