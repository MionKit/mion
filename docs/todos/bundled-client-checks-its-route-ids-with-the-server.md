---
type: feature
spec: guidelines
status: parked
created: 2026-09-20
---

# A bundled client checks its route ids against the server

## Intent

A client built with `bundleApi: 'bundled'` carries compiled validators and serializers keyed by
route ids that fold in the param shape, the return shape and the runtypes version. It never asks the
server anything, so when the server moves on (a route renamed, a param added, a version bump)
nothing notices. The client keeps calling with code compiled against an API that no longer exists.

`mion api-check` already catches this at build time by comparing the two manifests, but only when
both build outputs sit on the same machine. A client deployed against a server that changed
afterwards has no check at all.

## Direction

Mirror what the optimistic metadata request already does, and the implementer plans the details.

- **Piggyback, do not preflight.** `createMetadataSubRequest` already rides the same request body as
  the call it belongs to, and the server answers in the same response. The id check should work the
  same way: send the route's params and return ids with the first request, in that request, so a
  correct client pays one round trip and not two.
- **The server answers in that same response.** On a mismatch it returns the correct metadata
  alongside the result, so the call recovers rather than failing. The server half sits next to
  `mionGetRemoteMethodsDataById` in `packages/router/src/routes/client.routes.ts`, which already
  knows how to serialize a method for a client.
- **Remember the answer** so later calls skip the check.

Three things to settle, called out because each one changes the shape:

1. **Where the checked flag lives.** A bundled client currently ships no storage code at all, which
   was the point of loading the metadata code on demand. `localStorage` is a few lines but puts a
   storage path back into every bundled client; the existing store (`lib/storage.ts`,
   `lib/metadataStore.ts`) reuses a tested abstraction but drags the whole thing in; memory only
   re-checks once per page load and keeps the bundle clean. Weigh the cost of the check against what
   remembering it costs to ship.
2. **What gets checked and when.** Per route on first use, or every bundled route in one go on the
   first request.
3. **What a mismatch means for the app.** Recover silently on the server's metadata, or also report
   it, since a mismatch means the deployed client is stale and someone should know.

## Docs

`container/website/content/01.rpc/03.client/05.bundled-api.md`, a new section next to
*Checking a Release*, which today only covers the build-time `api-check`. The client's metadata
cache page may need a line too if the flag ends up stored.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page
and example this change touched, review its report against the code, and commit it as its own
commit.

## Done when

- A bundled client calling a server whose route ids no longer match recovers on that same request,
  without a second round trip.
- A client whose ids match pays at most one check, and the cost of remembering that is a deliberate
  choice rather than an accident.
- A bundled client that never meets a mismatch still ships no metadata store.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (researched 2026-09-22, not implemented)

Parked before any code was written. Everything below is the plan that was approved, plus the facts
it rests on, so a later session does not have to re-derive them.

### The three open questions, answered

| Question | Answer |
| --- | --- |
| Where the checked flag lives | The existing store (`packages/client/src/lib/metadataStore.ts`), one record per baseURL and method id |
| What gets checked and when | Only the ids of the request going out (the route plus its middleFn chain), on first use, skipping ids already checked |
| What a mismatch means | Recover on the server's metadata, and also report it as an `RpcError` in the call's undeclared slot |

A follow-up decision settled the cost of the store choice: keep it, change the promise, and keep the
main bundle to only what is strictly necessary. Everything else sits behind a dynamic import, the way
`#metadata-from-server` already does.

### What the existing pieces already give us

- The server holds `paramsJitHash` and `returnJitHash` on every executable, both derived from the
  injected markers (`packages/core/src/runtypes/mionAdapter.ts:307`), and `getSerializableMethod`
  already puts both on the wire (`packages/router/src/lib/remoteMethods.ts:66`).
- A bundled client builds its rows from the same markers, so it carries the same two hashes
  (`packages/client/src/lib/bundledApi.ts:104`). Comparing the pair IS the check.
- The piggyback already exists: `mionMethodsMetadata` is a middleFn in every chain, and
  `runMethodsMetadataOnDemand` skips the whole params pipeline when its body slot is absent
  (`packages/router/src/routes/client.routes.ts:74` and `:108`).
- `#metadata-from-server` is replaced by an empty stub under `bundleApi: 'bundled'`
  (`packages/devtools/src/core/unplugin.ts:987`), so recovery cannot reuse the fetched lane and needs
  its own module.
- `getMethod` prefers the bundled shelf over the fetched one
  (`packages/client/src/lib/methods.ts:28`), so a repaired row only takes effect if the bundled row
  is dropped first.
- `deserializeJsonResponseBody` is already `async` (`packages/client/src/lib/serializer.ts:138`), so
  a repair can be awaited before the decode loop runs, and the route's return is then decoded with
  the repaired functions.
- The server pins `parser: {params: 'clone'}` on the metadata middleFn, so the plain JSON form is the
  wire form. A bundled client has no compiled functions for that id and can write the slot itself.

### Design

**Wire shape** (`packages/core/src/types/method.types.ts`)

```ts
/** One bundled method's compiled type ids, sent so the server can say whether they still match. */
export interface MethodIdCheck {
  id: string;
  paramsId: string;
  returnId: string;
}
```

Add `staleIds?: string[]` to `SerializableMethodsData`, beside the existing `batches?`. The server
always sets it, possibly empty, whenever checks were sent. A server that predates this change
ignores the new param and answers nothing, so the client stores no flag and re-checks next time.
That is the version-skew guard.

**Server** (`packages/router/src/routes/client.routes.ts`)

`mionMethodsMetadata` gains a third param `idChecks?: MethodIdCheck[]`, and stops returning early
when `methodsIds` is empty but checks are present. A new `collectStaleIds()` looks each id up with
`getMiddleFnExecutable(id) || getRouteExecutable(id)` and marks it stale when the executable is
missing or either hash differs. Stale ids join `idsToReturn`, so `addRequiredRemoteMethodsToResponse`
serializes them and their middleFn chains. An id the server no longer declares falls into the
existing `errorData` path and the slot answers `rpc-metadata-not-found`, which is the honest answer:
the route is gone and there is nothing to recover to.

`maxBodySize: 4096` on that middleFn stays. Rows are bounded by chain length. Check against
`packages/router/src/maxBodySize.spec.ts`.

**Client, main bundle** (only what has to be there)

- `src/lib/apiIdCheckLoader.ts` (new, small): `loadApiIdCheck()` dynamic-imports `#api-id-check`
  once, mirroring `metadataFromServerLoader.ts`, plus the pending mismatch error the lane sets and
  `client.ts` takes.
- `src/request.ts`: in `makeCall`, ask the lane which bundled ids still need checking, and add, or
  merge into the optimistic one, a `mion@methodsMetadata` sub request with `[ids, false, checks]`.
  After the response, if the lane repaired anything and the call failed with a serialization or
  validation error, reuse `retryWithProperSerialization` once.
- `src/lib/serializer.ts`: write the `mion@methodsMetadata` slot as plain `JSON.stringify(params)`
  when the client has no compiled functions for it (`useMethodFns` would throw). On the response
  path, when the body carries the metadata key and there is no cache hook, await the lane before the
  decode loop.
- `src/lib/methods.ts`: add `dropBundledMethod(id)`.
- `src/client.ts`: one more line beside `takeBundledApiError()` to take the mismatch error into the
  undeclared slot.
- `src/lib/storage.ts`: add `'c'` to `MetadataKind`.
- `src/lib/clientMethodsMetadata.ts`: ignore `'c'` records when hydrating, so the metadata cache does
  not treat them as its own.

**Client, lazy lane** (`src/lib/apiIdCheck.ts`, new, behind an `#api-id-check` entry in the package's
`imports` map, never stubbed by devtools so both `bundled` and `mixed` reach it)

- `idsNeedingCheck(ids, options)`: hydrates this baseURL's `'c'` records once, then keeps only
  bundled ids whose stored pair differs from the bundle's current `paramsJitHash|returnJitHash`.
  Storing the verified pair rather than a bare flag is what makes a rebuilt client re-check.
- `buildChecks(ids)`: the `MethodIdCheck` rows.
- `applyCheckResult(parsedBody, options)`: unwraps the union envelope and deletes the key the way
  `extractAndProcessMetadata` does, installs the server's methods with `addSerializedJitCaches` and
  `addRoutesToCache`, calls `setFetchedMethods(routesCache)` and `dropBundledMethod` per stale id,
  records the mismatch `RpcError`, and writes a `'c'` record for every checked id that was NOT stale.
  A stale id gets no flag, so a stale deployment keeps recovering on every page load until rebuilt.
- Imports `@mionjs/run-types/formats` for the same reason the fetched lane does: functions arriving
  over the wire do not carry the run-types-owned format pure fns.
- It does not pull in `clientMethodsMetadata.ts`, `metadataEviction.ts` or `persistentStorage.ts`, so
  no eviction, write queue, byte accounting or persistence prompt reaches a bundled client.

### Tests

Not a fuzz candidate: a protocol handshake with no cheap round-trip, determinism or
trusted-source oracle. The Marker test coverage rule does not apply, no `getRunTypeId` call shape
changes.

Router (`packages/router/src/routes/client.routes.spec.ts`, the multi-entry-body describe at line
418): checks that all match answer `staleIds: []` and no methods; a changed `paramsId` puts the id in
`staleIds` with its metadata and its middleFn chain; a checked id the server no longer declares
answers `rpc-metadata-not-found`; checks ride the same body as a real route call and both slots
answer.

Client bundled lane (`packages/client/test/bundled/bundled.spec.ts`): the first call carries the
check slot and the second does not; the store is read once and the flags written;
`isMetadataFromServerLoaded()` stays false, proving the new lane is separate; a server whose hashes
moved is recovered on that same response, the bundled row is replaced and the undeclared slot carries
the mismatch error; a second client against the same store sends no check.

Client mixed lane (`packages/client/test/mixed/mixed.spec.ts`): bundled ids are checked there too,
fetched ids are not.

Both lanes already exist as vitest projects (`client-bundled`, `client-mixed`) and are already in the
`mion-rest` batch, so `scripts/core/test-batches.mjs` needs no change.

### Docs

`container/website/content/01.rpc/03.client/05.bundled-api.md`: a new section after *Checking a
Release* covering the runtime check, what a mismatch does and where the error shows up; and the mode
table's *Browser cache* cell for `bundled` changes from "Never touched" to the flags it now keeps.

`container/website/content/01.rpc/03.client/02.metadata-cache.md`: one line saying a bundled client
stores only these flags, not route metadata.

PR labels: `website` and `pre-publish-e2e` (a new `imports` entry and a changed public wire shape).

### Three things this change breaks and must update

- `packages/client/test/bundled/bundled.spec.ts:90` asserts the bundled client never asks for
  metadata, and `:100` that it never reads or writes the store. Both become false.
- The mode table in `container/website/content/01.rpc/03.client/05.bundled-api.md:24-28` says the
  browser cache is "Never touched" under `bundled`.
- This spec's own Done-when bullet "A bundled client that never meets a mismatch still ships no
  metadata store". Under the decision above a bundled client does open the store, for the flags only.
  Rewrite that bullet to what actually ships.
