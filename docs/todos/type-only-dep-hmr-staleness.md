# Dev: editing a type-only dependency leaves compiled fns stale until the using file is touched

**Status:** todo — pre-existing, affects `.ts` and `.vue` alike (measured side by side). Surfaced
while verifying [../done/vue-sfc-runtypes-transform.md](../done/vue-sfc-runtypes-transform.md); NOT
caused by it. Needs a decision on how aggressively mion may invalidate, hence a spec rather than a
quiet fix.
**Created:** 2026-08-22

## Problem

In `vite dev`, a marker's compiled fns are injected when the _using_ module is transformed. If the
type it reflects lives in another file and is imported **as a type**, that import is erased, so vite
has no module-graph edge from the user to the type file — nothing invalidates the using module when
the type changes. The dev server keeps serving the previously injected fn (validating the OLD shape)
until the using file itself is edited or the server restarts.

## What it looks like

```ts
// src/models.ts
export type Signup = {email: string; age: number};
```

```ts
// src/uses.ts
import {createValidateFn} from '@ts-runtypes/core';
import type {Signup} from './models.ts'; // type-only: erased at compile time
export const validate = createValidateFn<Signup>();
```

The module vite serves has NO edge back to `models.ts` — the import is gone, and the shape now lives
in the generated module the injected import points at:

```js
import {__rt_nPZ_BfJXPb5} from './__runtypes/types/nPZ_BfJXPb5.js';
import {createValidateFn} from '@ts-runtypes/core';
export const validate = createValidateFn(void 0, void 0, __rt_nPZ_BfJXPb5);

// src/__runtypes/types/nPZ_BfJXPb5.js
function nPZ_BfJXPb5(v) {
  return typeof v === 'object' && v !== null && typeof v.email === 'string' && Number.isFinite(v.age);
}
```

Add a required `country: string` to `Signup` and the watcher invalidates `models.ts` and its
IMPORTERS — a set `uses.ts` is not in. It keeps its cached transform, keeps pointing at
`nPZ_BfJXPb5`, and keeps accepting `{email, age}` as valid.

A VALUE import from the same file would have created the edge, invalidated the importer and
re-injected. The trigger is exactly the erasure — and not only `import type`: a plain
`import {Signup}` used only in type position is erased too.

## Evidence

A scratch Vue app, dev server running, `Signup` declared in `src/models.ts` and reflected by a marker
in two places — an SFC and a plain `.ts`:

```
plain .ts before edit                       __rt_nPZ_BfJXPb5
edit models.ts (add a property) → re-fetch  __rt_nPZ_BfJXPb5   ← unchanged, stale
SFC after touching the SFC itself           __rt_nPZ_tb1XjRd   ← new type, correctly re-injected
```

So the staleness is about the _dependency edge_, not about SFCs: `.ts` and `.vue` behave identically,
and both recover as soon as the using file changes. A production `vite build` is unaffected — every
module is transformed in one pass — and so is vitest, which transforms fresh per run.

## Why it is not fixed in that PR

Fixing it means invalidating modules that vite has no edge for, which needs to know **which** using
modules a changed type file affects. The resolver knows the site graph (`scanFiles` reports sites per
file), but the vite plugin surfaces no "these site files' fn ids changed" signal, so the options are:

1. **Upstream**: have `@ts-runtypes/devtools` report the site files whose generated fns changed on an
   HMR update, and invalidate exactly those. Correct and cheap at runtime — written up as
   [upstream-hmr-invalidate-site-files.md](upstream-hmr-invalidate-site-files.md).
2. **In mion, invalidate what carries markers.** On a `.ts`/`.vue` change, walk vite's module graph
   and invalidate every module whose last transform result contains an injected `__rt_` reference
   (`ModuleNode.transformResult.code` holds it), then let vite re-transform them. This needs no
   upstream change, is consistent across `.ts` and `.vue`, and only re-transforms modules that
   actually carry compiled fns — but it over-invalidates (every marker-bearing module on every type
   edit, not just the affected ones) and it makes mion responsible for invalidating modules the
   ts-runtypes plugin, not mion, transformed.

That is a call for the maintainer (and probably an upstream ask), not a mechanical follow-up.

## What mion has to do once upstream fixes it

Not zero — and the third item will not fix itself, so it is written down here rather than
rediscovered when the bump lands:

1. **Bump + lockfile.** Every dependency here is exact-pinned (`@ts-runtypes/devtools: 0.12.1`), so
   nothing arrives until the version is raised.
2. **Re-verify the delegation contract.** mion's SFC pass calls upstream's `handleHotUpdate` with a
   fabricated context (`{file, read, modules: [], timestamp: 0}`) purely to get
   setSources → scanFiles → generate. If the fix adds invalidation _inside_ that hook, it may start
   reaching for things mion does not pass (`ctx.server`, a real `modules` array). This is what
   `packages/devtools/src/vite-plugin/sfcTransform.spec.ts` and the runtime audit exist for — a
   broken delegation fails the suite and warns in dev rather than going quiet — but the fix may be
   as small as adding a field to that context.
3. **Map virtual site files back to real modules.** mion registers an SFC's script under a VIRTUAL
   path (`Comp.vue.ts`); the module vite serves is `Comp.vue`. Upstream invalidating by site-file
   path would hit nothing for SFCs — `.ts` files would recover while `.vue` files stayed stale. mion
   must translate, which needs upstream to REPORT what changed (see
   [upstream-hmr-invalidate-site-files.md](upstream-hmr-invalidate-site-files.md), point 3). On the
   mion side it is a `Map<virtualPath, realFile>` in `sfcTransform.ts` — the plugin already tracks
   the real file per injection — plus the handler for whatever hook upstream exposes.

Optional afterwards: if upstream grows a first-class "transform this virtual source" API (an id
filter plus `setSources`), parts of `sfcTransform.ts` can be deleted in favour of it. The current
path keeps working either way.

## Interim

Dev only, self-healing: touch the file that uses the type (or restart the dev server) after changing
a type it reflects. Nothing ships stale — builds are unaffected.
