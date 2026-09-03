---
type: fix
spec: guidelines
status: ready
created: 2026-09-03
---

# Security audit of the mion RPC framework, plus an HTTP-level fuzzer

## Intent

mion has never had a security pass. The request path (platform adapter, body parsing, route
lookup, header handling, deserialization, validation, error envelope) needs to be read with an
attacker's eyes, every probable hole fixed or defended, and the result pinned by tests so it cannot
regress. The same task adds a small HTTP-level fuzzer that throws junk at a running router and
checks a handful of rules that must hold for every request.

The spike that produced this doc verified several concrete problems by running code, listed
below. They are the starting point, not the whole audit.

## Verified findings (fix these, then keep looking)

Ranked by severity. Each was reproduced on this tree.

1. **A six-byte binary body kills the server process.** The binary body framing reads an element
   count from the wire and allocates before checking there are bytes to back it. `packages/core/src/binary/bodyDeserializer.ts:28` reads `itemsLength` as a raw uint32 and loops that many
   times; the compiled per-route decoder (`ts-go-runtypes/internal/cachegen/typefunctions/binary_from.go:282`) does `new Array(len)` with `len` from an unbounded varint and then loops
   `len` times. A request whose body is the varint for `2^31` followed by nothing made the vitest
   worker die with `FATAL ERROR: invalid table size Allocation failed - JavaScript heap out of memory`. A count of `2^24` with no data returned a 16 million element array of empty strings in
   four seconds. Any platform adapter that accepts `content-type: application/octet-stream` is
   exposed (`packages/platform-node/src/mionHttp.ts:150`). The fix belongs on both sides: the
   framing must bound the count by the remaining byte length, and the RunTypes decoder must do the
   same (that half is the RunTypes audit's job, coordinate so both land).
2. **Out-of-range reads in the binary reader are silent.** `desLength()` and `desString()` in
   `packages/run-types/src/runtypes/dataView.ts:686-707` index a `Uint8Array` past its end and get
   `undefined`, which the varint loop treats as zero and the string decoder as an empty slice. A
   truncated buffer decoded to `["hello","world","a"]` instead of failing; a string whose declared
   length exceeds the buffer decoded to the bytes that were there. Garbage in, garbage accepted.
   Every read must fail loudly on a short buffer (shared with the RunTypes audit).
3. **Route id lookups walk the prototype chain.** `packages/core/src/routerUtils.ts:71-77` keeps the
   method cache in a plain object and tests membership with `in`. Ids like `constructor`,
   `toString` or `__proto__` come back as found (`hasMetadata('constructor')` is `true`), and
   `getMethodJitFns` then throws a generic `Jit function isType not found for jitHash undefined`
   instead of reporting an unknown route. Binary bodies name their routes on the wire
   (`bodyDeserializer.ts:35`), so this is reachable. Use a `Map` or a null-prototype object and
   `hasOwnProperty` semantics everywhere a wire string indexes a table (also
   `packages/router/src/lib/headers.ts:27-49`, which does the same with the header record).
4. **Deserialize runs before validate, on raw input.** `packages/router/src/dispatch.ts:120-146`
   calls `restoreFromJson` first and `isType` after. The restore step runs type transforms on
   untrusted values (`new RegExp(src, flags)`, `BigInt(v)`, `Temporal.X.from(v)`), so bad input
   throws a raw JS error that is mapped to a `serialization-error` with the engine's message copied
   into `errorData.deserializeError`. Decide the contract (a typed 4xx with no engine text) and pin
   it. Also decide the policy for `RegExp` in route parameters: a client can send any pattern and
   validation accepts it, so a handler that runs it on a string is open to catastrophic
   backtracking. A build-time warning for `RegExp` in a route's params type is probably the right
   defence.
5. **Engine error text reaches the client.** `bodyDeserializer.ts:55`, `dispatch.ts:199` and
   `packages/router/src/routes/serializer.routes.ts:40` copy `err.message` into `publicMessage` or
   `errorData`. Stack traces do not leak (checked: `stack` stays non-enumerable and `JSON.stringify`
   of an `RpcError` carries only the public fields), but messages like
   `Offset is outside the bounds of the DataView` are still internal detail. Replace with fixed
   public strings and keep the original on `originalError` for server logs.
6. **Body size limits are uneven.** node and uws enforce `maxBodySize` (256 KB default). bun passes
   it to the runtime but its own test marks the limit as not working (`packages/platform-bun/src/bunHttp.test.ts:117`). cloudflare, aws, gcloud and vercel have no limit at all and rely on
   the platform. Decide and document the contract per adapter; add a router-level guard on
   `rawBody` length so no adapter can forget it.
7. **No depth or recursion limit anywhere.** `JSON.parse` of a deeply nested valid document plus
   a recursive route type makes the compiled validator recurse to a stack overflow, which the router
   reports as an unknown 422 error. Not a crash, but worth a documented bound.

## Direction

The implementer plans the details. Constraints and pointers that were checked:

- **Read the whole request path once, end to end,** for each adapter: body read → `queryBody.ts`
  → `serializer.routes.ts` (`deserializeRequestBody`) → `dispatch.ts` → handler → response
  serialization → `dispatchError.ts`. Note every place a wire string indexes an object, every
  `JSON.parse`, every `for...in` over parsed data, every spread of parsed data onto an existing
  object, and every message copied into a response.
- **Already guarded, keep it that way:** the routesFlow query is shape-checked at one trust boundary
  (`packages/router/src/routesFlow.ts:71-127`), server mappers are allow-listed
  (`packages/core/src/runtypes/serverMappers.ts:43-70`), error envelopes drop `message`, `name`
  and `stack`, and the route table itself is a `Map` (`packages/router/src/router.ts:59-65`).
- **The client materializes server-sent code** with `new Function`
  (`packages/core/src/runtypes/mionAdapter.ts:122`, restored from localStorage in
  `packages/client/src/lib/clientMethodsMetadata.ts:96-140`). That is the design (the server is the
  trusted party), but an unsigned code cache in localStorage is a persistence vector after any
  cross-site scripting bug. Record the threat model in the docs and consider an integrity check
  keyed on the server's build id.
- **The metadata route** (`packages/router/src/routes/client.routes.ts`) answers any list of ids.
  Confirm `isPrivateExecutable` hides everything that should be hidden and that the
  `getAllRemoteMethodsMaxNumber` cap holds.
- **Other areas to cover** even without a finding yet: header count and size, the `x-rpc-error`
  response header value, `content-length` handling on each adapter, behaviour on a body that is
  valid JSON but not an object or array, and the binary response path with a handler return value
  that does not match its declared type.
- **The HTTP fuzzer.** Add a lane under the router or test-server package that starts the router
  in process (or `packages/test-server`), sends generated requests (random paths including
  prototype names, JSON bodies mutated from valid ones, binary bodies with flipped bits, inflated
  lengths and counts, truncation, random headers) and checks rules that hold for every request: the
  process stays alive, every response is a well-formed envelope, malformed input never yields a
  5xx, no response body contains engine error text or a file path, and each request finishes inside
  a time budget. Reuse the seeded loop and crash guard from
  `packages/run-types/test/fuzz/core/` so findings replay by seed. Register the lane in the `FUZZ`
  table in `scripts/miondevx.mjs`, the env registry, the CI partition pinned by
  `packages/devtools/test/fuzz-lane-contracts.test.ts`, and the fuzz README.
- **Docs.** The website gets one page under `container/website/content/01.rpc/02.server/` that
  states the security contract in plain words: what the router validates, what limits apply per
  adapter, what an error envelope can contain, and what is the app's own responsibility (auth,
  CORS, rate limiting). Follow the writing rules in `container/website/CLAUDE.md`.

## Done when

- Every verified finding above is fixed with its own test (a crafted request per finding), and
  the binary count fix is proven on both the framing and the RunTypes decoder.
- The audit produced a short written list of what was reviewed and the verdict per area; every
  new finding is fixed in the same PR or delegated to a parallel session.
- The HTTP fuzzer lane runs in `pnpm test` at a fixed budget, is enrolled in the quick and soak
  tiers, and its first soak is clean.
- The website documents the security contract per adapter.
