# mion side: adopt the upstream type-dependency invalidation

**Status:** todo — blocked on the upstream fix, which is specced in ts-run-types as
[`docs/todos/unified-type-dependency-invalidation.md`](https://github.com/MionKit/ts-run-types/blob/main/docs/todos/unified-type-dependency-invalidation.md).
That spec drives the whole arc (upstream fix → pack → temp-install here → this work → both PRs);
**this doc is its phase 3 checklist.** Surfaced while verifying
[../done/vue-sfc-runtypes-transform.md](../done/vue-sfc-runtypes-transform.md); NOT caused by it.
**Created:** 2026-08-22

## The symptom, briefly

In `vite dev`, a marker's compiled fns are injected when the _using_ module is transformed. If the
type it reflects lives in another file and the import is erased (`import type`, or a plain import
used only in type position), Vite has no module-graph edge from the user to the type file, so
nothing invalidates the using module when the type changes. The dev server keeps serving the
previously injected fn, validating the OLD shape, until the using file is touched or the server
restarts.

Measured side by side, `.ts` and `.vue` behave identically — the trigger is the erased edge, not the
file kind:

```
plain .ts before edit                       __rt_nPZ_BfJXPb5
edit models.ts (add a property) → re-fetch  __rt_nPZ_BfJXPb5   ← unchanged, stale
SFC after touching the SFC itself           __rt_nPZ_tb1XjRd   ← new type, correctly re-injected
```

Dev only, self-healing, nothing ships stale: `vite build` transforms every module in one pass, and
vitest transforms fresh per run. Full diagnosis, the failure modes on other bundlers, and the fix
design live in the upstream spec.

## What mion has to do

Three items. The third will not fix itself, which is why this doc exists rather than being folded
into the upstream one.

1. **Bump + lockfile.** Every dependency here is exact-pinned (`@ts-runtypes/devtools: 0.12.1`), so
   nothing arrives until the version is raised. During phase 2 of the upstream spec this is a
   temporary `file:` tarball; by phase 5 it must be back to a registry version.
2. **Re-verify the delegation contract.** mion's SFC pass calls upstream's `handleHotUpdate` with a
   fabricated context (`{file, read, modules: [], timestamp: 0}`) purely to get
   setSources → scanFiles → generate. The fix adds invalidation _inside_ that hook, so it may start
   reaching for things mion does not pass (`ctx.server`, a real `modules` array). This is what
   `packages/devtools/src/vite-plugin/sfcTransform.spec.ts` and the runtime audit exist for — a
   broken delegation fails the suite and warns in dev rather than going quiet — but the fix may be
   as small as adding a field to that context.
3. **Map virtual site files back to real modules.** mion registers an SFC's script under a VIRTUAL
   path (`Comp.vue.ts`); the module Vite serves is `Comp.vue`. Upstream invalidating by site-file
   path alone would hit nothing for SFCs — `.ts` files would recover while `.vue` files stayed
   stale. This is exactly why the upstream spec reports the changed set through an
   `onSiteFilesChanged` callback instead of only acting on it. On the mion side it is a
   `Map<virtualPath, realFile>` in `sfcTransform.ts` (the plugin already tracks the real file per
   injection) plus the handler wiring.

Cover the result in `sfcTransform.spec.ts`; `pnpm run test`, `pnpm run lint`, `pnpm run format`
green before the PR.

## Acceptance

With `Signup` declared in `src/models.ts` and reflected from a plain `.ts` and from a `.vue`
`<script>`, add a required `country: string` and re-fetch both **without touching either file**.
Both must come back importing a new `__rt_…` id whose body checks `country`.

Optional afterwards: if upstream grows a first-class "transform this virtual source" API (an id
filter plus `setSources`), parts of `sfcTransform.ts` can be deleted in favour of it. The current
path keeps working either way.

## Interim

Touch the file that uses the type (or restart the dev server) after changing a type it reflects.
