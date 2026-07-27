# routesFlow writes an unvalidated `paramIndex` from the wire

**Status:** todo
**Type:** bug — security
**Created:** 2026-07-27
**Found while:** [pure-fns-out-of-mion-server-mappers.md](../done/pure-fns-out-of-mion-server-mappers.md)

## Problem

`packages/router/src/routesFlow.ts`, in `createMappingHandler`:

```ts
const targetParams = ctx.request.body[mapping.toId] as any[];
if (targetParams) (targetParams as any[])[mapping.paramIndex] = mappedValue;
```

`mapping` comes off the wire. It rides the routesFlow URL query (`?data=<base64url JSON>`), decoded
by `decodeRoutesFlowQuery` with a bare `JSON.parse` and a cast — **no schema validation**. Every
field is attacker-controlled.

The sibling fields are checked: `fromId` and `toId` are looked up against the server-built chain
index, and `bodyHash` is gated on the server-mapper allow-list (that gate is the subject of the
change this was found in). **`paramIndex` is checked by nothing.**

It is typed `number`, but the type is a lie about wire data — `JSON.parse` will happily produce a
string, and a cast does not check.

## What that allows

- `"__proto__"` / `"constructor"` — writing to a property that is not an array index.
- `"length"` — truncating or extending the params array.
- A huge integer — forcing a sparse array allocation.
- A negative index or one past the end — a param slot the route never declared.

How far any of these get depends on what runs after: the mapped params are handed to route
validation, so a well-typed route should reject a mangled params array. That makes this most likely
a robustness/DoS issue rather than a direct RCE — **but it has not been tested**, and "the next layer
probably catches it" is not a validation strategy for a value read straight off a URL.

## Fix

Validate at the same place the other mapping fields are validated (`insertMappingMethods`, alongside
the `fromId`/`toId`/`bodyHash` checks) so a bad mapping is rejected while the chain is being built,
not mid-dispatch:

```ts
if (!Number.isInteger(mapping.paramIndex) || mapping.paramIndex < 0 || mapping.paramIndex >= targetMethod.paramsCount)
    throw new RpcError({ type: 'routesFlow-mapping-invalid-param-index', ... });
```

`paramsCount` is already on the method metadata, so the upper bound is free.

## Worth considering

The root cause is broader than one field: `RoutesFlowQuery` crosses the trust boundary as a bare
cast. mion compiles validators from types for every route — running one over the decoded query in
`decodeRoutesFlowQuery` would close this and any sibling defect at once, and is closer to how the
rest of the framework treats untrusted input.

## Tests

- A mapping with `paramIndex: "__proto__"`, `"length"`, `-1`, and `999` is each rejected while the
  chain is built, and the target route never runs.
- The valid path still works (covered today by the client e2e mapper tests).

## Done when

- `paramIndex` is validated before use, or the whole query is validated on decode.
- The rejection has a regression test at the router level, next to the allow-list tests added in
  `routesFlow.spec.ts`.
