# `moduleMode: 'allSingle'` emits an import for 1 of its 9 fn modules, so most bindings resolve to nothing

**Status:** done — the mode is rejected at config time, which is the whole mion-side remedy. The defect
itself is upstream's (@ts-runtypes/devtools@0.12.1); reporting it and removing the guard once a fixed
version ships is tracked in
[../todos/upstream-allsingle-import-grouping.md](../todos/upstream-allsingle-import-grouping.md).
Pre-existing, not caused by the server-mapper transport work; found while verifying that transport
against every module mode
([server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md)).
**Created:** 2026-08-22 · **Shipped:** 2026-08-22

## Root cause

`allSingle` splits the compiled-fn cache into **nine per-family modules** —
`types/fns/{val,verr,pj,rj,sj,huk,uke,tb,fb}.js`, each exporting only its own family's bindings
(`__rt_nPZ_*` in `val.js`, `__rt_pBb_*` in `verr.js`, `__rt_X13_*` in `rj.js`, …).

The transform emits **one** import for the first of them, listing bindings from **all nine**:

```
import target      : ../__runtypes/types/fns/val.js
bindings requested : 605
exported by target : 99
UNRESOLVABLE       : 537   e.g. __rt_X13_AcOSeCY, __rt_X13_AcWeeuM, __rt_X13_BV5TXPH
they live in       : fb.js, huk.js, pj.js, rj.js, sj.js, tb.js, uke.js, verr.js
```

No import is emitted for those eight files at all. Every emitted import in the transformed module:

```
1 from "../__runtypes/types/fns/val.js"     ← the only fn-family import
1 from "../__runtypes/types/pf.js"
1 from "../__runtypes/types/runtypes.js"
```

Under `default`/`allModules` each fn gets its own module and one import per binding, so the grouping
step this mode needs never runs. Nothing mion does causes it — mion does not emit that import block.

## One defect, two unreadable symptoms

This is why it looked like two different bugs:

- **`vite build` (rollup)** validates bindings against the target's exports, so it fails at
  `Module.traceVariable` — reported as an **empty error message** at `test-server.ts:1:6597`, a
  6000-column offset into a single-line import, with `Can't resolve original location of error`.
- **vitest / vite-node (esbuild)** does not validate them. The unresolved names become `undefined`,
  mion's marker payload arrives as 1-of-9, and registration dies much later with
  `MissingRtFnsError: Route/middleFn "mion@methodsMetadata" has no build-time type information` — a
  route the user never wrote.

An earlier draft of this spec recorded the second symptom as the root cause. It is not; it is what
survives when a bundler declines to check imports.

## mion's fail-closed guard is correct — do not touch it

`buildJitFnsFromMarker` (`packages/core/src/runtypes/mionAdapter.ts`) rejects a payload missing any of
`val/verr/pj/rj/sj`. That is right. The missing fns are not merely un-injected — they never reach the
registry, so there is nothing to fall back to. Initializing the one resolvable tuple and then
resolving every family by hash:

```
PROBE mion@methodsMetadata#params: isType=CACHED typeErrors=MISS prepareForJson=MISS restoreFromJson=MISS
      stringifyJson=MISS hasUnknownKeys=MISS unknownKeyErrors=MISS toBinary=MISS fromBinary=MISS
```

Relaxing the check would silently substitute identity fallbacks for validation and serialization.

## What shipped

`mionVitePlugin` throws on `runTypes.moduleMode: 'allSingle'`, beside the existing
`emitMode: 'functions'` guard, naming the real cause. Covered in `removedOptions.spec.ts`, which also
pins that `'default'` and `'allModules'` still pass.

**If upstream fixes the transform, delete the guard — that is the whole remedy**, and this record is
the reason it exists. Reporting it and doing that removal is tracked in
[../todos/upstream-allsingle-import-grouping.md](../todos/upstream-allsingle-import-grouping.md),
which carries the report body ready to paste.

Rejected alternative, recorded so it is not re-attempted: mion could import all of `types/fns/*.js`
itself when `allSingle` is set, so the bindings resolve. It pulls every compiled fn in the program
into every build, depends on the `types/fns/` layout (not publicly exported), and papers over a
transform defect from the wrong side of the boundary.

## Reproduce

```sh
# add `moduleMode: 'allSingle'` to the runTypes block of packages/test-server/vite.config.ts
# (temporarily remove the guard in mionVitePlugin.ts first)
rm -rf packages/test-server/__runtypes packages/test-server/.dist
pnpm --filter @mionjs/test-server exec vite build     # rollup: empty traceVariable error
pnpm exec vitest run --project client                 # runtime: MissingRtFnsError
```

To see the mismatch directly, add a `transform` hook after `mionVitePlugin` that dumps
`test-server.ts`, then compare its `types/fns/*.js` import against that file's `export const` names.

## Upstream report

Written up ready to file in
[../todos/upstream-allsingle-import-grouping.md](../todos/upstream-allsingle-import-grouping.md), with
the `default`-vs-`allSingle` generated code side by side. In one line: emitted bindings must be grouped
by the family module that holds them, one import per group — `allSingle` emits a single import for
`fns/val.js` while referencing bindings from all nine family modules.
