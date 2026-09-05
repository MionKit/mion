---
type: feature
spec: full-plan
status: done
created: 2026-09-04
completed: 2026-09-05
---

# Per-route encoder and decoder strategies, on smaller compiled function sets

## What shipped

A route, a middleFn or a headersFn names the wire strategy of each direction, and the build
compiles only the type functions that choice demands. The option is one word, or one per direction:

```ts
const mion = createMionRouter({serializer: 'compact'}); // the router default
mion.route(handler); // compact both ways
mion.route(handler, {serializer: {params: 'compact', return: 'direct'}}); // per direction
mion.route(handler, {serializer: 'binary'}); // binary added beside the built-in json pair
```

`Strategy = 'clone' | 'mutate' | 'direct' | 'compact' | 'binary'`. Params: the client encodes, the
server decodes. Return: the server encodes, the client decodes. Built-in defaults keep the wire
mion had: `params: 'direct'`, `return: 'mutate'`. The old `'json'` / `'stringifyJson'` option
names are gone (`json` is `mutate`, `stringifyJson` is `direct`).

| strategy  | encode family                | decode family                | response framing (per chain) |
|-----------|------------------------------|------------------------------|------------------------------|
| `clone`   | `pjs` (new value)            | `rj`                         | json (platform stringifies)  |
| `mutate`  | `pj` (in place)              | `rj`                         | json                         |
| `direct`  | `sj` (string out)            | `rj`                         | stringifyJson (router joins) |
| `compact` | `cj` (positional)            | `cjr`                        | json                         |
| `binary`  | `tb` + the built-in json pair | `fb` + the built-in json pair | binary                       |

Always compiled: `val`, `verr`, `huk`, `uke`, and `fmt` on params. `binary` ADDS `tb` / `fb`
beside the BUILT-IN json pair of its direction (params `sj` + `rj`, return `pj` + `rj`), never
beside the router default: the optimistic first request and the binary-encode fallback in
`serializeResponseBody` both need a plain-JSON pair.

Measured on the compact route group of the test server, a keyed object goes out as a positional
array with no key names, which is the 40 to 60 percent the strategy was added for.

**A fn set is `{isType, typeErrors, hasUnknownKeys?, unknownKeyErrors?, formatTransform?, json:
{strategy, encode, decode}, binary?: {toBinary, fromBinary}}`** (`JitCompiledFunctions`,
`packages/core/src/types/general.types.ts`); `JitFunctionsHashes` mirrors it. The marker payload is
read BY FAMILY TAG (slot 0 of every entry tuple), never by position: a `never` family slot drops
out of the injected array and the list compacts. `buildJitFnsFromMarker`
(`packages/core/src/runtypes/mionAdapter.ts`) fails closed unless `val`, `verr`, exactly one json
encode tag and exactly one json decode tag are present, and takes `tb` / `fb` only as a pair;
`json.strategy` derives from the encode tag (`STRATEGY_BY_ENCODE_TAG`). `MION_FN_KEYS` stays as
the vocabulary, no longer an order.

**Selection lives in TypeScript types, with no Go change.** `packages/router/src/types/mionRouter.ts`
is the one definition of the helper signatures (`RouteHelper<O>`, `MiddleFnHelper<O>`,
`HeadersFnHelper<O>`); `packages/router/src/lib/handlers.ts` implements them as typed consts over
`EmptyOptions`, so the internal client / error / serializer routes get the built-in strategies and
the two files cannot drift. Each helper takes `opts?: CompTimeArgs<RO>` (literal only) and computes
the family slots of both marker lists from the route literal over the factory options over the
built-in (`ParamsStrategy<RO, O>`, `ReturnStrategy<RO, O>`, `EncodeFamily`, `DecodeFamily`,
`ToBinaryFamily`, `FromBinaryFamily`). The marker aliases stay spelled as bare type references; the
scanner reads the resolved signature, so `api.route(...)` and a destructured `route(...)` inject
the same families. A widened factory option (a union, `string`, a runtime value) fails
`createMionRouter(opts?: O & SerializerIsLiteral<O>)` with a message saying how to write it; a
non-literal route option is a build error (`CTA001` / `CTA003` / `CTA004`) and a lint error
(`runtypes/invalid-marker`), which needed one lint change: the rule pre-filter probes
`@mionjs/router` imports as well as `@mionjs/run-types` (`packages/devtools/src/lint/prefilter.ts`).

**The runtime checks the build.** `resolveMethodSerializer` (`packages/router/src/router.ts`)
resolves the option per direction (route literal over the router default over the built-in),
reads what was compiled off the fn sets (`strategyFromJitFns`: `binary` when the binary pair is
present, else `json.strategy`) and throws on a mismatch, naming the method, both values and the
fix. The resolved `{params, return}` object rides `options.serializer` on every executable and on
the wire to the client. `getJitFnHashes(jitHash, strategy, direction)` and
`getJitFunctionsFromHash(jitHash, strategy, direction)` (`packages/core/src/routerUtils.ts`) rebuild
a set for one strategy, cached per strategy and direction.

**The response framing is derived per chain** (`framingForChain`): a route returning `binary`
frames binary, a route returning `direct` frames stringifyJson, otherwise any non-internal member
that hands back data on `direct` frames stringifyJson, else json. Merged batch chains
(`packages/router/src/batches.ts`) use the same rule. `SerializerModes` / `SerializerMode` /
`SerializerCode` stay as the framing codes; the seven platform adapters did not change.

**Internal members pin both directions**, so the router default never disagrees with what was
compiled: `thrownErrors` `{params: 'direct', return: 'binary'}` (rides every framing), `notFound`
/ `platformError` `{params: 'direct', return: 'mutate'}`, the metadata middleFn and the
`methodsMetadataById` route `'direct'` (see the decisions below).

**The client encodes with the route's strategy** (`packages/client/src/lib/serializer.ts`): the
request framing is binary when `options.serializer.params === 'binary'`; `direct` params go out as
the compiled string, any other strategy as `JSON.stringify(json.encode(params))`; the return is
decoded with `json.decode`. When a route's encoder or decoder is a noop the client falls back to
native JSON. The optimistic first request is taken only when every sub-request's params survive
plain JSON (`survivesPlainJson`, `packages/client/src/lib/plainJson.ts`: scalars, arrays of
scalars, and `HeadersSubset` instances, which travel as HTTP headers); any other object goes
metadata-first, exactly like `skipOptimistic`. `ClientOptions.serializer` keeps its type: only
`'optimistic'` carries meaning, the server decides the wire, and the option's doc says so.

**Fixtures, platforms, examples and docs.** The test server gained a `compact` route group
(scalars, objects, nested data, Dates, optionals, a `{params: 'compact', return: 'direct'}` route,
a `clone` route and a compact middleFn) beside the `binary` group. Every platform spec declares its
`direct`, `mutate` and `binary` route sets on the new option, and the cloudflare / edge test
servers take `serializer?: 'direct' | 'mutate'`. The website serialization page is written around
strategies per direction (the table above, the router default, the per-route override, the
literal-only tip, the derived framing, the compact caveats); the runtypes JSON guide gained
`compact`; the client overview says when the first call goes to the metadata first; the linter page
says a non-literal route option is a lint error. `packages/examples/src/router/serializer-modes.ts`
holds one block per form (default, router default, per direction, per route, `as const` preset).

## Problem

Every mion route compiled the same fixed set of type functions, and the wire projection was fixed
with it. Two costs followed.

**Waste.** A route carried `pj`, `rj`, `sj`, `tb` and `fb` for both its params and its return
type whether it used them or not, because the family list was static: it lived in `MION_FN_KEYS`
and was mirrored literally in the marker lists on the route and middleFn helpers.

**No choice.** RunTypes ships four encoder strategies (`clone`, `mutate`, `direct`, `compact`) and
three decoder ones (`strip`, `preserve`, `compact`), but a mion route got one hardcoded pairing and
no way to ask for another. Compact makes it obvious: it drops key names from objects, writing
`{a, b}` as `[v.a, v.b]`, which measures 40 to 60 percent fewer bytes on real-world objects. It
was compiled, tested and fuzzed, and a route could not reach it.

The `serializer: 'json' | 'stringifyJson' | 'binary'` option was really the OUTPUT encoder choice
under other names (`json` = `pj`, mutate in place; `stringifyJson` = `sj`, direct string;
`binary` = `tb`), with no input choice at all.

### What was verified before the work

- **Family selection can live in TypeScript types, with no Go change.** The scanner reads the
  family keys off the RESOLVED marker type of each call (`fnKeysFromAlias` in
  `ts-go-runtypes/internal/compiler/marker/marker.go`: it walks the alias type arguments after `T`
  and skips any non-string-literal slot). A conditional type in a family slot, driven by the option
  literal, therefore resolves to a family name or to `never`, and only the demanded families are
  compiled. The resolved signature is what the scanner reads (`Checker_getResolvedSignature`), so
  the same holds for a helper returned by a generic factory and called through a property access.
  A scratch project compiled with the built resolver confirmed every case before any code moved.
- **A runtime router option can never add compiled functions to a route**, which is why the
  router-wide default is a type: `createMionRouter<const O>(opts)` carries it, the per-route
  literal overrides it.
- **`CompTimeArgs<T>`** is the identity marker the scanner detects off the parameter annotation;
  it enforces a fully literal argument (CTA001 non-literal, CTA003 forbidden construct, CTA004
  widened `const`) and the lint plugin routes those codes to rules. The literal checker accepts
  inline arrow functions and `as const` presets, cross-module too, and rejects named function
  references, property access and calls. So the route helpers' `opts` can be branded; the factory's
  options bag cannot (it carries `contextDataFactory` and env-driven values), hence the type-level
  `SerializerIsLiteral` guard on it instead.
- **Each injected entry tuple carries its family tag** in slot 0, so the runtime can build a fn
  set by tag instead of by position, and can read a route's strategy off what was actually
  compiled.
- **Framing is separate from strategy.** `SerializerModes` and the `switch (mionResp.serializer)`
  in the seven platform adapters describe how the RESPONSE body is framed (value the platform
  stringifies, string the router joined, binary). That stayed and became derived per chain.
- **The client already picked its mode per method from the server's metadata**, and the
  optimistic first request sent plain `JSON.stringify`, decided without looking at the params.

## Tests

- Go, fixture only (no source change): `ts-go-runtypes/internal/compiler/resolver/factory_strategy_test.go`
  pins, on a generic factory with conditional family slots and `CompTimeArgs` opts, the families per
  option (none, `compact`, `{return: 'binary'}`, factory default, per-direction override, an
  `as const` preset by name, destructured), the compacting of a `never` slot, `CTA003` for a call
  argument through `api.route` and through the destructured `route`, and the paired
  `getRunTypeId<T>()` / `getRunTypeId(value)` forms with hash equivalence (marker coverage rule).
- devtools: `test/wrapper-strategy-families.test.ts` runs the same sources through the plugin's
  session lane and asserts `sites[].fnIds` per call plus the diagnostic, with the paired
  `getRunTypeId` forms; `test/eslint/prefilter.test.ts` covers the router import.
- core: `mionAdapter.spec.ts` (tag-keyed build per strategy, fail-closed on a missing family, the
  binary pair whole or absent), `routerUtils.spec.ts` (hashes per strategy and direction, the noop
  set shape, `resolveSerializerOption`).
- router: `serializerStrategies.spec.ts` (the compiled families per option and per factory
  default, resolution at registration, the mismatch error, the widened factory option refused via
  `@ts-expect-error`, the framing per chain including a merged batch chain, compact end to end,
  a plain JSON request to a binary route), plus the updated `serializer.routes.spec.ts`,
  `serializer.binary.spec.ts`, `client.routes.spec.ts`, `dispatch.spec.ts`, `migration.spec.ts`,
  `remoteMethods.spec.ts`, `writeList.spec.ts`, `measurePass.spec.ts`.
- client: `lib/plainJson.spec.ts`; the `client.spec.ts` optimistic block (scalar params take the
  optimistic call, object params go metadata-first, the request order asserted on a fetch spy);
  `lib/serializer.compact.spec.ts` end to end against the test server's compact routes (both
  directions, a per-direction mix, `clone`, a compact middleFn).
- Every platform spec runs its `direct`, `mutate` and `binary` route sets through its adapter.
- Fuzzing: none added, decided: the compact round trip is fuzzed in run-types, and the one new
  predicate (`survivesPlainJson`) is unit-tested.

## Decisions taken

- `CompTimeArgs` brands every route / middleFn option bag: a dynamic `description` or
  `validateParams` value is a build and lint error too. Write options inline or as an `as const`
  preset.
- `binary`'s json pair is the BUILT-IN pair of the direction, not the router default.
- The metadata middleFn and the `methodsMetadataById` route are `direct` on both directions, not
  `clone`: under `clone` the json framing stored the prepared tagged value into the response body,
  and the middleFn already frames its own answer as stringifyJson at runtime. The chain framing
  skips the internal members, so neither drives the framing of a user's route.
- A middleFn without the binary pair inside a binary chain stays a WARNING (the behaviour before),
  with a message that says how to fix it; the internal members are never asked for one.
- The client falls back to native JSON when the route's encoder or decoder is a noop: the `direct`
  encoder is never a noop, so a wrongly typed scalar would otherwise become invalid JSON.
- The lint pre-filter learned the router import; no lint rule changed and `strong-typed-routes`
  and friends stay handler-only.
- Known, unchanged: the optimistic first call cannot restore a prefilled middleFn before the
  route's metadata is known, so a prefilled auth header never rides the first request and the
  client retries once the metadata arrives. That predates this change.

## Out of scope

- Any Go change: selection happens in TypeScript types.
- `strip` as a mion params decoder (mion has `strictTypes` and `sanitizeParams` for unknown keys).
- Making `huk` / `uke` / `fmt` demand-driven on `strictTypes` / `sanitizeParams`.
- The client's `serializer` option and its `optimistic` retry loop beyond the skip predicate.
- An instance router; the runtime stays the module singleton behind the factory.

## Done when

- [x] `paramsJitFns` and `returnJitFns` are `{json, binary?}` (plus the validators), and a route
  compiles only the functions it actually uses.
- [x] The factory options take a default input strategy and a default output strategy, and a route
  can override either with a literal; a non-literal option is a build error and a lint error.
- [x] Choosing `binary` on a route adds the binary set beside the json one instead of replacing it.
- [x] `compact` is selectable this way end to end, server and client.
- [x] The client skips the optimistic request when the params carry objects, and still takes it for
  scalars and arrays of scalars.
- [x] Tests cover each strategy at the router and the client level, and the marker change follows
  the marker coverage rule.
- [x] The strategy docs and their examples list every strategy that ships.
