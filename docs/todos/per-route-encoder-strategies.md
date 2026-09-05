---
type: feature
spec: full-plan
status: blocked
created: 2026-09-04
---

# Per-route encoder and decoder strategies, on smaller compiled function sets

**Blocked on:** router initialization becoming a single typed factory (`createMionRouter(opts)` as
the only way to initialize the router and declare routes, its options riding by type into every
helper it returns). This plan builds on that factory: the router-wide default below is a field of
its options, and the per-route override is a literal on the factory's helpers. Until it lands, a
router-wide default has no type-level home.

## Problem

Every mion route compiles the same fixed set of type functions today, and the wire projection is
fixed with it. Two costs follow.

**Waste.** A route carries `pj`, `rj`, `sj`, `tb` and `fb` for both its params and its return
type whether it uses them or not, because the family list is static: it lives in `MION_FN_KEYS`
(`packages/core/src/runtypes/mionAdapter.ts:42`) and is mirrored literally in the five
`InjectTypeFnArgs<...>` marker lists on the route and middleFn factories
(`packages/router/src/lib/handlers.ts:38`).

**No choice.** RunTypes ships four encoder strategies (`clone`, `mutate`, `direct`, `compact`;
`packages/run-types/src/createRTFunctions.ts:341`) and three decoder ones (`strip`, `preserve`,
`compact`; `:377`), but a mion route gets one hardcoded pairing and no way to ask for another.
Compact makes it obvious: it drops key names from objects, writing `{a, b}` as `[v.a, v.b]`, which
measures 40 to 60 percent fewer bytes on real-world objects. It is compiled, tested and fuzzed, and
a route cannot reach it.

The existing `serializer: 'json' | 'stringifyJson' | 'binary'` option is really the OUTPUT encoder
choice under other names (`json` = `pj`, mutate in place; `stringifyJson` = `sj`, direct string;
`binary` = `tb`), with no input choice at all.

### What was verified

- **Family selection can live in TypeScript types, with no Go change.** The scanner reads the
  family keys off the RESOLVED marker type of each call
  (`ts-go-runtypes/internal/compiler/marker/marker.go:482`, `fnKeysFromAlias`: it walks the alias
  type arguments after `T` and skips any non-string-literal slot, which is how the `never`-defaulted
  `F2..F12` work today). A conditional type in a family slot, driven by the option literal, therefore
  resolves to a family name or to `never`, and only the demanded families are compiled. The
  resolved signature is what the scanner reads (`scan.go:490`, `Checker_getResolvedSignature`), so
  the same holds for a helper returned by a generic factory and called through a property access.
- **A runtime router option can never add compiled functions to a route**, which is why the
  router-wide default must be a type: `createMionRouter<O>(opts: O)` carries it, the per-route
  literal overrides it.
- **`CompTimeArgs<T>`** (`packages/run-types/src/markers.ts:194`) is the identity marker the scanner
  detects off the parameter annotation; it enforces a fully literal argument (CTA001 non-literal,
  CTA003 forbidden construct, CTA004 widened `const`) and the lint plugin routes those codes to
  rules (`packages/devtools/src/lint/diagnosticRouting.ts`). The literal checker accepts inline
  arrow functions and `as const` presets, cross-module too, and rejects named function references,
  property access and calls (`ts-go-runtypes/internal/compiler/comptimeargs/comptimeargs.go:107`,
  `:513`). So the route helpers' `opts` can be branded, the factory's options bag cannot (it carries
  `contextDataFactory` and env-driven values).
- **Each injected entry tuple carries its family tag** in slot 0
  (`packages/run-types/src/runtypes/entryTuple.ts:220`), so the runtime can build a fn set by tag
  instead of by position (`byFnKey`, `mionAdapter.ts:61`), and can read a route's strategy off what
  was actually compiled.
- **Framing is separate from strategy.** `SerializerModes` (`packages/core/src/types/general.types.ts:13`)
  and the `switch (mionResp.serializer)` in the seven platform adapters describe how the RESPONSE
  body is framed (value the platform stringifies, string the router joined, binary). That stays and
  becomes derived per execution chain.
- **The client already picks its mode per method from the server's metadata**
  (`packages/client/src/lib/serializer.ts:220`, reading `method.options.serializer`), and the
  optimistic first request sends plain `JSON.stringify` (`:95`), decided at
  `packages/client/src/request.ts:77` without looking at the params.

## Plan

### Strategy vocabulary

`Strategy = 'clone' | 'mutate' | 'direct' | 'compact' | 'binary'`, per direction. Params: the
client encodes, the server decodes. Return: the server encodes, the client decodes. Both the encoder
and the decoder of a direction are compiled on the server and shipped to the client.

| strategy  | encode family     | decode family | response framing               |
|-----------|-------------------|---------------|--------------------------------|
| `clone`   | `pjs` (new value) | `rj`          | json (platform stringifies)    |
| `mutate`  | `pj` (in place)   | `rj`          | json                           |
| `direct`  | `sj` (string out) | `rj`          | stringifyJson (router joins)   |
| `compact` | `cj` (positional) | `cjr`         | json                           |
| `binary`  | `tb` + the default json pair | `fb` + the default json pair | binary, json kept beside |

Always compiled: `val`, `verr`, `huk`, `uke`, and `fmt` on params. `binary` ADDS `tb` / `fb` beside
the direction's default json pair: the optimistic first request and the binary-encode fallback
(`packages/router/src/routes/serializer.routes.ts:143`) both need the json pair. Built-in defaults
keep today's behaviour: `params: 'direct'`, `return: 'mutate'`.

Option shape, identical on the factory options and on every route helper:
`serializer: Strategy | {params?: Strategy; return?: Strategy}` (a string sets both directions).
The old `'json'` / `'stringifyJson'` names are dropped (`json` becomes `mutate`, `stringifyJson`
becomes `direct`). `MiddleFnOptions` and `HeadersMiddleFnOptions` gain `serializer` too, since
their params and return ride the same wires.

### 1. Types and fn-set shape (`@mionjs/core`)

- `packages/core/src/types/general.types.ts`: add `JsonStrategy` (alias of run-types'
  `JsonEncoderStrategy`), `WireStrategy = JsonStrategy | 'binary'`, `SerializerOption`,
  `ResolvedSerializer = {params: WireStrategy; return: WireStrategy}` and a `SingleStrategy<S>`
  guard (a union or `string` resolves to `never`, so a widened factory option is a type error).
  Replace `JitCompiledFunctions` (`:129`) with
  `{isType, typeErrors, hasUnknownKeys?, unknownKeyErrors?, formatTransform?, json: {strategy,
  encode, decode}, binary?: {toBinary, fromBinary}}`; `JitFunctionsHashes` (`:146`) mirrors it.
  `SerializerModes` / `SerializerMode` / `SerializerCode` stay (framing).
- `packages/core/src/types/method.types.ts:53`: `RemoteMethodOpts.serializer?: ResolvedSerializer`
  (always resolved on an executable and on the wire); `RouteOnlyOptions.serializer` required.
- `packages/core/src/constants.ts:93` `JIT_FUNCTION_IDS`: add `pjs`, `cj`, `cjr`, plus
  encode-by-strategy / decode-by-strategy maps and the reverse family-tag-to-strategy map.
- `packages/core/src/runtypes/mionAdapter.ts:218` `buildJitFnsFromMarker`: build by family tag,
  fail closed unless `val`, `verr`, exactly one encode family and exactly one decode family are
  present, `tb` / `fb` only as a pair, `huk` / `uke` / `fmt` optional as today; derive
  `json.strategy` from the encode tag. `MION_FN_KEYS` stays as the documented vocabulary, not an
  order. `getReflectionFromMarkers` (`:327`) reads size estimates from `binary?.toBinary`.
- `packages/core/src/routerUtils.ts:139` `getJitFnHashes(typeId, strategy)`, `:165`
  `getJitFunctionsFromHash(hash, strategy)`, `:70` `routesCache.getMethodJitFns` (passes
  `method.options.serializer.params` / `.return`), `:295` `getNoopJitFns` (`json: {strategy:
  'mutate', encode: noop, decode: noop}`).
- `packages/core/src/binary/bodySerializer.ts:153` and `bodyDeserializer.ts:58`: read
  `.binary?.toBinary` / `.binary?.fromBinary`.

### 2. Route helpers with type-level family selection (`@mionjs/router`)

`packages/router/src/lib/handlers.ts`, the five helpers the factory returns (`rawMiddleFn`
unchanged). One generic shape `MionHandlers<Defaults>` so the factory cannot drift from the
implementation:

```ts
type EncodeFamily<S> = S extends 'clone' ? 'pjs' : S extends 'mutate' ? 'pj' : S extends 'direct' ? 'sj' : S extends 'compact' ? 'cj' : never;
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : 'rj';
// 'binary' resolves to the direction's default json pair for encode/decode, plus 'tb' and 'fb'

route<H extends Handler, O extends RouteOptions = {}>(
  handler: H,
  opts?: CompTimeArgs<O>,   // literal only: CTA0xx at build time and in lint
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'huk', 'uke', 'fmt', EncodeFamily<ParamsStrategy<O, Defaults>>, DecodeFamily<...>, Tb<...>, Fb<...>>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'huk', 'uke', EncodeFamily<ReturnStrategy<O, Defaults>>, DecodeFamily<...>, Tb<...>, Fb<...>>,
  paramsId?, returnId?
): RouteDef<H>
```

The marker alias stays spelled out literally (the scanner matches the alias and reads its resolved
type arguments); only the family slots are computed. `Defaults` is the factory's option type.
Update the header comment (`:22-33`): order no longer matters, the vocabulary lives in
`MION_FN_KEYS`. `RouteOptions.serializer?: SerializerOption`
(`packages/router/src/types/remoteMethods.ts:34`); `RouterOptions.serializer?: SerializerOption`
guarded by `SingleStrategy` (`packages/router/src/types/general.ts:46`).

### 3. Runtime resolution and framing (`@mionjs/router`)

- `packages/router/src/router.ts:494` `getExecutableFromRoute` (and the middleFn twin at `:435`):
  `wanted = route.options?.serializer ?? routerOptions.serializer` resolved to `{params, return}`,
  `compiled = strategyFromFamilies(paramsJitFns, returnJitFns)`; a mismatch throws naming the route,
  both values, and the fix (write the option inline or as an `as const` preset). Store the resolved
  object on `executable.options.serializer`. Drop `DEFAULT_ROUTE_OPTIONS.serializer`
  (`packages/router/src/constants.ts:21`) in favour of the built-in `{params: 'direct', return:
  'mutate'}`.
- `router.ts:373` and `:606` `getSerializerCodeFromMode`: replace with `framingForChain(methods)`:
  return `binary` on the route gives `SerializerModes.binary`; any member with return data whose
  json strategy is `direct` gives `stringifyJson`; otherwise `json`. `routesFlow.ts:206-235` merged
  chains use the same function instead of "first route's serializer".
- `packages/router/src/routes/serializer.routes.ts`: `prepareHandlerReturnValue` (`:274`) uses
  `json.encode`; `stringifyHandlerReturnValue` (`:231`) returns `encode(v)` for `direct` and
  `JSON.stringify(encode(v))` otherwise, which also fixes the missing `return` on its noop branch.
  Error messages read `json.encode.typeName`. `deserializeRequestBody` is unchanged (framing by
  `bodyType`).
- `packages/router/src/dispatch.ts:189`: `paramsJitFns.json.decode`. Validation, strictTypes and
  sanitize lines unchanged.
- `packages/router/src/lib/reflection.ts:156` `ensureBinaryJitFns`: `.binary` presence.
- `packages/router/src/routes/client.routes.ts:106`: the metadata route's pin becomes
  `{serializer: {return: 'direct'}}`; the middleFn at `:79` keeps forcing the stringifyJson framing.
- `packages/router/src/lib/remoteMethods.ts:159` `serializeMethodDeps`: `getJitFnHashes(hash,
  strategy)` per direction; the resolved `serializer` object rides `options` to the client via
  `getSerializableMethod` (`:75`) as today.

### 4. Client (`@mionjs/client`)

- `packages/client/src/lib/serializer.ts`: `getSerializerMode` (`:220`) reads
  `method.options.serializer.params` (`binary` gives binary, anything else the string framing; the
  `optimistic` branch is unchanged). `stringifyHandlerParams` (`:131`): `direct` gives
  `json.encode(params)`, otherwise `JSON.stringify(json.encode(params))`.
  `parseHandlerJsonReturnValue` (`:242`): `returnJitFns.json.decode`.
- New `packages/client/src/lib/plainJson.ts`: `survivesPlainJson(params)` is true when every value,
  recursing through arrays, is a scalar (string, number, boolean, null, undefined); any non-array
  object (plain object, Date, Map, class instance) or bigint makes it false.
- `packages/client/src/request.ts:77`: `isOptimistic = !allCached && !skipOptimistic &&
  survivesPlainJson(all sub-request params)`; when false the standard path runs (metadata first),
  exactly like `skipOptimistic`. Retry on `serialization-error` and the metadata piggyback stay.
- `ClientOptions.serializer` keeps its type; only `'optimistic'` carries meaning, the server decides
  the wire. Documented, not changed.

### 5. Fixtures, platforms, examples

- `packages/test-server/src/test-server.ts`: the existing `{serializer: 'binary'}` routes stay
  valid (a string sets both directions). Add a `compact` group mirroring the simple, object, nested,
  Date and optional routes, one mixed route `{serializer: {params: 'compact', return: 'direct'}}`,
  one `clone` route, and a compact route whose middleFn is compact too.
  `test-server-cloudflare.ts:47` / `test-server-edge.ts:47` option types follow.
- Specs that set a router-level `serializer: 'binary' | 'json'` (platform-node, platform-uws,
  platform-gcloud, `router/src/routes/serializer.binary.spec.ts`, `binaryPooled.spec.ts`,
  `measurePass.spec.ts`) move the value onto the factory options or the routes.
- Platform adapters: no source change (framing codes unchanged); their specs compile against the
  new option type.

### Order of work

1. **Spike first, it decides everything:** `packages/devtools/test/wrapper-strategy-families.test.ts`,
   a tmp project with a factory-returned wrapper whose family slots are conditional on the option
   literal. Assert the injected families for: no option, `{serializer: 'compact'}`, `{serializer:
   {return: 'binary'}}`, an `as const` preset passed by name, and a factory default; assert
   `route(h, getOpts())` reports CTA001 and a widened preset reports CTA004. Paired
   `getRunTypeId<T>()` / `getRunTypeId(value)` tests with a hash-equivalence assertion (marker
   coverage rule). If the scanner does not see the resolved literals, stop and report; the fallback
   would be Go-side selection, which is not planned.
2. Section 1, with `mionAdapter.spec.ts` / `routerUtils.spec.ts` updates.
3. Sections 2 and 3.
4. Section 4, then section 5.
5. Docs (below), then the gate: rebuild the binary and the devtools dist, `pnpm test` (or
   `pnpm run test:ci`), `pnpm run lint`, `pnpm run format`.

## Tests

- devtools: the spike suite above (both `getRunTypeId` call shapes, paired, hash-equal).
- core `mionAdapter.spec.ts`: tag-keyed build for each strategy; fail-closed on a missing encode or
  decode family; `binary` present only as a pair. `routerUtils.spec.ts`: hash rebuild per strategy,
  noop set shape.
- router: `handlers.spec.ts` (compiled families per option and per factory default), a new
  `serializerResolution.spec.ts` (derived strategy, literal mismatch error, factory-default
  mismatch error, a widened factory `serializer` rejected via `@ts-expect-error`),
  `serializer.routes.spec.ts` (each return strategy, mixed chain framing, compact output is
  positional), `dispatch.spec.ts` (compact params decode, clone and mutate unchanged),
  `dispatch.binary.spec.ts` (a JSON request to a binary route still decodes: binary adds beside
  json), `routesFlow.spec.ts` (framing over a merged chain).
- client: `lib/plainJson.spec.ts` (scalars, nested arrays, objects, Date, Map, bigint);
  `client.spec.ts` optimistic block: a scalar payload still goes optimistic (plain JSON body, one
  round trip), an object payload skips it (metadata fetched first, no retry), a compact route with
  objects works on the very first call; new `lib/serializer.compact.spec.ts` end to end against the
  test server's compact routes (both directions, middleFns, routesFlow).
- Go: none (no Go change).

## Docs

- `container/website/content/01.rpc/02.server/08.serialization.md`: rewrite around strategies per
  direction: the table above, the built-in defaults, the factory option, the per-route override,
  binary adds beside json, compact caveats (shape-coupled wire, an absent optional rides `null`, no
  JSON Schema), derived response framing, a tip that route options are written inline or as an
  `as const` preset because the build reads them; the "three modes" sentence and the comparison
  table go. Headings in Title Case per the website guidelines.
- Examples: `packages/examples/src/router/serializer-modes.ts` rewritten as one `start-*` /
  `end-*` block per strategy; `serializer-per-route.ts` and `binary-server-example.ts` on the new
  option; the drizzle examples that pass `serializer` updated; `check-code-imports` and the
  unused-examples check stay green.
- `container/website/content/02.runtypes/02.guide/05.json-serialization.md`: add the `compact`
  row and a decoder-strategy table (`strip` / `preserve` / `compact`), drop "The JSON that comes out
  is the same", fix the tip; `packages/examples/src/guide/json-strategies.ts` gains a compact pair.
- The `serializer: 'json' | 'stringifyJson'` mentions in `01.rpc/09.articles/01.binary-serialization.md`,
  `01.rpc/06.devtools/03.nextjs.md`, `01.rpc/06.devtools/01.linter.md`,
  `01.rpc/04.drizzle-orm/00.drizzle-overview.md` and
  `02.runtypes/02.guide/06.binary-serialization.md` move to the new names.
  `01.rpc/03.client/00.client-overview.md:35` gains one sentence: the first call goes straight to
  metadata when the params carry objects.

## Fuzzing

Not added, decided: the compact round trip is already fuzzed in run-types, and the one new
predicate (`survivesPlainJson`) is covered by unit tests.

## Out of scope

- Any Go change: selection happens in TypeScript types; the fallback (Go-side strategy selection
  with a config lane) is only the escape hatch if the spike fails.
- `strip` as a mion params decoder (mion has `strictTypes` and `sanitizeParams` for unknown keys).
- Making `huk` / `uke` / `fmt` demand-driven on `strictTypes` / `sanitizeParams`.
- The client's `serializer` option and its `optimistic` retry loop beyond the skip predicate.
- An instance router; the runtime stays the module singleton behind the factory.

## Done when

- `paramsJitFns` and `returnJitFns` are `{json, binary?}` (plus the validators), and a route
  compiles only the functions it actually uses.
- The factory options take a default input strategy and a default output strategy, and a route can
  override either with a literal; a non-literal option is a build error and a lint error.
- Choosing `binary` on a route adds the binary set beside the json one instead of replacing it.
- `compact` is selectable this way end to end, server and client.
- The client skips the optimistic request when the params carry objects, and still takes it for
  scalars and arrays of scalars.
- Tests cover each strategy at the router and the client level, and the marker change follows the
  marker coverage rule.
- The strategy docs and their examples list every strategy that ships.
