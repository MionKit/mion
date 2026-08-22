# Upstream asks: a supported pure-fn tuple registrar, a mapper namespace, and genDir on the report

**Status:** todo — blocked on @ts-runtypes. Split out of
[../done/server-mappers-from-generated-pure-fn-cache.md](../done/server-mappers-from-generated-pure-fn-cache.md),
which shipped everything that could land mion-side.
**Created:** 2026-08-22

Three gaps surfaced while moving the `serverMapFrom` transport onto @ts-runtypes' generated pure-fn
modules. Each has a working mion-side compromise today; each compromise is a place mion reaches past
a public API, so each is worth closing upstream rather than leaving indefinitely.

## 1. No supported way to hand an entry tuple to the pure-fn cache

`registerPureFn(key, tuple)` works at runtime — `registerCore` branches on `isEntryTuple(arg)`, calls
`initFromTuple`, and walks the tuple's dep closure. But that shape is what the **transform produces**,
not what a caller may write: the second parameter is a `PureFunction` marker, so the scanner rejects
anything but an inline function literal.

```
error PFN001: `PureFunction<F>` argument must be an INLINE arrow or function expression.
```

Confirmed by writing such a call in a `.ts` file: the whole vitest run halts. `initFromTuple` — the
function that actually does the work — is **not exported** from `@ts-runtypes/core`, and the package
`exports` map has no deep paths (`.`, `./formats`, `./formats/temporal`, `./builders`, `./schema`).
So there is exactly one public door and a lint rule aimed at a different use case guards it.

mion's inline lane has neither half a marker call needs: its key is a content hash read from a build
manifest, and its body is a tuple imported from the client's generated tree.

**Current compromise:** `registerServerMapperTuple` in `packages/core/src/runtypes/serverMappers.ts`
routes through a local alias (`registerPureFnUntracked`), which takes the call out of the scanner's
view while keeping upstream's real runtime behaviour. Deliberate, commented, and covered by tests —
but it is an evasion of a lint rule, and if the scanner ever matches through aliases it breaks.

**Ask:** export `initFromTuple`, or add a `registerPureFnFromTuple(key, tuple)` that is explicitly
outside the marker contract — the same way `getPureFnByKey` is already documented as the untracked
door for wire-driven lookups.

## 2. No mion-owned namespace for anonymous pure fns

The `serverMapFrom` inline lane goes through the anonymous marker path (`PureFunction` +
`InjectPureFnHash`) and always lands in `rt::<contentHash>` — the same namespace as ts-runtypes'
own internals (`rt::newRunTypeErr`, `rt::getUnknownKeysFromArray`). `rt` is hardcoded as a builtin
(`isBuiltinPureFnNamespace` returns true for `'rt'` and `'rtFormats'`), and there is no plugin
option, marker, or config to change it.

That is the reason the generated `pf/` tree cannot be consumed wholesale: **nothing in the artifact
marks which entries the client asked the server to run.** mion recovers that distinction from the
build report (`calleeName === 'serverMapFrom' && calleeModule === '@mionjs/client'`) and carries it
in a manifest, because the key cannot carry it.

**Ask:** let a consumer configure the namespace for anonymous pure fns emitted from its own marker
wrappers — e.g. a per-call-site or per-package namespace, so mion's mappers land in
`mionServerMap::<contentHash>`. mion's allow-list would collapse from a manifest-fed `Set` to a
prefix check, and the harvest would stop needing a manifest at all for the build lane.

Everything else this needs already exists: the key is content-addressed with dedup (byte-identical
bodies in different files collapse to one key — verified), so no dev-supplied ID would be involved.

## 3. `onPureFnReport` does not receive the genDir its `module` paths are relative to

`PureFnSite.module` gives the generated module's path (`pf/rt/e86nWQ4Uzet9jZ`, or just `pf` under
`moduleMode: 'allSingle'`), which is what lets a consumer resolve the module without assuming a
layout. But it is relative to the resolver's genDir, and the callback signature is `(sites, phase)`.
Upstream's own authoritative value, `gen.outDir`, is consumed internally
(`@ts-runtypes/devtools/dist/unplugin.js:228`) one line before the callback fires.

**Current compromise:** `resolveGenDir()` in `packages/devtools/src/vite-plugin/mionVitePlugin.ts`
mirrors upstream's resolution — `cwd` defaults to the vite root, and an unset genDir defaults to
`<cwd>/__runtypes`. It works, and `runTypes.genDir` overrides it, but it duplicates a default mion
does not own.

**Ask:** pass `outDir` to `onPureFnReport`, or add an absolute path to `PureFnSite`.

Related: `PURE_FN_MODULE_DIR = 'pf'` is not publicly exported, unlike `ENTRY_MODULE_PREFIX`,
`ENTRY_MODULE_SUFFIX`, `ENTRY_BINDING_PREFIX` and `CACHE_MODULES`. Following `site.module` avoids
needing it — but if a consumer ever has to construct a pure-fn path itself, the constant is missing.

## Also worth reporting upstream (not blocking mion)

`processedKeys` in `entryTuple.js` is a permanent, never-cleared module-level `Set` that gates
re-registration. If a cache entry is evicted after its key was processed, `registerPureFn(key, tuple)`
**throws** instead of re-registering:

```
[ts-runtypes] registerPureFn: no cache entry for "rt::wiped".
The Vite plugin must process this file before runtime — check that the plugin is installed…
```

The message points at a plugin misconfiguration, which is not the actual cause. Harmless on the normal
path (the entry is still present, so re-registration is a no-op), but a live trap for any
cache-clearing test helper or HMR path — and the diagnostic would send someone the wrong way.
