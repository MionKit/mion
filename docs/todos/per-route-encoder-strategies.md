---
type: feature
spec: guidelines
status: ready
created: 2026-09-04
---

# Per-route encoder and decoder strategies, on smaller compiled function sets

## Intent

Every mion route compiles the same fixed set of type functions today, and the wire
projection is fixed with it. Two costs follow.

**Waste.** A route carries `prepareForJson`, `restoreFromJson`, `stringifyJson`, `toBinary`
and `fromBinary` whether it uses them or not, because the list is static.

**No choice.** RunTypes ships four encoder strategies (`clone`, `mutate`, `direct`,
`compact`) and three decoder ones (`strip`, `preserve`, `compact`), but a mion route gets
one hardcoded pairing and no way to ask for another.

Compact makes it obvious. It drops key names from objects, writing `{a, b}` as
`[v.a, v.b]`, which measures 40 to 60 percent fewer bytes on real-world objects. It is
compiled, tested and fuzzed, and a route cannot reach it.

## Direction

The shape wanted:

- `paramsJitFns` and `returnJitFns` become `{json, binary?}` rather than a flat bag of
  every family.
- The router takes a default strategy for params (input) and a default for return (output).
- A route can override either.
- A **json** strategy override replaces `paramsJitFns.json` / `returnJitFns.json`.
- Setting a route to **binary** keeps the default json strategy and **adds** `binary`
  beside it, rather than replacing it.

The result is far fewer compiled functions per route, while each route still says how it is
encoded and decoded.

What was verified before filing this:

- The families requested for every route live in one list, `MION_FN_KEYS`
  (`packages/core/src/runtypes/mionAdapter.ts:42`), mirrored literally in the five
  `InjectTypeFnArgs<...>` marker lists on the route and middleFn factories
  (`packages/router/src/lib/handlers.ts:38`). They move together; the comment there already
  records that they drifted once.
- **The mechanism for a build-readable per-call-site option already exists.**
  `CompTimeFnArgs<T>` (`packages/run-types/src/markers.ts:208`) is read at build time,
  selects the compiled variant and folds into the cache id. It is how
  `createJsonEncoderFn<T>(undefined, {strategy: 'compact'})` picks its variant today.
- `route()`'s own `opts` is a plain runtime parameter, not `CompTimeFnArgs`
  (`packages/router/src/lib/handlers.ts:35`, type at
  `packages/router/src/types/remoteMethods.ts:34`). Making the strategy readable at build
  time is the hinge of this change.
- The compiled families behind the strategies are `pj`, `rj`, `sj` (keyed), `cj`, `cjr`
  (compact) and `tb`, `fb` (binary); the strategy unions are at
  `packages/run-types/src/createRTFunctions.ts:364` and `:377`.
- Consumers that read the fn sets and would move with them:
  `packages/router/src/dispatch.ts` (param decode, sanitize, validate),
  `packages/router/src/routes/serializer.routes.ts` (request decode, response encode),
  `packages/router/src/lib/reflection.ts:154` (the binary presence check),
  `packages/router/src/routesFlow.ts`, and the `switch (mionResp.serializer)` in all seven
  `platform-*` adapters.

### The client

- The client already picks its mode per method from the server's metadata rather than from
  its own option (`packages/client/src/lib/serializer.ts:220`), so a strategy chosen on the
  server should reach it for free. Confirm that still holds under the new shape.
- **The optimistic request is what breaks.** It sends plain `JSON.stringify` with no
  compiled function (`packages/client/src/lib/serializer.ts:95`); a compact route would
  decode that positionally and reject it. Wanted behaviour: scan the payload and skip the
  optimistic request when it contains objects, because we already know it would fail. When
  the payload is only scalars and arrays of scalars, plain JSON and compact agree, so the
  optimistic request is still safe and should still be taken.

### Docs

The runtypes Encoder Strategies table lists three of the four strategies and claims "The
JSON that comes out is the same"
(`container/website/content/02.runtypes/02.guide/05.json-serialization.md`), which compact
makes false; its example (`packages/examples/src/guide/json-strategies.ts`) omits compact
too. The rpc serialization page
(`container/website/content/01.rpc/02.server/08.serialization.md`) and its example
(`packages/examples/src/router/serializer-modes.ts`) describe the serializer modes and
would follow whatever shape this lands on.

The implementer plans the details: the new fn-set shape, how a route's strategy reaches the
resolver, what the default pairings are, whether the choice is per route or per direction
per route, and what happens to an app built by an older devtools.

## Done when

- `paramsJitFns` and `returnJitFns` are `{json, binary?}`, and a route compiles only the
  functions it actually uses.
- The router takes a default input strategy and a default output strategy, and a route can
  override either.
- Choosing binary on a route adds the binary set beside the json one instead of replacing it.
- `compact` is selectable this way end to end, server and client.
- The client skips the optimistic request when the chosen strategy cannot survive it, and
  still takes it when it can.
- Tests cover each strategy at the router and the client level, and any marker change
  follows the marker coverage rule.
- The strategy docs and their examples list every strategy that ships.
