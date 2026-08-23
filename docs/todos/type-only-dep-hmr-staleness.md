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
   HMR update, and invalidate exactly those. Correct and cheap at runtime.
2. **In mion, invalidate what carries markers.** On a `.ts`/`.vue` change, walk vite's module graph
   and invalidate every module whose last transform result contains an injected `__rt_` reference
   (`ModuleNode.transformResult.code` holds it), then let vite re-transform them. This needs no
   upstream change, is consistent across `.ts` and `.vue`, and only re-transforms modules that
   actually carry compiled fns — but it over-invalidates (every marker-bearing module on every type
   edit, not just the affected ones) and it makes mion responsible for invalidating modules the
   ts-runtypes plugin, not mion, transformed.

That is a call for the maintainer (and probably an upstream ask), not a mechanical follow-up.

## Interim

Dev only, self-healing: touch the file that uses the type (or restart the dev server) after changing
a type it reflects. Nothing ships stale — builds are unaffected.
