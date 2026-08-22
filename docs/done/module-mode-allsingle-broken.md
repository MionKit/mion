# `moduleMode: 'allSingle'` breaks every route: 1 of 9 compiled fns is injected

**Status:** done — the mode is now rejected at config time. The underlying bug is upstream's
(@ts-runtypes/devtools@0.12.1) and stays theirs; nothing is owed here. Pre-existing, not caused by the
server-mapper transport work; found while verifying that transport against every module mode
([server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md)).
**Created:** 2026-08-22 · **Shipped:** 2026-08-22

## What shipped

`mionVitePlugin` throws on `runTypes.moduleMode: 'allSingle'`, next to the existing
`emitMode: 'functions'` guard, so the failure names its own cause at config time instead of surfacing
as a `MissingRtFnsError` on a route the user never wrote. Covered in `removedOptions.spec.ts`, which
also pins that `'default'` and `'allModules'` still pass.

Deliberately NOT done: the two workarounds below. If upstream fixes the transform, delete the guard —
that is the whole remedy, and this record is the reason it exists.

## Evidence

`mionVitePlugin` accepts `runTypes.moduleMode`, and `'allSingle'` is one of upstream's three
documented modes (`MODULE_MODES = ['default', 'allSingle', 'allModules']`). Setting it makes the
server fail to boot on the very first route:

```
Failed to start test server: MissingRtFnsError: Route/middleFn "mion@methodsMetadata" has no build-time type information.
Cause: mion run-types: incomplete compiled-fn payload for 'mion@methodsMetadata#params'
       (got 9 entries; val/verr/pj/rj/sj are required).
```

Reproduce: add `moduleMode: 'allSingle'` to the `runTypes` block of both
`packages/client/vitest.config.ts` and `packages/test-server/vite.config.ts`, delete the generated
`__runtypes/` trees, and run `pnpm exec vitest run --project client`.

## Root cause: the payload is 1-of-9, not short

The array has all 9 slots, but only the first is filled. Instrumenting `buildJitFnsFromMarker`
(`packages/core/src/runtypes/mionAdapter.ts`) to dump the slots:

```
slots=["tuple[kind=val,key=nPZ_A6IwqAG]","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF","UNDEF"]
```

**mion's fail-closed guard is correct and must stay.** The missing fns are not merely un-injected,
they are genuinely absent from the runtime cache. Initializing the one injected tuple (whose dep
closure is supposed to pull in the rest) and then resolving every family by hash:

```
PROBE mion@methodsMetadata#params: isType=CACHED typeErrors=MISS prepareForJson=MISS restoreFromJson=MISS
      stringifyJson=MISS hasUnknownKeys=MISS unknownKeyErrors=MISS toBinary=MISS fromBinary=MISS
```

So relaxing the guard would not fix it — it would silently substitute identity fallbacks for
validation and serialization, which is exactly what the guard's comment exists to prevent.

## The functions ARE generated — they are just never wired up

Under `allSingle` the tree is `types/{runtypes.js, pf.js, fns/}`, and `types/fns/` holds a bundle per
family (`val.js`, `verr.js`, `pj.js`, `rj.js`, `sj.js`, `huk.js`, `uke.js`, `tb.js`, `fb.js`,
`csr.js`). All nine families exist for the failing type:

```
$ grep -rho "'[a-zA-Z0-9]\{3\}_A6IwqAG'" packages/client/__runtypes/
'X13_A6IwqAG'  'XFJ_A6IwqAG'  'lRN_A6IwqAG'  'mY6_A6IwqAG'  'nPZ_A6IwqAG'
'pBb_A6IwqAG'  'plZ_A6IwqAG'  'qm4_A6IwqAG'  'tt1_A6IwqAG'
```

Nine hashes, nine families, all emitted. The transform injects one of them at the call site and
nothing imports the other bundles, so they never reach the registry. The same marker yields a
complete 9-tuple payload under `default` and a 1-of-9 payload under `allSingle` — an inconsistency in
the transform, not in what mion asks for.

## Fix plan

Upstream owns the real fix: report the inconsistency — a marker requesting N fn families should inject N tuples (or
import the family bundles that hold them) in every module mode.

Rejected alternatives, recorded so they are not re-attempted:

- **Import the family bundles.** mion could import all of `types/fns/*.js` when `allSingle` is set and
  let `initFromTuple` register everything. It pulls every compiled fn in the program into every build,
  and depends on the `types/fns/` layout, which is not publicly exported.
- **Relax the `val/verr/pj/rj/sj` check in `buildJitFnsFromMarker`.** See the probe above: the other
  eight families are absent from the cache, so this would swap identity fallbacks in for validation
  and serialization instead of fixing anything.

## Consequence for the server-mapper transport

The transport's own `allSingle` handling is correct and unit-tested: the harvest resolves the mapper's
module to `types/pf.js` (verified — the manifest carries that path under `allSingle`), and the tuple is
matched on its key slot rather than an export name, which is what makes one-module-holding-eight-fns
work. But it **cannot be verified end to end** while this bug stands, because no route registers at
all under `allSingle`. Re-run that verification once this is fixed.
