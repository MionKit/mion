---
type: fix
spec: guidelines
status: ready
created: 2026-08-08
---

# One soak iteration in ~740 takes 340 seconds, and nothing can preempt it

Found 2026-08-08 while verifying the soak wall-clock fix in
[fuzz-followups](../done/fuzz-followups.md). That fix is necessary but **not
sufficient**: it bounds when an iteration may START, and this is a single
iteration that runs 340 seconds once started.

## Evidence

Instrumenting `runTypeFuzzForDuration` to log every iteration's cost, on the
`nondata` lane with `RT_FUZZ_SEED=1` and a 60s budget:

```
total iterations: 742
round  cost
741    339889 ms     <-- the outlier
459       664 ms     <-- next worst
732-740    25-54 ms  <-- its immediate neighbours
```

Wall clock for the whole 60s-budget soak: **365 seconds**. The budget guard
worked exactly as designed (it refused to start iteration 742), but the damage
was done inside 741.

At a 20s budget the run stops at iteration 460 and takes 20.09s — clean. So the
lane looks perfectly healthy right up until it does not.

## The type is NOT slow in isolation

Round 741 is `mixSeed(1, 'type', 741)` = seed `2786721472`:

```ts
Set<{
  readonly p0: Uint8Array;
  readonly p1?: DataView;
  p2: {kind: "t0"} | {kind: "t1"} | {kind: "t2"; f0: DataView; f1: DataView}
    | {kind: "t3"; f0?: RegExp; f1: "green"; f2: ArrayBuffer};
  p3: bigint;
  [k: number]: Map<number, Record<string, FzUriTemplate>>;
}>
```

Compiled and exercised on a FRESH client, every phase is fast:

```
compile: 206ms   mock(): 843ms   validate(): 128ms   jsonEncode: 176ms   binaryEncode: 162ms
```

Total ~1.5s. So the 340s is **state-dependent**: it only appears after ~740
previous types have been linked into the live in-process registry.

That points straight at the known limitation already recorded in
[FUZZING.md](../FUZZING.md): "the live `rtUtils` registry accumulates across a
long soak (every distinct type registers its closure once); fine for
time-bounded runs." The evidence says it is NOT fine for time-bounded runs — it
turns one of them into a 6x overshoot.

But note the shape does not match simple linear accumulation either: rounds
732-740 are 25-54ms, so the cost does not creep up, it spikes on one type. The
real mechanism is likely an interaction between this type's shape (a number
index signature holding `Map<number, Record<string, …>>` inside a `Set`) and the
accumulated registry — something that is O(registry) per lookup and that this
shape performs a great many of.

## Why it matters

The user-visible symptom is exactly the one
[fuzz-followups](../done/fuzz-followups.md) item 2 set out to kill: a soak that
finds NOTHING reports as a vitest timeout failure. The wall-clock budget fixed
the systematic version of that; this is the residual, and no timeout value fixes
it because the overshoot is unbounded. Synchronous JavaScript cannot be
preempted, so the runner cannot cap it the way `COMPILE_TIMEOUT_MS` caps the
resolver.

## Direction

Profile first, fix second — do not guess.

1. Reproduce with `RT_FUZZ_SEED=1`, a 60s+ budget on the `nondata` lane, and a
   CPU profile attached; confirm where the 340s goes (the in-process linker, the
   mock walker, or `rtUtils` lookup).
2. If it is registry growth, the natural fix is to bound it: recycle the client
   and the in-process registry every N iterations (the runner already has
   `ClientHolder.restart()` for the wedged-resolver case), so a soak's cost per
   iteration stays stationary. Verify by re-running the per-iteration log and
   checking the tail is flat.
3. If it is intrinsic to the shape under a large registry, that is a product
   finding about `rtUtils` lookup complexity and deserves its own fix.

Whatever the cause, add a per-iteration cost guard to the soak report: record the
slowest iteration and FAIL (or at least log loudly) when one iteration exceeds
some multiple of the median, so the next pathology is reported as a finding
instead of as a timeout.

## Done when

A 60s `nondata` soak at `RT_FUZZ_SEED=1` finishes within its budget plus the
normal headroom, the per-iteration tail is flat, and a future single-iteration
pathology surfaces as a reported finding rather than a vitest timeout.
