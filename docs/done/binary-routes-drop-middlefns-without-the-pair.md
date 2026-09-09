---
type: fix
spec: guidelines
status: done
created: 2026-09-09
---

# A binary route silently drops every middleFn in its chain that has no binary pair

## Intent

On a route whose encoder was `binary`, any middleFn in its chain that did not itself compile the
binary pair had its params and its result **dropped from the wire entirely**. Not encoded as JSON
alongside, not an error: absent. The caller saw `undefined` and nothing said why.

The body writer skipped any method whose `toBinary` was missing:

```ts
// packages/core/src/binary/bodySerializer.ts:153
const toBinary = isResponse ? method.returnJitFns.binary?.toBinary : method.paramsJitFns.binary?.toBinary;
if (!willSerialize(method, value, toBinary, isResponse)) continue;
```

The only signal was a one-time `console.warn` from `ensureBinaryJitFns`.

This became the default with the per-route encoder change (`68d98bd feat(router)!: per-route encoder
strategies`). Before it, every method compiled every encoding, so any middleFn could ride a binary
body. After it the pair was opt-in per method, so **the default for every middleFn was no binary
pair**, and a binary route with ordinary middleFns lost their data.

Found while getting the pre-publish e2e consumer lane green: its `binarySession` middleFn returned
`undefined` on every binary route until the fixture declared `encoder: 'binary'` on the middleFn
itself.

## What Shipped

**The binary wire was removed from mion rather than repaired.** The maintainer's call, taken after
the investigation below, on these grounds:

- `compact` already drops every key name from an object and measures 40 to 60 percent fewer bytes
  than keyed JSON, so binary's remaining edge was fixed-width numeric formats only.
- There was no binary lane in the HTTP server benchmarks, so binary's win over compact on a real
  wire had never been measured in this repo.
- Version was `0.12.2` with the first unified `@mionjs/*` release not yet cut, so the framework's
  binary wire had never shipped under this scope.
- The feature was large and load-bearing across seven platform adapters, a buffer pool, size
  statistics and a measure pass, all for an unmeasured win.

`encoder` now takes the four JSON strategies only: `clone`, `mutate`, `direct`, `compact`. There is
no deprecation path and no tombstone key; `encoder: 'binary'` is rejected by the generic strategy
error, which names the strategies that exist. Everything else reads as if the binary wire never
existed.

**RunTypes' own binary codec is untouched and still published**: `createBinaryEncoderFn` /
`createBinaryDecoderFn`, the `tb` / `fb` families, the whole Go emitter side, the lint rules and the
serialization-formats benchmark. Nothing in Go knows about mion's `encoder` option, it only emits
the families a marker's type asks for.

### Removed

- `packages/core/src/binary/` in full (9 files, 1384 lines) and its six re-exports from
  `packages/core/index.ts`: the body serializer and deserializer, the size-classed buffer pool, the
  DataView wrappers, the per-method size statistics and `configureBinary`.
- `SerializerModes.binary`, `JitBinaryFunctions`, `JitCompiledFunctions.binary`, the `toBinary` /
  `fromBinary` cache keys, `jsonStrategyOf`, `getJitFnHashes`'s `needsBinary` parameter, the `tb` /
  `fb` handling in the reflection adapter and the compile-time binary size estimates.
- `compileBinaryForMiddleware` and the whole chain-collection walk it fed (the `binaryMiddlewares`
  set threaded through `recursiveFlatRoutes` / `recursiveCreateExecutionChain`), plus
  `ensureBinaryJitFns` and the binary branch of `assertCompiledEncoder`.
- The binary slots of `MarkerSlots` in `packages/router/src/types/encoder.ts`. Those slots already
  resolved to `never` for every non-binary route, so this is not a cache-key change.
- The client's binary request and response lane and the `application/octet-stream` content type.
- The binary paths, buffer-pool wiring and `binary` server option of all seven platform adapters,
  including the now-unreachable `binary-not-supported` throw in `platform-aws`.

### Kept working

The three internal error routes and the metadata middleFn are declared outside any router factory,
so the build compiles them against the built-in default encoder. They used to pin `binary`, whose
companion JSON pair was that same default. They now pin `{params: 'clone', return: 'clone'}`
explicitly: without it a router-wide `encoder` would be the pair the runtime resolves and the two
would disagree at start-up. The tests caught this.

One behaviour changed as a result: a not-found response used to frame as bytes (the notFound route
pinned `binary`) and left `response.body` holding the live `FatalError`. It now frames as JSON, so
`response.body` holds the error's wire shape, like every other error response.

## Tests

- The binary-only suites were deleted: the router's `dispatch.binary`, `serializer.binary`,
  `binaryPooled`, `writeList` and `measurePass` specs, the client's `serializer.binary` spec, the
  bun and uws binary specs, both binary buffer benches and core's own binary specs.
- The partly-binary suites were rewritten onto `compact` or `direct`: the router's `encoder` and
  `dispatch` specs, the node and gcloud adapter specs, core's `mionAdapter` spec, and the devtools
  `wrapper-strategy-families` test.
- The router's HTTP security fuzz runner lost its binary body-attack lane and gained a `compact`
  one: the compact wire is positional JSON, so the same body attacks apply to a shape the decoder
  reads by index rather than by key.
- **Three new pins close this todo:**
  1. `packages/router/src/encoder.spec.ts` — `encoder: 'binary'` is rejected on a route, on a
     middleFn and on the router option, and the error names the strategies that do exist.
  2. `packages/router/src/encoder.spec.ts` — a **plain middleFn declaring no encoder of its own**
     carries its params AND its return value on a `compact` route's wire. This is the direct
     replacement for the silent drop: it proves a non-default wire carries every chain member.
  3. `packages/devtools/test/wrapper-strategy-families.test.ts` — no strategy resolves the `tb` /
     `fb` families, so a route never compiles the binary pair however its encoder is written.
- The same plain-middleFn case is pinned end to end in the two fixtures that found the original bug:
  the `compact` group of `@mionjs/test-server` and the pre-publish e2e consumer lane.

## Docs

Rewritten so binary is simply absent, never marked as gone. The RPC serialization page lost the
`binary` row and its four binary sections, with `compact` promoted as the smallest-payload strategy;
the security page lost the binary envelope row. The three binary router examples were deleted.

The deep-dive article was almost entirely about the **codec and format**, which stays, so it moved
to the runtypes subsite, was reframed as the RunTypes binary codec rather than a mion protocol, and
is linked from the runtypes binary guide. Its old URL redirects.

`CHANGELOG.md` was not edited: it is history, and its binary entries describe releases that really
shipped.

## Fixed Along The Way

`packages/test-server/README.md` documented `serverType`, `TEST_PORT_MAPPING`, `BinaryTestServerApi`
and "Jest integration", none of which exist in that package. Stale doc on the same code path, so it
was rewritten in this change with its own commit.

## Investigated And Not Taken

Three other options were weighed before the removal:

- **Binary router-wide only.** Removing `binary` from the per-route option would have made the bug
  structurally impossible, because a router-wide `encoder: 'binary'` already reaches every middleFn
  by type through `MarkerSlots<..., RouterOpts>`. Small and surgical, but it keeps an unmeasured
  feature alive.
- **Upgrade the chain at build time**, which is what `compileBinaryForMiddleware` promised. Not
  feasible: the pair is compiled at build time from the encoder literal, long before the router sees
  a chain, and the chain is only known at registration.
- **Make the mismatch a startup error.** Cheap, but it makes authors annotate every middleFn by
  hand, which is worse day to day than the thing it fixes.
