---
type: fix
spec: guidelines
status: done
created: 2026-09-03
updated: 2026-09-04
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

## Plan (approved 2026-09-04)

Re-audited after the two RunTypes PRs landed (the fuzz lanes with bounded binary reads, then RegExp
off the wire, prototype keys refused, typed decode errors, exact bigint wire). Decisions:

- **Decode before validate stays.** The decoder owns the minimum wire-shape check (a Date only from
  a string, a bigint only from a whole-number string, a Map or Set only from an array) and that
  becomes an enforced contract: a `MustValidateJson` kind table in the Go emitter, a Go test and a
  generated-code oracle that fail when a transforming arm is not guarded, plus internal docs.
- **Metadata is public by design.** Every route, and every middleFn that takes params or returns
  data, answers metadata because the client needs it; raw middleFns and data-less middleFns do not.
  No hiding feature; `isPrivateExecutable` is renamed to say what it means and tests pin the set.
- **Fuzz lane `sechttp`**: seeded requests through `dispatchRoute` in process plus a raw-socket
  slice over platform-node for the adapter rules.

Fix list (each with its own crafted-request test): bounded binary framing count, empty buffer and
trailing bytes; null-prototype route table and header record with own-key lookups; fixed public
error strings with the engine text kept on `originalError`; a validated base64url query body (the
`atob` throw crashed the node and uws processes); a router-level `maxBodySize` (413) every adapter
inherits, with node checking before buffering and destroying the stream, bun's option order fixed,
and bun/cloudflare/vercel parsing inside their guards; falsy JSON bodies rejected; a JSON error
envelope when a binary response cannot be serialized; a typed `request-nesting-too-deep`; the
routesFlow chain cache keyed by the transformed paths; `x-rpc-error` sanitized and uws refusing CRLF
in header values; unsafe route names rejected at registration; the metadata id list refreshed after
a later `registerRoutes`; node/gcloud response `headers.entries()` fixed; the client cache restore
using null-prototype maps and refusing prototype-named namespaces. Docs: a security page under the
rpc server section with the per-adapter limits table.

## Shipped (2026-09-04)

Everything below landed in one PR, each fix with its own crafted-request test. The audit table
records what was reviewed and the verdict per area.

### Audit table

| Area | Verdict | What shipped |
| --- | --- | --- |
| Binary framing count (`core/src/binary/bodyDeserializer.ts`) | raw uint32, unbounded; an empty body threw engine text | count read through `desCountU32`, bounded by the bytes left (every item names a registered method or throws, so the loop cannot outrun the buffer); a body shorter than its header, trailing bytes and an unknown key are typed errors with fixed text; the body is a null-prototype object; a method with no binary decoder answers like an unknown one (no id oracle) |
| Silent short reads | fixed upstream (#221, #222) | pinned by `binaryDecodeBounds.test.ts`; the router test proves a truncated body is a typed error |
| Route id lookup (`core/src/routerUtils.ts`) | plain object + `in`: prototype names were "found" | null-prototype table, so a plain read is an own-key read |
| Header record (`router/src/lib/headers.ts`); node's `req.headers` is a plain object too | `has('constructor')` was true on every request | a read checks the value's type (a prototype hit is never a string; 14 ns against 23 ns for an own-key check), `__proto__` never written; node/gcloud response `entries()` / `keys()` fixed |
| `for (const name in headersMap)` over a handler-returned HeadersSubset | inherited keys became headers | `Object.keys` |
| `x-rpc-error` header (`dispatchError.ts`); uws wrote header values unchecked | header injection on uws, a throw inside the error handler on node | only a plain token reaches the header (else `unknown-error`); uws drops a value with CR/LF/NUL; the fatal envelope sets the header too |
| Engine text on the wire (`serializer.routes.ts`, `dispatch.ts`, `bodyDeserializer.ts`, `bodySerializer.ts`, `routesFlow.ts`) | V8 / decoder messages, echoed wire keys | fixed public strings, the original on `originalError` for the logs; `deserializeError` keeps the `RTSerializationError` shape with fixed text |
| `?data=` query body: `fromBase64Url` → `atob` threw, every adapter decoded it outside its guard | **one GET crashed the node and uws processes** | `decodeQueryBody` turns the `atob` throw into `invalid-query-body` (no regex pre-check: it doubled the cost of every query-body request to refuse what `atob` refuses anyway); every adapter decodes inside its guard |
| Body size: no router option; node checked after buffering and never destroyed the stream, 413 answered as 500; bun's limit could be overridden by `options` and was absent in middleware mode; cloudflare/aws/gcloud/vercel had none | uneven | router option `maxBodySize` (256 KB) checked before parsing on every platform, honouring the platform's own number where it has one; `StatusCodes.PAYLOAD_TOO_LARGE`; node pre-checks `content-length`, checks before keeping a chunk and destroys the stream; bun's limit sits after the user options and its test is real again |
| Malformed JSON on bun / cloudflare / vercel (`req.json()` outside the try) | runtime 500, no envelope | the body is read as text and parsed by the router inside the guard |
| Falsy JSON body (`null`, `0`, `false`) | accepted as an empty body | `invalid-request-body` |
| Binary response with a return value that does not match its type | no payload, the node socket never ended | the envelope falls back to JSON with the typed error; no adapter dereferences a missing payload |
| Deep nesting | RangeError inside `isType` was `unknown-error`, inside `restoreFromJson` leaked engine text | `request-nesting-too-deep` (422) on both |
| routesFlow chain cache keyed on `urlQuery` while chains depend on `pathTransform(rawRequest)` | one request's chain served to another | the key carries the transformed paths; `routes` capped at 32 |
| Client localStorage restore (`clientMethodsMetadata.ts`) | `Object.prototype` pollution primitive from a server-chosen namespace | null-prototype maps, prototype-named namespaces / names / hashes refused on store and restore, entries keyed by their storage key |
| Metadata route | public by design | `isPrivateExecutable` renamed `hasClientMetadata`; tests pin the exact set (every route, every param / header / return middleFn; raw and silent middleFns absent); the website says so |
| `getAllExecutablesIds` memo | stale after a later `registerRoutes` | invalidated per call |
| Route names `__proto__` / `constructor` / `prototype` | accepted | refused at registration |
| aws binary response | bare `Error` (opaque 500) | typed `binary-not-supported` |
| RegExp in route params | closed by #222 (a tuple position is a build Error) | documented on the security page |
| routesFlow query shape check, server mapper allow-list, error envelope enumerability, `flatRouter` Map | sound | kept, covered by the fuzz oracles |

### The MustValidateJson contract

Decode stays before validate. The decoder owns the minimum wire-shape check and that is now enforced:
`reflection.MustValidateJson` (`ts-go-runtypes/internal/reflection/must_validate_json.go`) lists every
kind whose JSON restore converts a wire value (bigint, bigint literal, symbol literal, Date, the
Temporal kinds, Map, Set, the union envelope); `must_validate_json_test.go` renders both JSON roads
for each and fails on an unguarded call, and on a transform under an unflagged kind; the `GC-GUARD`
generated-code oracle runs the same predicate over every emitted decoder body (nasty corpus in
`pnpm test`, the `secgen` fuzz lane). Two arms were still unguarded and are now: the symbol literal
(`Symbol:` prefix only) and the union envelope unwrap (the shape is checked first, so `null` no longer
throws a raw TypeError; a value that is not a two-slot array is refused with the typed union error,
since a bare value left in place could pass validation as the wrong member). Documented in `ts-go-runtypes/CLAUDE.md`, the root `CLAUDE.md`
and the runtypes guide page *Decoding Untrusted Input*.

### The sechttp fuzz lane

`packages/router/test/fuzz/security/` on the RunTypes fuzz core: seeded attacks through
`dispatchRoute` in process (paths with prototype names, JSON trees and JSON text mutated from valid
bodies, binary bodies with flipped bits, inflated varints, count bombs and trailing bytes, junk
`?data=`, mutated routesFlow queries, hostile headers) plus raw HTTP at the node adapter on a free
port (content-length past the limit or lying, chunked overflow, junk `?data=`, prototype header
names, oversized header, garbage). Oracles SH-ALIVE, SH-ENVELOPE, SH-NO5XX, SH-NOLEAK, SH-TIME and
SH-PROTO. Registered as `sechttp` (quick 10 s / soak 60 s, `MION_FUZZ_SECHTTP_SOAK_MS`), in the env
registry, `.env.sample`, the ci.yml time-boxed step and sweep exclude, the soak dispatch choices and
the fuzz README; the first 60 s soak was clean. Its first batch run found two harness bugs and no
router finding beyond the fixes above.

### Docs

The website page *Security* under the rpc server section (what the router checks, error responses,
the per-platform body limits, public metadata, what stays the app's job), one line on the node and
bun platform pages, and the runtypes decoding page section on the shape check.

### Performance pass

Every hot-path addition was measured after the fixes landed and trimmed to what the guarantee needs:
no base64 regex before `atob` (85 to 170 ns per query-body request for nothing), no `Object.hasOwn`
on header reads (a `typeof` on the loaded value, 14 against 23 ns) nor on the null-prototype route
table, no per-request `Object.keys` over the method table for the binary count (the bytes-left bound
is the guarantee), and a single char-code pass for the uws header check. The `x-rpc-error` token
check keeps its regex: error path only, and a char loop measured the same 60 ns.

### Lint rule for prototype-named properties

`@mionjs/no-unsafe-property-names` (ESLint) and `runtypes/unsafe-property-name` (the UPN001 route
for oxlint) refuse a property named `__proto__`, `prototype` or `constructor` in any interface,
type literal or class, optional members included, so the declaration shows up in the editor before
a build and for types no route reaches yet. There is no optional escape lane: the only way past it
is an intentional `eslint-disable` comment on a type that describes a real constructor and never
crosses the wire (the one such spot in the tree, the drizzle completeness spec, carries one). Writing
the rule found that the compiler's own check looked at the root type's direct members only, so a
nested `{inner: {constructor: string}}` slipped through UPN001 and its decoder read
`v.constructor`; the check now walks the whole data graph (properties, elements, index signatures,
type arguments, through refs) and skips only function-like members and statics. Two tests pin
that the inherited slots (Object's `constructor`, a class's `prototype`, Error's members) never
surface as declared members, in Go on the scanned RunTypes and in JS on the compiled functions.
