# routesFlow validates its query at the trust boundary

**Status:** done — branch `refactor/runtypes-glue-umbrella`
**Created:** 2026-07-27 (as `docs/todos/routesflow-paramindex-validation.md`)
**Found while:** [pure-fns-out-of-mion-server-mappers.md](pure-fns-out-of-mion-server-mappers.md)

## Problem

`packages/router/src/routesFlow.ts` wrote an attacker-supplied value straight into an array:

```ts
const targetParams = ctx.request.body[mapping.toId] as any[];
if (targetParams) (targetParams as any[])[mapping.paramIndex] = mappedValue;
```

`mapping` rides the routesFlow URL query (`?data=<base64url JSON>`), decoded with a bare `JSON.parse`
and a cast. `fromId` / `toId` were looked up against the server-built chain index and `bodyHash` was
gated on the server-mapper allow-list — but **`paramIndex` was checked by nothing**. Its `number`
type was a claim about the wire, not a fact, so a string sailed through and
`params[mapping.paramIndex] = value` became a plain property write: `__proto__`, `length`, a negative
index, a float, or an integer far past the route's arity.

## Fix — two checks, at the two places that can make them

The todo proposed one check in `insertMappingMethods`. That covers the range but not the type, so the
fix is split by what each site actually knows:

**1. Shape, on decode (`assertValidRoutesFlowQuery`).** The whole `RoutesFlowQuery` is now established
once, where it crosses the boundary, instead of being assumed at each use: `routes` must be an array
of strings; every mapping must be an object with string `fromId` / `toId` / `bodyHash` and a
`paramIndex` that is a **non-negative integer**. That kills `__proto__`, `length`, `'0'` (a numeric
string is still a string), negatives and floats.

Deliberately runs **outside** decode's `try`/`catch`, so a shape rejection is reported as a shape
problem rather than being swallowed and relabelled `routesFlow-invalid-query: not valid base64url`.

**2. Range, while the chain is built (`insertMappingMethods`).** The upper bound needs the target
route's arity, which is only resolvable once `toId` has been mapped to a method:

```ts
const targetParamsCount = middleMethods[toIndex].paramsCount ?? 0;
if (mapping.paramIndex >= targetParamsCount) throw new RpcError({type: 'routesFlow-mapping-invalid-param-index', ...});
```

Placed **before** the `hasServerMapper(bodyHash)` lookup. That ordering is deliberate: the registry
lookup can trigger lazy compilation (`getPureFnByKey` → `initPureFunction` → `new Function`), so
there is no reason to compile a mapper for a mapping that is already invalid.

Both reject while the execution chain is being built. The target route never runs and the mapper is
never evaluated.

## Why not a compiled validator

The todo's "worth considering" was to run `createValidateFn<RoutesFlowQuery>()` over the decoded
query. Not taken: the router's `src` has **no** direct validator calls today (only its specs do), so
introducing one would make every consumer's build responsible for injecting it — a real
architectural commitment for a shape that is four primitives deep. The hand-written check is cheap,
has no build-time dependency, and lives next to the type it guards.

Worth revisiting if the query shape grows.

## Note on `paramsCount`

`MethodWithOptions.paramsCount` is optional, so the check falls back to `0` — i.e. a route with
unknown arity accepts no mappings. That is the safe direction, and it is not the live path: the
client e2e name-lane test maps into a real route at `paramIndex: 0` and still passes, which it could
not if the arity were missing.

## Tests

`packages/router/src/routesFlow.spec.ts`, next to the allow-list tests — 13 cases:

- string `paramIndex`: `__proto__`, `length`, `'0'`
- non-index numbers: `-1`, `1.5`, `NaN` (which JSON turns into `null` — still rejected)
- `999`, past the target's arity, with the arity named in the message
- structurally invalid queries: `routes` not an array, `routes` of non-strings, `mappings` not an
  array, a non-object mapping, a non-string `fromId`
- a shape problem is reported as a shape problem, not a parse failure

The valid path is covered by the existing client e2e mapper lanes, which still pass.

## Verification

Full suite **682 tests / 45 files green** (669 before, +13). 0 new typecheck errors in
core / router / client. Lint 0 errors.
