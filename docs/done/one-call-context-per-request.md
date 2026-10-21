---
type: chore
spec: guidelines
status: done
created: 2026-09-12
---

# One CallContext object per request

## What shipped

One object per request, and nothing of the request's own alive while the body is read.

```ts
// packages/router/src/callContext.ts
export function resolveExecutionChain(path, urlQuery, rawRequest): MethodsExecutionChain
export function createContextFromChain(chain, path, urlQuery, reqHeaders, respHeaders, rawBody?, bodyType?): CallContext
export function createCallContext(...)   // the two in one, for a caller that already has the body
```

`resolveExecutionChain` returns the chain that was built at registration and allocates nothing. Every
constant a streaming adapter needed before the body rides on that shared chain instead of on a
per-request object: its own `path`, the folded `maxBodySize`, `readsBody`, `batchId` and
`batchRouteIds`. `ResolvedRequest` is deleted, and `dispatchPlatformError` takes the chain rather
than a context an adapter had to build first, so no platform calls `createContextFromChain` any more.

Folding `maxBodySize` onto the chain turned a per-request resolve into one field read, and it meant
the number had to be refreshed whenever either input moved. `refreshChainBodyLimits` runs from
`setPlatformConfig` and `initRoutes`; `declaredBodySize` holds what the route option or the params
types settled, so the platform cap can still be reapplied. That also fixed a pre-existing bug: a
batch chain built before a later `setPlatformConfig` kept an uncapped limit
(`refreshBatchChainBodyLimits`).

Four smaller allocations went with it:

- `request.body` starts as one shared frozen object. The parse replaces it wholesale, so the fresh
  object every request allocated was thrown away unread. Frozen because a write before the parse
  would otherwise have been a silent cross-request leak.
- `releaseRawBody`, a new router option defaulting to `true`. The parse is the only reader of the raw
  text, so it is dropped there. Turn it off for a handler that needs the original.
- `packages/platform-node` decodes the body from one Buffer when the socket delivered one, instead of
  concatenating into a second and decoding into a third.
- `packages/platform-uws` calls `ArrayBuffer.prototype.transfer(0)` on the body buffer once it has
  been decoded, which returns the backing store to the allocator immediately rather than waiting for
  the collector. Only on the path where uWS hands ownership to JS, after the existing zero-length
  tripwire.

Also fixed on the way: `dispatchError` asked for `SerializerModes.json` where the body was already a
string, so all three adapters re-stringified it and discarded the `rawBody` that was already there.

## The mechanism, which this doc used to say nobody had

An object that is alive across a multi-turn body read ages into the old heap, and whatever is
attached to it afterwards is promoted with it instead of dying young. The parsed graph of a large
body hanging off a promoted context is the cost. That is why the obvious `merged` shape lost, and why
the answer is not "allocate less" but "keep nothing of the request alive during the read".

Two earlier explanations were tested and refuted, and both were about the body STRING, which is
born in large-object space and is indeed not the problem. The parsed graph is, and an isolated model never
reproduced it because an isolated model has no multi-turn read to age the holder.

## The numbers

Base is the tree before this work (`8e23a11`), after is the final tree. Three rounds each, four
payload sizes, three lanes. Metrics are per-request ratios so the machine's drift cancels out of
them. A change counts only when the two ranges do not overlap.

The 4 MB uws lane, which is where the problem was:

| 4 MB, uws | base | after |
| --- | --- | --- |
| bytes promoted per request | 1.09 to 2.81 KB | 0.28 to 0.29 KB |
| major collections per 1000 requests | 94.3 to 95.9 | 68.2 to 68.6 |
| garbage-collection pause per request | 0.64 to 0.71 ms | 0.59 to 0.61 ms |
| requests per second | 86.8 to 89.6 | 94.4 to 97.4 |

The 4 MB node lane is smaller and mixed: peak resident memory fell from 349 to 362 MB down to 336 to
348 MB, major collections per 1000 requests rose slightly from 146 to 148 up to 150 to 154, and
throughput was unchanged at 61.6 to 62.9 against 61.7 to 65.0. Bytes promoted per request overlapped
widely on both arms, which is what a lane dominated by one huge parse looks like.

Every other size on every lane overlapped, meaning no regression at 1 KB, 100 KB or 500 KB. That was
the thing worth protecting: the original design change cost throughput at small payloads, and this
one does not.

## Two numbers that are honest rather than tidy

**Bun at 1 KB measured 7% slower and the ranges do not overlap**: 22,150 to 23,336 requests per
second on base, 20,873 to 21,482 after. It is the only non-overlapping regression in the whole grid.
Bun gets no garbage-collection trace, only peak resident memory and throughput, and its peak memory
was unchanged (91.3 to 93.6 MB against 92.3 to 93.4 MB). Bun at 100 KB, 500 KB and 4 MB all measured
equal or slightly better. So there is no mechanism to point at and the two arms were not interleaved,
which is exactly the condition this doc warns about. It needs a quieter machine to settle, and until
then it stands as an open question rather than a cleared one.

**Node's major collections at 4 MB rose about 3%** while its peak memory fell about 4%. Consistent
with a smaller old generation being collected more often, and small either way.

## Two method corrections worth keeping

Both produced a wrong answer that was reported before it was caught.

1. **An under-powered window invents results.** At roughly 160 requests per window, bytes promoted
   per request swung 15x within a single arm. The probe now warns and voids anything under 600
   requests, and records peak heap alongside.
2. **Unequalised bench arms invent results.** One arm of the in-process benchmark called the exported
   function while another inlined the same work, which produced a 1.12x ratio that flipped sign when
   the two arms were swapped. Every arm now goes through the same helper. This is the second time this exact mistake was made
   here: an earlier round of the same investigation reported a fake 1.53x the same way.

A third, smaller: an HTTP-level test of the multi-chunk body decode passed against a deliberately
broken decoder, because node coalesces small writes and the multi-chunk path never ran. The decode is
now an exported function with its own unit tests, verified to fail against the broken version.

## What is pinned

- `packages/router/src/contextAllocation.spec.ts`: the shared frozen body, `releaseRawBody` on and
  off, and that nothing per-request is alive before the body.
- `packages/router/src/resolveExecutionChain.spec.ts`: the chain a request resolves to is the
  registered object, and mutating it is not per-request.
- `packages/platform-node/src/bodyDecode.spec.ts`: one chunk, many chunks, multi-byte characters
  split across a chunk boundary.
- `packages/platform-uws/src/largeResponse.spec.ts`: a large response still arrives whole after the
  buffer release.
- `packages/devtools/test/gc-trace.test.ts`: the trace parser and its summary.

## What was tried and not shipped

`tryEnd` / `onWritable` for response backpressure in uws. Instrumentation showed `onWritable` never
fired on this workload, its test passed against a broken byte-offset version, and it added a full
Buffer copy. Reverted. The open question it leaves, that nothing caps or observes uWS's own
backpressure buffer while a slow client drains a large response, has its own spec.

Building `context.shared` lazily through an accessor. It doubled the 1 KB heap (21 to 45 MB), raised
peak resident memory from 103 to 148 MB and cost 6% throughput, because `Object.defineProperty` with
an accessor pushes every context into V8's dictionary mode. One empty object per request is far
cheaper.

## How to measure this again

`pnpm miondevx bench servers gcprobe` is the tool that came out of this work, and
`container/mion-bench/README.md` documents it. The short version:

```bash
git checkout <base> -- packages/
pnpm miondevx bench servers gcprobe --label base --sizes small,medium,large,huge
git checkout HEAD -- packages/
pnpm miondevx bench servers gcprobe --label after --sizes small,medium,large,huge
pnpm miondevx bench servers gcprobe --compare base after
```

Restoring only `packages/` keeps the harness identical while the measured code varies. Note that
`git checkout <ref> -- packages/` also stages the revert, so reset the index before committing
anything.

Two rules that did not change: never trust a number from another machine or another day, and never
call a difference real unless the two ranges do not overlap.
