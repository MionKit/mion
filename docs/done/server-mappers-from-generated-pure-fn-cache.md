# Source server mappers from @ts-runtypes' generated pure-fn cache instead of copying bodies

**Status:** done. Follow-up to
[virtual-module-retired-and-dual-core-load.md](virtual-module-retired-and-dual-core-load.md), which
made the transport a real generated module but kept mion's own copy of the mapper bodies. That copy
is gone: the server build now imports the pure-fn module @ts-runtypes already generated for each
mapper.
**Created:** 2026-08-21 · **Shipped:** 2026-08-22

Remaining upstream-blocked work split out to
[../todos/upstream-pure-fn-tuple-registrar.md](../todos/upstream-pure-fn-tuple-registrar.md).

## What shipped

`.mion/server-mappers.generated.js` in **build mode** now emits, per allowed key:

```js
import {registerServerMapperTuple} from '@mionjs/core';
import * as __mionMapper0 from "<client>/__runtypes/types/pf/rt/e86nWQ4Uzet9jZ.js";
registerServerMapperTuple("rt::e86nWQ4Uzet9jZ", Object.values(__mionMapper0).find((t) => Array.isArray(t) && t[3] === "rt::e86nWQ4Uzet9jZ"));
```

- The harvest keeps its filter (`calleeName === 'serverMapFrom' && calleeModule === '@mionjs/client'`
  — the security boundary, unchanged) but records the report's `module` field, resolved to an absolute
  path, instead of `code`/`paramNames`/`pureFnDependencies` being the payload.
- `registerServerMapperTuple` (`packages/core/src/runtypes/serverMappers.ts`) registers through
  upstream's public `registerPureFn`, which recognises an entry tuple and runs `initFromTuple` — so the
  entry gets its **real** `bodyHash` and upstream walks the tuple's whole dep closure.
- Verified against the built artifact: the mapper resolves and executes from
  `packages/test-server/.dist/esm/`, and `rt::newRunTypeErr` (an upstream internal in the same
  namespace) stays unreachable — the allow-list still gates.

## Investigation findings (all verified against @ts-runtypes/core@0.12.1, not read off the types)

### The copy is sound, but only as a MODULE IMPORT — never as data

`registerCore` branches on `isEntryTuple(arg)` → `initFromTuple(arg)`, which walks a dep closure via
the tuple's `deps` thunk (slot 1). That thunk closes over real ESM imports of sibling generated
modules. A JSON copy of a cache row silently drops it — `deps` and `createPureFn` are functions.
Currently moot (all 14 generated pf modules in this repo have an empty `deps` slot and no imports,
and `pureFnDependencies` is inert — nothing in core reads it), but the JSON manifest was structurally
incapable of ever carrying a mapper that grew a dependency. The module import is not.

### `site.module` removes the layout guess — and `allSingle` would have broken a guess

The pure-fn report already carries the module path, so nothing assumes a `pf/<ns>/<key>` shape:

| moduleMode | file emitted | `site.module` | exports in it |
|---|---|---|---|
| `default` / `allModules` | `types/pf/rt/e86nWQ4Uzet9jZ.js` | `pf/rt/e86nWQ4Uzet9jZ` | 1 |
| `allSingle` | `types/pf.js` | `pf` | 8 |

`<genDir>/types/${site.module}.js` is correct in both. `PURE_FN_MODULE_DIR = 'pf'` is *not* publicly
exported (unlike `ENTRY_MODULE_PREFIX`/`ENTRY_MODULE_SUFFIX`/`ENTRY_BINDING_PREFIX`/`CACHE_MODULES`),
so following the report is the only sound option anyway.

**The tuple is matched on its key slot, not taken by export name.** The export name encodes the
module's *logical* path (`__rt_pf$2Frt$2Fe86nWQ4Uzet9jZ`) rather than `site.module`, so under
`allSingle` it is neither derivable from the report nor "the single export". The escaping rule is
unverified beyond `/`→`$2F` — pure-fn hashes use the base64url alphabet (body hashes like
`-qbmpXV0FzUXhQ` prove `-` occurs) and `-` is not a valid identifier char. `PURE_FN_TUPLE_KEYS[3]` is
`key` in every mode, so the slot is the stable handle.

### "The `pf/` directory has to travel" — FALSE for production builds

This was the spec's biggest stated trade-off and it does not hold. Rollup resolves the import at build
time: with a bundling config the tuple is **inlined** into the artifact; with `preserveModules: true`
(what `test-server` uses) it is emitted as a sibling chunk inside the same dist. Either way the
artifact is self-contained, carries the real `bodyHash`, and needs no `node:fs`. The client's
`__runtypes/` tree is a **build-time input only** — the same requirement in kind as the JSON it
replaces, and both are gitignored build artifacts.

Two real costs instead: under `allSingle` the import pulls every pure fn in that bundle into the
server artifact (not a security hole — the allow-list still gates per key — but bundle weight), and
under `preserveModules` the server's dist gains a directory mirroring the client's path.

### The dev/serve lane deliberately did NOT migrate

`installServerMapperReader` still reads the manifest, `code` payload included. Its whole purpose is
the race where the server boots before the client build finished harvesting — a static import cannot
resolve a module that does not exist yet, and the on-miss re-read is synchronous because
`getServerMapper` sits on the router's request path. So `ServerMapperEntry.code` and
`registerServerMappers` stay, and build mode also falls back to them for a row with no `module`
(older reports, hand-written manifests) rather than dropping the mapper into a request-time failure.

### Bug fixed: mion fabricated `bodyHash`

`registerServerMappers` wrote `bodyHash: entry.key.slice(sep + 2)`. Upstream's `bodyHash` is a content
hash of the *body*; mion's wire `bodyHash` (`PureFnRef`) is the full registry key. Same name, different
things. The spec said "nothing observed depends on it" — true, but for a reason it did not give:
`registerServerMappers` returns early on `hasPureFnByKey`, so it never reaches the `addPureFn`
comparison that warns and **replaces**. That comparison does fire and does replace when reached:

```
Pure function rt::orderDemo body hash mismatch. Existing: REALHASH123, New: orderDemo. Replacing with new version.
```

Now `bodyHash: ''` — the honest value (the report does not expose the real one) and the safe one
(upstream only compares when both are non-empty). Pinned in `serverMappers.spec.ts`.

### Hazards found in upstream worth knowing

- **`processedKeys` is a permanent, never-cleared module-level `Set`** in `entryTuple.js` that gates
  re-registration. If a cache entry is evicted after its key was processed,
  `registerPureFn(key, tuple)` **throws** rather than re-registering
  (`[ts-runtypes] registerPureFn: no cache entry for "rt::wiped"`). Harmless for the normal path (the
  entry is still there, so re-registration is a no-op), but a live trap for a cache-clearing test
  helper or an HMR path.
- **Upstream's registry is module-local state**, not `globalThis`-backed (`pureFnsCache = {}` in
  `rtUtils.js`) — the dual-load failure recorded in
  [virtual-module-retired-and-dual-core-load.md](virtual-module-retired-and-dual-core-load.md). The
  generated pf modules have no imports of their own, so they add no new instance risk, and the
  generated server module imports only `@mionjs/core` — deliberately not `@ts-runtypes/core`, which a
  consumer app need not depend on directly.

### The key is already content-addressed, with dedup

No dev-supplied ID is needed and none was added: `serverMapFrom(order, (o) => o.userId)` derives its
key from the body at build time. Verified byte-identical mapper bodies in two different files collapse
to the **single** key `rt::UH0IFFsqjInsnc` — the same key an existing spec-file mapper with that body
already had. One body → one cache entry, across files.

Note the tuple's `bodyHash` field is *not* that content hash: `rt::UH0IFFsqjInsnc` and
`mionjs::toPreferenceId` have byte-identical bodies but different `bodyHash` values (`gHnkiwQvkAof4d`
vs `hqnMeCFROOcO6V`), so `bodyHash` folds in the key. The **key's** hash is the body-addressable one.

## What this does NOT replace: the harvest is still the security boundary

Unchanged, and re-confirmed. The generated `pf/` directory cannot be handed to the server wholesale:
all 8 entries are structurally identical — ts-runtypes internals (`rt::newRunTypeErr`), format helpers
(`rtFormats::isUUID`), the by-name mapper (`mionjs::toPreferenceId`) and the inline mapper
(`rt::e86nWQ4Uzet9jZ`) — and the inline mapper shares the `rt::` namespace with the internals.
**Nothing in the artifact marks "the client asked the server to run this one."**

That distinction exists only in the pure-fn build report, and it is load-bearing: the key arrives in
the routesFlow query string, is `JSON.parse`'d with no schema validation, and goes straight to a
registry lookup, so `allowedMapperKeys` is the only gate (see the security-boundary comment in
`serverMappers.ts`).

A mion-owned namespace would turn that gate into a prefix check and make the marker intrinsic to the
key — but `rt` is hardcoded upstream as a *builtin* namespace (`isBuiltinPureFnNamespace` returns true
for `'rt'` and `'rtFormats'`), the anonymous marker lane always emits `rt::<contentHash>`, and there is
no plugin option, marker, or config to change it. Filed as an upstream ask.

## Verified

- `pnpm exec vitest run --project core` — 12 cases in `serverMappers.spec.ts`, including the tuple
  door, the empty `bodyHash`, and both namespaces of the allow-list gate.
- `pnpm exec vitest run --project devtools` — 173 pass; `serverMappersModule.spec.ts` gained cases for
  the module-import renderer, the key-slot match, and the no-module fallback.
- `pnpm exec vitest run --project client` — 160 pass; the real cross-package handoff (client harvests →
  managed test-server consumes → `routesFlow.spec.ts` exercises `serverMapFrom` over the wire).
- The built `packages/test-server/.dist/esm/` artifact registers the mapper from the imported tuple,
  executes it, and still refuses `rt::newRunTypeErr`.
