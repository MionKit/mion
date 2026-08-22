# Upstream: `moduleMode: 'allSingle'` emits one import for nine per-family fn modules

**Status:** todo — report to @ts-runtypes, then drop mion's guard once a fixed version ships.
Diagnosis complete and reproduced; nothing left to investigate. Companion to the shipped record
[../done/module-mode-allsingle-broken.md](../done/module-mode-allsingle-broken.md), which explains why
mion rejects the mode in the meantime.
**Created:** 2026-08-22 · **Affects:** @ts-runtypes/devtools@0.12.1

## What is owed

1. File this upstream (the body below is written to be pasted as-is).
2. When a fixed version ships: bump, delete the `allSingle` guard in
   `packages/devtools/src/vite-plugin/mionVitePlugin.ts` and its two cases in
   `removedOptions.spec.ts`, and run the end-to-end verification the guard currently blocks — the
   server-mapper transport's `allSingle` handling is unit-tested but has never run in a live server
   (see [../done/server-mappers-from-generated-pure-fn-cache.md](../done/server-mappers-from-generated-pure-fn-cache.md)).

Deleting the guard is the whole mion-side remedy. Nothing else changes.

---

## Report body

### Summary

`moduleMode: 'allSingle'` groups the compiled-fn cache into per-family modules
(`types/fns/<family>.js`) but does not group the emitted import bindings to match. The transform emits
a **single** import from `types/fns/val.js` listing bindings from all nine families, so every binding
belonging to the other eight is unresolvable. `default` and `allModules` are unaffected.

Measured on a real project (mion's `test-server`, 68 types): **605 bindings imported from `val.js`,
which exports 99. 537 unresolvable.**

### `default` — one module per (family, type), one import each

```
__runtypes/types/nPZ_AcOSeCY.js   → export const __rt_nPZ_AcOSeCY = [...]   // val
__runtypes/types/pBb_AcOSeCY.js   → export const __rt_pBb_AcOSeCY = [...]   // verr
__runtypes/types/X13_AcOSeCY.js   → export const __rt_X13_AcOSeCY = [...]   // rj
```

```js
import { __rt_X13_AcOSeCY } from "../__runtypes/types/X13_AcOSeCY.js";
import { __rt_XFJ_AcOSeCY } from "../__runtypes/types/XFJ_AcOSeCY.js";
import { __rt_lRN_AcOSeCY } from "../__runtypes/types/lRN_AcOSeCY.js";
```

Every name matches its file. Across the whole transformed module: **674 bindings imported, 0
unresolvable.**

### `allSingle` — one module per family, but still only one import

```
__runtypes/types/fns/val.js    → export const __rt_nPZ_AcOSeCY, __rt_nPZ_BV5TXPH, …   (99 names)
__runtypes/types/fns/verr.js   → export const __rt_pBb_AcOSeCY, …
__runtypes/types/fns/rj.js     → export const __rt_X13_AcOSeCY, …
```

The transform now has to emit nine imports, one per family module. It emits one:

```js
import {
  __rt_X13_AcOSeCY,   // rj family   → actually lives in fns/rj.js
  __rt_X13_AcWeeuM,   // rj family   → fns/rj.js
  __rt_X13_BV5TXPH,   // rj family   → fns/rj.js
  ... 599 more, spanning all nine families ...
  __rt_tt1_yce0q4C,
} from "../__runtypes/types/fns/val.js";   // ← but they all point here
```

No import is emitted for `verr.js`, `pj.js`, `rj.js`, `sj.js`, `huk.js`, `uke.js`, `tb.js` or
`fb.js` at all. Every generated-module import in the transformed file:

```
1 from "../__runtypes/types/fns/val.js"     ← the only fn-family import
1 from "../__runtypes/types/pf.js"
1 from "../__runtypes/types/runtypes.js"
```

### Two failure modes, depending on whether the bundler validates imports

**rollup (`vite build`)** checks imported names against the target's exports, so it fails at build
time — but unreadably, because the offset lands ~6000 columns into a single-line import:

```
src/test-server.ts (1:6597): Error when using sourcemap for reporting an error:
Can't resolve original location of error.
error during build:
file: .../src/test-server.ts:1:6597
    at Module.traceVariable (rollup/dist/es/shared/node-entry.js:17813:29)
```

The message body is empty — no binding name, no import target.

**esbuild / vite-node (vitest)** does not check. The unresolved names become `undefined`, so a
consumer reading the injected marker payload sees only the one slot that resolved:

```
slots=["tuple[kind=val,key=nPZ_A6IwqAG]","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF"]
```

and fails much later, far from the cause. In mion's case that surfaces as a registration error naming
an internal route the user never wrote.

### Reproduce

Any project with more than one fn family per type. Set `moduleMode: 'allSingle'`, delete the
generated `__runtypes/` tree, build, then compare the transform's `types/fns/*.js` import against that
file's `export const` names:

```js
// vite plugin ordered after @ts-runtypes/devtools
{name: 'dump', transform(code, id) { if (id.endsWith('<entry>.ts')) writeFileSync('out.js', code); return null; }}
```

### Suggested fix

Group emitted bindings by the family module that holds them and emit one import per group, the way
`default` already emits one import per module. A binding must never be imported from a module that
does not export it.

Worth adding as a regression check regardless of the grouping fix: assert that every emitted import
name is exported by its target — that turns any future variant of this into a clear error instead of
an empty rollup trace or a silently-undefined binding.
