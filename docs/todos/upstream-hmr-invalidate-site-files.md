# Upstream ask: `@ts-runtypes/devtools` should invalidate (and report) the site files whose fns changed on an HMR update

**Status:** todo — upstream request for `@ts-runtypes/devtools` (pinned at 0.12.1 here). The mion-side
symptom and measurements live in
[type-only-dep-hmr-staleness.md](type-only-dep-hmr-staleness.md); this spec is the fix as seen from
the other side, so it can be picked up in that repo.
**Created:** 2026-08-22

## The gap

Compiled fns are injected when the **using** module is transformed. The type they reflect usually
lives in another file, imported **as a type** — which is erased, so vite has no module-graph edge
from the user to the type file. Editing the type therefore invalidates nothing: the dev server keeps
serving the cached transform, which still imports the previous fn module (the fn id encodes the
type's shape, so a changed shape is a _different_ module), and the app keeps validating the old
shape until the using file itself is touched.

Everything except the last step already happens in the plugin's HMR path
(`dist/unplugin.js:283-322`): on a change it does `setSources` → `scanFiles` → `generate`, so the
resolver and the generated tree are current. What is missing is telling vite to re-transform the
modules whose injected fns just changed.

The plugin is the only party that can do this: it owns the transform, it receives the change event,
and its scan graph is what knows which site files reflect the type that changed. A host can only
guess (invalidate everything carrying an injected reference).

## Ask

1. **Compute the delta.** After `generate()` on an HMR update, determine which site files' demanded
   fn ids changed. The plugin already keeps a `siteFiles` set; keeping the demanded ids per site file
   (or a hash of them) makes this a comparison, not a new scan.
2. **Invalidate them.** For each changed site file, look it up in `server.moduleGraph`
   (`getModulesByFile`) and invalidate it — or, idiomatically for vite, return those `ModuleNode`s
   from `handleHotUpdate`, which tells vite to update exactly those modules.
3. **Report them — this is the part a host cannot work around.** Add a callback option, e.g.

   ```ts
   onSiteFilesChanged?: (siteFiles: string[]) => void   // paths whose injected fn ids changed
   ```

   because **not every site file is a real module in vite's graph**. Sources registered through
   `setSources` may be virtual: mion registers a Vue SFC's `<script>` as `Comp.vue.ts`, while the
   module vite actually serves is `Comp.vue`. Invalidating by site-file path silently misses those —
   `.ts` files would recover while `.vue` files stayed stale. With the report, the host maps its own
   virtual paths back to the real module id and invalidates that.

   An equivalent alternative is to let the caller resolve the module id itself:

   ```ts
   resolveSiteModuleId?: (siteFile: string) => string | undefined
   ```

   and have the plugin invalidate whatever that returns. Either shape works; the requirement is that
   virtual site files are not silently dropped.

## Acceptance

The scenario measured in the sibling spec, in `vite dev`:

```ts
// src/models.ts
export type Signup = {email: string; age: number};

// src/uses.ts   (and the same code inside a .vue <script>)
import {createValidateFn} from '@ts-runtypes/core';
import type {Signup} from './models.ts';
export const validate = createValidateFn<Signup>();
```

Add a required `country: string` to `Signup`, then re-fetch `/src/uses.ts` (and `/src/App.vue`)
without touching either file: both must come back importing a **new** `__rt_…` id whose body checks
`country`. Today both keep the old id.

## Why it matters beyond convenience

The stale validator does not error — it accepts data the current type rejects. A dev iterating on a
type sees validation "pass" against a shape that no longer exists, which is the failure mode most
likely to be mistaken for a mion bug.
