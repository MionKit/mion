# Dev: editing a type-only dependency leaves compiled fns stale until the using file is touched

**Status:** todo — pre-existing, affects `.ts` and `.vue` alike (measured side by side). Surfaced
while verifying [../done/vue-sfc-runtypes-transform.md](../done/vue-sfc-runtypes-transform.md); NOT
caused by it. Needs a decision on how aggressively mion may invalidate, hence a spec rather than a
quiet fix.
**Created:** 2026-08-22

## Problem

In `vite dev`, a marker's compiled fns are injected when the *using* module is transformed. If the
type it reflects lives in another file and is imported **as a type**, that import is erased, so vite
has no module-graph edge from the user to the type file — nothing invalidates the using module when
the type changes. The dev server keeps serving the previously injected fn (validating the OLD shape)
until the using file itself is edited or the server restarts.

## Evidence

A scratch Vue app, dev server running, `Signup` declared in `src/models.ts` and reflected by a marker
in two places — an SFC and a plain `.ts`:

```
plain .ts before edit                       __rt_nPZ_BfJXPb5
edit models.ts (add a property) → re-fetch  __rt_nPZ_BfJXPb5   ← unchanged, stale
SFC after touching the SFC itself           __rt_nPZ_tb1XjRd   ← new type, correctly re-injected
```

So the staleness is about the *dependency edge*, not about SFCs: `.ts` and `.vue` behave identically,
and both recover as soon as the using file changes. A production `vite build` is unaffected — every
module is transformed in one pass.

## Why it is not fixed in that PR

Fixing it means invalidating modules that vite has no edge for, which needs to know **which** using
modules a changed type file affects. The resolver knows the site graph (`scanFiles` reports sites per
file), but the vite plugin surfaces no "these site files' fn ids changed" signal, so the options are:

1. **Upstream**: have `@ts-runtypes/devtools` report the site files whose generated fns changed on an
   HMR update, and invalidate exactly those. Correct and cheap at runtime.
2. **In mion, heuristic**: on any `.ts` change, invalidate every module mion knows carries markers.
   Simple, but over-invalidates and only mion's own SFC modules are tracked today — a partial fix
   that would make `.vue` behave differently from `.ts`, which is worse than a consistent limitation.

That is a call for the maintainer (and probably an upstream ask), not a mechanical follow-up.

## Interim

Dev only, self-healing: touch the file that uses the type (or restart the dev server) after changing
a type it reflects. Nothing ships stale — builds are unaffected.
