# Source server mappers from @ts-runtypes' generated pure-fn cache instead of copying bodies

**Status:** todo — maintainer's idea (2026-08-21), investigated and found feasible. Follow-up to
[virtual-module-retired-and-dual-core-load.md](../done/virtual-module-retired-and-dual-core-load.md),
which made the transport a real generated module but kept mion's own copy of the mapper bodies.
**Created:** 2026-08-21

## The idea

Rather than mion harvesting mapper bodies into `.mion/server-mappers.json` and rehydrating them
server-side, reuse @ts-runtypes' own pure-fn machinery: let it register the functions in its pure-fn
cache, and move those entries into the server's cache.

## It is already half-built — the client side is entirely marker-driven

`serverMapFrom`'s inline overload (`packages/client/src/routesFlow.ts:82-86`) declares
`mapper: PureFunction<…>` and `hash?: InjectPureFnHash<…>`. Those two markers
(`@ts-runtypes/core/dist/markers.d.ts`) are what make the resolver compile the mapper and inject its
content hash at the call site. So the mapper is ALREADY emitted as its own generated module:

```
$ cat packages/client/__runtypes/types/pf/rt/e86nWQ4Uzet9jZ.js
export const __rt_pf$2Frt$2Fe86nWQ4Uzet9jZ=[2,,,'rt::e86nWQ4Uzet9jZ','KZ3VH21oWQk9qj',[],
  'return (customerValue) => customerValue.preferenceId;',[]];
```

Against `PURE_FN_TUPLE_KEYS` (`entryKind, deps, ini, key, bodyHash, paramNames, code,
pureFnDependencies, createPureFn`) that carries exactly what mion's manifest row carries — plus the
real `bodyHash`.

And the registration path is public, as the built server bundle shows:

```
$ grep '__rt_pf' packages/test-server/.dist/esm/src/test-server-json.js
import { __rt_pf$2Fmionjs$2FtoPreferenceId } from "../__runtypes/types/pf/mionjs/toPreferenceId.js";
registerPureFn("mionjs::toPreferenceId", __rt_pf$2Fmionjs$2FtoPreferenceId);
```

So a server build can register a mapper straight from the generated cache with `registerPureFn` —
instead of `registerServerMappers` hand-building a `compiled` object and pushing it through
`addPureFn`, which `packages/core/src/runtypes/serverMappers.ts:114-118` itself describes as "the
low-level door, and the only option here". With generated tuples it is no longer the only option.

## Bug found while investigating: mion fabricates `bodyHash`

`registerServerMappers` sets `bodyHash: sep > 0 ? entry.key.slice(sep + 2) : ''`
(`packages/core/src/runtypes/serverMappers.ts:106`), i.e. `e86nWQ4Uzet9jZ` — the fn-name half of the
key. The real generated tuple carries `KZ3VH21oWQk9qj`. mion has been writing a value that is not the
body hash. Nothing observed depends on it today, which is why it is invisible; it should be fixed
whether or not the rest of this lands, and it disappears for free if the entries come from upstream.

## What this does NOT replace: the harvest is the security boundary

The generated `pf/` directory cannot simply be handed to the server wholesale. All 8 entries in
`packages/client/__runtypes/types/pf/` are structurally identical — ts-runtypes internals
(`rt::newRunTypeErr`), format helpers (`rtFormats::isUUID`), the by-name mapper
(`mionjs::toPreferenceId`) and the inline mapper (`rt::e86nWQ4Uzet9jZ`) — and the inline mapper shares
the `rt::` namespace with the internals. **Nothing in the artifact marks "the client asked the server
to run this one."**

That distinction exists only in the pure-fn build report, where the harvest filters on
`site.calleeName === 'serverMapFrom' && site.calleeModule === '@mionjs/client'`
(`packages/devtools/src/vite-plugin/mionVitePlugin.ts`). And it is load-bearing: the key arrives in the
routesFlow query string, is `JSON.parse`'d with no schema validation, and goes straight to a registry
lookup, so `allowedMapperKeys` is the only gate (see the security-boundary comment in
`serverMappers.ts:35-50`). Consume the whole `pf/` dir and every client pure fn — and every
ts-runtypes internal — becomes wire-callable.

## Fix plan

1. Keep the harvest, shrink it: emit an **allow-list of keys**, not a copy of the bodies.
2. Have the generated `.mion/server-mappers.generated.js` `import` each allowed key's module from the
   client's `__runtypes/types/pf/<ns>/<key>.js` and call `registerPureFn(key, tuple)` +
   `allowServerMapper(key)` — dropping the `addPureFn` low-level door and mion's rehydration entirely.
3. Delete the `code`/`paramNames`/`pureFnDependencies` fields from `ServerMapperEntry` and the
   `buildPureFnFactoryFromCode`-shaped path that consumes them, once nothing reads them.
4. Keep `installServerMapperReader`'s dev-mode lazy re-read: the race it covers (server boots before
   the client build finished harvesting) is unchanged by where the bodies come from.

## Trade-offs to weigh before starting

- **Cross-build file coupling gets wider.** Today the server build needs one JSON reachable at build
  time; after this it needs the client's `__runtypes/types/pf/` tree. Same requirement in kind, more
  files — and in a split client/server deployment that directory has to travel.
- **Layout coupling.** `pf/<ns>/<key>.js` is an upstream implementation detail, whereas the tuple
  format plus `registerPureFn` is the public contract the transform itself emits. If upstream
  reorganises the generated tree this breaks; worth asking upstream for a supported way to resolve a
  generated pure-fn module by key before committing to the path shape.
- **Benefit is real but narrow:** one source of truth for the body (no drift between mion's copy and
  the generated module), the public registrar instead of the low-level door, and the fabricated
  `bodyHash` goes away.
