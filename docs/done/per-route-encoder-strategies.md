---
type: feature
spec: full-plan
status: done
created: 2026-09-04
---

# Per-route encoder strategies, on smaller compiled function sets

**Builds on:** the single typed router factory, `createMionRouter(opts)` (`packages/router/src/router.ts`),
the only way to initialize the router and declare routes; its options ride by type (`O`) into every
helper it returns (`packages/router/src/types/mionRouter.ts`). The router-wide default is a field of
those options, and the per-route override is a literal on the factory's helpers.

## Problem

Every mion route compiled the same fixed set of type functions, and the wire projection was fixed
with it. Two costs followed.

**Waste.** A route carried `pj`, `rj`, `sj`, `tb` and `fb` for both its params and its return type
whether it used them or not, because the family list was static: it lived in `MION_FN_KEYS`
(`packages/core/src/runtypes/mionAdapter.ts`) and was mirrored literally in the marker lists on the
route and middleFn factories (`packages/router/src/lib/handlers.ts`).

**No choice.** RunTypes ships four encoder strategies (`clone`, `mutate`, `direct`, `compact`;
`packages/run-types/src/createRTFunctions.ts`) and three decoder ones (`strip`, `preserve`,
`compact`), but a mion route got one hardcoded pairing and no way to ask for another. Compact makes
it obvious: it drops key names from objects, writing `{a, b}` as `[v.a, v.b]`, which measures 40 to
60 percent fewer bytes on real-world objects. It is compiled, tested and fuzzed, and a route could
not reach it.

The old `serializer: 'json' | 'stringifyJson' | 'binary'` option was really the OUTPUT encoder choice
under other names (`json` = `pj`, mutate in place; `stringifyJson` = `sj`, direct string; `binary` =
`tb`), with no input choice at all.

### What was verified

- **Family selection lives in TypeScript types, with no Go change.** The scanner reads the family
  keys off the RESOLVED marker type of each call (`ts-go-runtypes/internal/compiler/marker/marker.go`,
  `fnKeysFromAlias`: it walks the alias type arguments after `T` and skips any non-string-literal
  slot). A conditional type in a family slot, driven by the option literal, resolves to a family name
  or to `never`, and only the demanded families are compiled. This holds for a helper returned by a
  generic factory and called through a property access, and for an `as const` preset passed by name
  from another module. Pinned by `packages/devtools/test/wrapper-strategy-families.test.ts`.
- **The accepted marker keys are the PRIMITIVE families** (`pj`, `pjs`, `sj`, `cj`, `rj`, `cjr`,
  `tb`, `fb`, …; `ts-go-runtypes/internal/cachegen/operations/operations.go`). The JSON composite tags
  (`jeCL`, `jdST`, …) are not marker keys and an unknown key is skipped silently, so mion assembles the
  wire from the primitives: the encoders return a JSON-safe value (`pjs`, `pj`, `cj`) or the string
  (`sj`), the decoders restore the parsed value (`rj`, `cjr`), and mion frames the body itself.
- **A runtime router option can never add compiled functions to a route**, which is why the
  router-wide default is a type: `createMionRouter<const O>(opts: O)` carries it, the per-route
  literal overrides it, and the runtime checks the pair it resolves against what was compiled.
- **`CompTimeArgs<T>`** (`packages/run-types/src/markers.ts`) is detected syntactically off the
  parameter annotation on any marker call site, so the helpers' `opts` are branded literal-only
  (CTA001 non-literal, CTA003 forbidden construct, CTA004 widened `const`) and the lint plugin
  surfaces those codes. The factory's options bag is not branded (it carries `contextDataFactory` and
  env-driven values); a widened `encoder` on it is a type error instead (`EncoderLiteralGuard`).
- **Each injected entry tuple carries its family tag** in slot 0
  (`packages/run-types/src/runtypes/entryTuple.ts`), so the runtime builds a fn set by tag instead of
  by position, and reads a route's strategy off what was actually compiled.
- **Framing is separate from strategy.** `SerializerModes` (`packages/core/src/types/general.types.ts`)
  and the `switch (mionResp.serializer)` in the seven platform adapters describe how the RESPONSE body
  is framed (value the platform stringifies, string the router joined, binary). That stays and is
  derived per execution chain (`packages/router/src/lib/framing.ts`).

## What shipped

### Option shape and vocabulary

The key is `encoder`, on the factory options and on every route / middleFn / headersFn option, with
the RunTypes encoder strategy names plus `binary`; the old `serializer` key is typed `never` so it is
a type error rather than a silently ignored option.

```ts
type JsonStrategy = JsonEncoderStrategy;            // 'clone' | 'mutate' | 'direct' | 'compact' (from run-types)
type WireStrategy = JsonStrategy | 'binary';
type EncoderOption = WireStrategy | {params?: WireStrategy; return?: WireStrategy};  // a string sets both directions
type ResolvedEncoder = {params: WireStrategy; return: WireStrategy};              // on executables and on the wire
```

Params: the client encodes, the server decodes. Return: the server encodes, the client decodes. The
decoder is implied: `compact` pairs with `cjr`, everything else restores with `rj`.

| strategy  | encode family     | decode family | response framing               |
|-----------|-------------------|---------------|--------------------------------|
| `clone`   | `pjs` (new value) | `rj`          | json (platform stringifies)    |
| `mutate`  | `pj` (in place)   | `rj`          | json                           |
| `direct`  | `sj` (string out) | `rj`          | stringifyJson (router joins)   |
| `compact` | `cj` (positional) | `cjr`         | json                           |
| `binary`  | the direction's built-in default json pair, plus `tb` + `fb` | | binary, json kept beside |

Always compiled: `val`, `verr`, `huk`, `uke`, and `fmt` on params. `binary` ADDS `tb` / `fb` beside
the json pair: the optimistic first request and the binary-encode fallback both need the json pair.
The built-in default is `clone` on both directions, chosen over the previous wire (`direct` params,
`mutate` return) because it is the safe pairing: it never touches the value it encodes, and it builds
the payload from the DECLARED type, so a handler returning a wide database row typed as
`Pick<Row, 'a' | 'b'>` sends two columns and nothing else. Resolution order per direction: the route
literal, then the factory literal, then the built-in default.

One consequence, pinned by the specs: after the response is serialized, `response.body` holds the
encoder's JSON-ready projection rather than the live objects the handlers returned (a Date reads as
its ISO string). Under `mutate` the body kept those instances. Nothing on the wire changed.

An error a route does NOT declare (a batch mapping step answers the target route's slot with a typed
error of its own) now rides as native JSON instead of through that route's encoder, which is built
for its success value and turned an RpcError into `{name: 'RpcError'}` under any non-`mutate`
strategy. The client already reads the error brand off the raw value before decoding, so this is what
it expected all along (`packages/router/src/routes/serializer.routes.ts`, `isUndeclaredError`).

### 1. `@mionjs/core`

- `src/types/general.types.ts`: `JsonStrategy`, `WireStrategy`, `EncoderOption`, `ResolvedEncoder`,
  `SingleStrategy` / `LiteralEncoderOption`. `JitCompiledFunctions` is `{isType, typeErrors,
  hasUnknownKeys?, unknownKeyErrors?, formatTransform?, json: {strategy, encode, decode}, binary?:
  {toBinary, fromBinary}}`; `JitFunctionsHashes` is flat (`encode` / `decode` keys) so the deps lane
  walks it. `SerializerModes` / `SerializerCode` stay (framing).
- `src/encoder.ts` (new): `DEFAULT_ENCODER` (typed literally, so the router's types derive the default
  families from it), `resolveEncoder(routeOption, routerOption)`, `jsonStrategyOf(wire, direction)`,
  `isWireStrategy`.
- `src/types/method.types.ts`: `RemoteMethodOpts.encoder?: ResolvedEncoder`, required on
  `RouteOnlyOptions`.
- `src/constants.ts`: `JIT_FUNCTION_IDS` gains `pjs`, `cj`, `cjr`; `ENCODE_FAMILY_BY_STRATEGY`,
  `DECODE_FAMILY_BY_STRATEGY`, `STRATEGY_BY_ENCODE_FAMILY`.
- `src/runtypes/mionAdapter.ts`: `buildJitFnsFromMarker` projects the payload by each tuple's family
  tag (`byFamilyTag`), fails closed unless `val`, `verr`, exactly one encode family and its matching
  decode family are present, `tb` / `fb` only as a pair; `json.strategy` is read off the encode tag.
  `MION_FN_KEYS` is the documented vocabulary, no order.
- `src/routerUtils.ts`: `getJitFnHashes(typeId, strategy, needsBinary)`,
  `getJitFunctionsFromHash(hash, strategy)` (cached per strategy and hash),
  `routesCache.getMethodJitFns` reads the strategy off `options.encoder`, `getNoopJitFns` carries a
  `mutate` json pair.
- `src/binary/bodySerializer.ts`, `bodyDeserializer.ts`: `.binary?.toBinary` / `.binary?.fromBinary`.
- `@mionjs/run-types` now exports the `JsonEncoderStrategy` / `JsonDecoderStrategy` types.

### 2. `@mionjs/router`: helpers with type-level family selection

- `src/types/encoder.ts` (new): `ResolveStrategy` (route literal, factory literal, default),
  `EncodeFamily` / `DecodeFamily` / `ToBinaryFamily` / `FromBinaryFamily`, the eight per-side slot
  types, `EncoderLiteralGuard`, `NoEncoderOptions`.
- `src/lib/handlers.ts` and `src/types/mionRouter.ts`: every helper is TWO overloads. The first takes
  options WITHOUT `encoder` (`PlainRouteOptions`, `encoder?: never`) and its four strategy slots are
  computed from the factory options `O` alone, once per factory; the second takes a route literal
  WITH `encoder` (`const RO extends RouteOptionsWithEncoder`, `opts: CompTimeArgs<RO>`) and computes
  the slots from `RO` and `O` per call. The marker alias is spelled out literally in both. The direct
  helpers the internal routes call use `NoEncoderOptions` as `O`. `createMionRouter(opts?:
  RouterOptionsArg<O>)` rejects a widened `encoder`.
- `src/types/remoteMethods.ts`: flat interfaces, `PlainRouteOptions` / `RouteOptionsWithEncoder`
  (and the middleFn twins) with `RouteOptions` their union, `serializer?: never` on all of them.
  `src/types/definitions.ts`: `RouteDef` & co are flat interfaces instead of `Pick` + intersection.
  Both were paid on every route declaration: the type-budget route step went 580 -> 408 and the
  client step 2589 -> 2500 with the whole feature in (`packages/type-budget`), and the budgets were
  lowered to those values. `src/types/general.ts`: `RouterOptions.encoder?` (its pair form is the
  `EncoderPair` interface, cheaper than an object literal type). `DEFAULT_ROUTE_OPTIONS.serializer`
  is gone.

### 3. `@mionjs/router`: runtime resolution and framing

- `src/router.ts`: `getExecutableFromRoute` / `getExecutableFromMiddleFn` resolve the pair with
  `resolveEncoder`, run `assertCompiledEncoder` (a json strategy mismatch throws naming the method,
  both values and the fix; a `binary` direction without the binary pair warns, like a middleFn without
  it), and store the pair on `options.encoder`. The chain's framing is `getChainFraming(methods,
  routeIsBinary)`: `binary` when the route's return is binary, `stringifyJson` when any member with
  return data encodes `direct`, `json` otherwise. The binary middleFn check runs when either direction
  of the route is binary and skips the internal mion methods.
- `src/batches.ts`: a merged chain is binary only when every route answers binary (a json-only route
  would be skipped by the binary writer, while every binary route also carries its json pair), then the
  same framing rule.
- `src/routes/serializer.routes.ts`: `stringifyHandlerReturnValue` returns `encode(v)` for `direct`
  and `JSON.stringify(encode(v))` otherwise (this also fixed its noop branch, which forgot to return);
  `prepareHandlerReturnValue` returns the encoded value. `src/dispatch.ts` decodes params with
  `json.decode`. `src/lib/reflection.ts`: `ensureBinaryJitFns` reads `.binary` and counts params with
  `paramsCount`; `assertCompiledEncoder` lives beside it. `src/lib/remoteMethods.ts` ships the hashes of
  each direction's strategy.
- The internal routes pin their own encoder: the error routes (`@thrownErrors`, `notFound`,
  `platformError`) pin `binary`, so they ride any framing and keep the thrown `RpcError` instances
  intact (`mutate` beside the binary pair); the metadata middleFn pins `{params: 'binary', return:
  'clone'}` (it piggybacks on binary bodies and never mutates the cached metadata, while its chain's
  framing stays the route's); the by-id metadata route pins `direct`.

### 4. `@mionjs/client`

- `src/lib/serializer.ts`: the request wire is `binary` when the method's `encoder.params` is binary,
  otherwise the JSON string the compiled encoders write (`direct` writes it itself, the others are
  stringified). `parseHandlerJsonReturnValue` decodes with `json.decode`. With local validation off, a
  wrong-typed value rides plain JSON so the server's validation still answers (a `direct` writer would
  emit invalid JSON); a compiled encoder that throws (a batch mapping placeholder) falls back the same
  way.
- `src/request.ts`: the optimistic first request is taken whenever the metadata is missing, and its
  body is written with the plain wire forms every server decoder accepts (a Date as ISO text, a Map or
  Set as an array, a bigint as a whole-number string, the same replacer the compiled path already
  falls back to). A decoder that cannot read them answers a serialization or validation error and the
  existing retry sends the call again with the route's real encoder, so a wrong guess costs a round
  trip and never wrong data. The optimistic request now also
  recognises a headers middleFn by its `HeadersSubset` param, sends its headers and keeps it out of the
  body, so the server accepts the request first time (it used to reject the body param and force a
  retry).
- `ClientOptions.serializer` keeps its name and type: only `'optimistic'` carries meaning, the server
  decides the wire. Documented, not changed.

### 5. Fixtures, platforms, examples

- `packages/test-server/src/test-server.ts`: the binary routes use `{encoder: 'binary'}`, the binary
  session middleFn compiles the binary pair itself, and a `compact` group mirrors the simple, object,
  nested, Date and optional routes plus a mixed route (`{params: 'compact', return: 'direct'}`), a
  `clone` route and a compact middleFn. `test-server-cloudflare.ts` / `test-server-edge.ts` take
  `encoder?: 'direct' | 'mutate'` and pick a `direct` route set: the encoder is a build-time literal,
  so it cannot be a runtime option.
- Every spec that set `serializer` moved to `encoder` on the factory or the routes; a runtime router
  option cannot change what a route compiled, so the specs that used to swap the option at init now
  declare the routes with the literal they test (`serializer.routes.spec.ts`, `dispatch.spec.ts`, the
  node and gcloud platform specs, the edge and workers harnesses).
- Platform adapters: no source change (framing codes unchanged).

## Tests

- devtools: `test/wrapper-strategy-families.test.ts`, the spike as a permanent test (defaults, compact,
  binary beside json, factory default with a route override, a preset by name, CTA004 on a widened
  preset, CTA001 on a call, both `getRunTypeId` shapes hash-equal).
- core `mionAdapter.spec.ts`: the strategy each fake route compiles, tag-keyed build, fail-closed on a
  missing or doubled encode family, a mismatched decoder, a lone binary family.
- router `encoder.spec.ts`: compiled families per literal and per factory default, the resolved pair
  on executables, the literal mismatch error, a widened factory `encoder` rejected via
  `@ts-expect-error`, an invalid runtime value refused, framing per strategy and over a merged batch
  chain, compact params and returns through dispatch, keyed json to a compact route refused, clone
  never mutating, a JSON request to a binary route still decoding.
- client: `client.spec.ts` (a scalar payload goes optimistic in one round trip with the headers
  middleFn as HTTP headers, an object payload goes optimistic keyed on a compact route in one round
  trip, a Date / Map / Set / bigint each ride their plain wire form in one round trip, a compact route
  with scalar params still goes optimistic);
  `lib/serializer.compact.spec.ts` end to end against the test server's compact routes.
- Go: none (no Go change).

## Docs

- `container/website/content/01.rpc/02.server/08.serialization.md` rewritten around strategies per
  direction: the table, the built-in defaults, the factory option, the per-route override, what each
  route compiles, the derived framing, the compact caveats, and the tip that route options are written
  inline or as an `as const` preset because the build reads them.
- Examples: `packages/examples/src/router/encoder-strategies.ts` (one block per strategy and one per
  direction) and `encoder-per-route.ts` replace the serializer examples; `binary-server-example.ts` on
  `encoder`; `packages/examples/src/guide/json-strategies.ts` gains the compact pair.
- `02.runtypes/02.guide/05.json-serialization.md`: the `compact` row and the decoder strategies.
  `01.rpc/02.server/01.routes.md` names the option; `01.rpc/03.client/00.client-overview.md` says when
  the first call goes straight to the metadata.

## Fuzzing

Not added, decided: the compact round trip is already fuzzed in run-types, and the optimistic wire
forms are covered end to end against the test server.

## Out of scope

- Any Go change: selection happens in TypeScript types.
- `strip` as a mion params decoder (mion has `strictTypes` and `sanitizeParams` for unknown keys).
- Making `huk` / `uke` / `fmt` demand-driven on `strictTypes` / `sanitizeParams`.
- The client's `serializer` option and its `optimistic` retry loop beyond the skip predicate. One
  limitation found on the way and handed to its own task: the optimistic first request does not restore
  the PREFILLED middleFns (their ids are only known from the metadata), so on a server with a global
  headers middleFn a call relying on a prefill is always accepted on the retry, never first time.
- An instance router; the runtime stays the module singleton behind the factory.

## Done when

- `paramsJitFns` and `returnJitFns` are `{json, binary?}` (plus the validators), and a route compiles
  only the functions it actually uses.
- The factory options take a default input strategy and a default output strategy, and a route can
  override either with a literal; a non-literal option is a build error and a lint error.
- Choosing `binary` on a route adds the binary set beside the json one instead of replacing it.
- `compact` is selectable this way end to end, server and client.
- The client skips the optimistic request when the params carry objects, and still takes it for
  scalars and arrays of scalars.
- Tests cover each strategy at the router and the client level, and the marker change follows the
  marker coverage rule.
- The strategy docs and their examples list every strategy that ships.
