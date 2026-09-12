---
type: chore
spec: guidelines
status: ready
created: 2026-09-12
---

# One CallContext object per request

## Intent

A streaming adapter currently builds TWO objects per request: a small `ResolvedRequest` before the
body is read (so the read can be checked against the route's own limit), then the `CallContext`
after it. The shapes are near-identical, `ResolvedRequest` is literally
`Omit<CallContext, 'request' | 'response' | 'shared'>`, and building one object would be the obvious
design.

The obvious design was tried and measured WORSE at large bodies, for reasons nobody has explained.
The goal here is to reach one object per request without paying that cost, or to prove the cost is
not real. Whoever picks this up must measure, not reason: every attempt so far that relied on
reasoning alone was wrong.

## What exists today

```ts
// packages/router/src/callContext.ts
export function resolveRequest(path, urlQuery, rawRequest): ResolvedRequest   // chain + maxBodySize + readsBody
export function createContextFromResolved(resolved, reqHeaders, respHeaders, rawBody?, bodyType?): CallContext
export function createCallContext(...)   // the two in one, for a caller that already has the body
```

Adapters resolve, read the body against `resolved.maxBodySize`, then build the context with the body
already in it. `createCallContext` and `dispatchRoute` keep the one-call form for aws, gcloud and
tests. `ResolvedRequest` is derived from `CallContext` with `Omit`, so the two cannot drift.

## What was already tried, and what it measured

Three shapes were benchmarked in-process with the work equalised (`resolveStrategy.bench.ts`, in the
router package). A full in-process dispatch of a validated route was 3,550 ns for scale:

| Shape | ns per request | vs split |
| --- | --- | --- |
| `split`, what ships | 258 | — |
| `merged`, one object whose `request` / `response` / `shared` are filled after the read | 234 | -24 ns |
| `relookup`, resolve returns only the limit, a SECOND lookup builds the context after the read | 312 | +54 ns |

So on raw processor time `merged` wins by 24 ns, which is 0.05% of a real request on the wire.
`relookup` loses: a second Map lookup costs more than the small object it saves, and it would run
`pathTransform` twice, which is user code that can read the request, so that is a behaviour risk as
well as a cost.

Then the server benchmark, three rounds each, interleaved in one window, on the 4 MB payload lane:

| 4 MB lane | req/s | max mem |
| --- | --- | --- |
| split | 66.4 / 63.0 / 56.4 | 330 / 317 / 321 MB |
| merged | 62.5 / 51.9 / 55.4 | 432 / 356 / 417 MB |

At 1 KB the two are indistinguishable (11,635 vs 11,591 req/s, same memory). Throughput at 4 MB
overlaps heavily, but the MEMORY groups do not overlap at all, and that is the finding that kept the
split.

**No mechanism is known.** Two explanations were proposed and both were tested and refuted:

1. "The context is promoted to the old heap during the read, so the body string assigned into it is
   promoted too." Refuted: a 4 MB string is too big for young space, so V8 puts it straight into
   large-object space. It is born old no matter who references it.
2. "Then it must be the parsed graph, the millions of small objects `JSON.parse` leaves behind,
   hanging off a promoted context." Also refuted: an isolated model of exactly that showed no
   difference (`before` 281/274/274 ms against `after` 277/280/311 ms, major collections 6/6/4
   against 4/4/6).

So the memory difference is real and repeatable in the real server and does not reproduce in any
isolated model built so far. Finding out why is the first useful step, and it may well show the
split is unnecessary.

Also tried and rejected: clearing `context.request.rawBody` after the reply is written. `rawBody` is
read only by the parse (`serializer.routes.ts:36`), so an early clear is possible, but it is a public
field on `CallContext` and an `alwaysRun` logger reading it would start seeing `undefined`. Never
measured.

## Direction

Find a shape that is one object and no worse. Anything is fair game: pooling contexts, a different
field layout, clearing references at a measured point, or simply proving the merged shape is fine and
the earlier result was an artifact. The implementer plans the details.

What is NOT negotiable is the evidence: a baseline captured first, then every candidate measured
against it on both memory and requests per second, interleaved in one window.

## How to measure this properly

This was the hard part. Read all of it before trusting a number.

**The server benchmark drifts enormously between runs.** The same unchanged code measured 46.5 req/s
on the 4 MB lane and 63.4 req/s about an hour later, a 35% swing. Absolute numbers from different
sessions are worthless, and an early comparison in this investigation produced a fake "+33%" purely
from drift. So:

- Always interleave: run A, then B, then A, then B, in ONE window. Three rounds each minimum.
- Alternate the order between rounds, so a warm-up or thermal trend cannot favour one side.
- Prefer MEMORY as the signal. `maxMem` was stable to a few percent while req/s swung by 20% within
  a single arm.
- A candidate is only better if the groups do not overlap, not if the means differ.

Set up the A side and the B side as two git worktrees and run the same command in each:

```bash
git worktree add /home/user/mion-probe HEAD
cd /home/user/mion-probe
rm -rf ts-go-runtypes/third_party && ln -s /home/user/mion/ts-go-runtypes/third_party ts-go-runtypes/third_party
cp -r /home/user/mion/mion-bin .          # the resolver binary, or the engine build fails
```

A worktree has no `node_modules`, so vitest cannot run there. That is fine for benchmarking: the
bench harness verifies every lane answers correctly and rejects an invalid payload before it
measures, which catches a broken variant. Run correctness tests in the main tree.

```bash
node scripts/website/bench-data/mion-bench.mjs sweep mion    # the 4 payload sizes for one lane
node scripts/website/bench-data/mion-bench.mjs one mion      # the three suites for one lane
# results land in container/mion-bench/results (git-ignored)
node container/mion-bench/aggregate.mjs --compare <beforeDir> <afterDir>
```

There is no flag for a single payload size; `sweep` runs all four. Copy the JSON out after each run
if you want to keep samples, since the next run overwrites them:

```bash
cp container/mion-bench/results/payload-sizes/huge/mion.json $SCRATCH/samples/merged-huge-1.json
```

Each result file carries `requests.mean`, `requests.stddev`, `latency`, `throughput`, `errors`,
`non2xx`, `timeouts` and a `memSeries` array. Read them together: a variant that looks fast but whose
output bytes per request dropped is answering wrongly, and `errors` / `non2xx` must both be zero.
Within-run `stddev` on the 4 MB lane is about 22% of the mean, which is why single samples prove
nothing.

**For anything smaller than a few percent, the server benchmark cannot see it at all.** Use the
in-process bench instead (`packages/router/src/resolveStrategy.bench.ts` already compares the three
shapes and is the place to add a fourth):

```bash
pnpm exec vitest bench --project router resolveStrategy
```

Two rules there, both learned the hard way:

- **Include a `control` case** that does unrelated arithmetic. If it moves between runs, the machine
  moved and the comparison is void. It read 2,472,106 and 2,462,758 ops/s across two runs here, 0.4%
  apart, which is what a usable comparison looks like.
- **Equalise the work.** The first version of this bench let the merged shape skip the path transform
  and the `contextDataFactory` call that the real resolve performs, and reported a fake 1.53x. Pulling
  those into a shared helper dropped it to 1.10x. Every variant must do the same work apart from the
  thing under test.

For garbage-collection questions, an isolated script with a `PerformanceObserver` on `gc` entries
works, with one trap: its callbacks are asynchronous, so a fully synchronous loop never receives them
and reports zero collections. The loop must yield (`await new Promise(setImmediate)`), which also
models a real streamed body spanning event-loop turns.

## Done when

There is one `CallContext` object per request, and an interleaved three-round comparison on the 4 MB
lane shows memory and requests per second no worse than the split, with the in-process bench no
slower. Or: the investigation shows the earlier result does not hold, the reason is written down, and
the merged shape ships on that evidence.
