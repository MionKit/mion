# `moduleMode: 'allSingle'`: drop mion's guard once the upstream fix ships

**Status:** todo — **the upstream fix has landed**
([MionKit/ts-run-types#361](https://github.com/MionKit/ts-run-types/pull/361), commit `c7fb861`,
"import each fnId of a multi-fn site from its own family bundle") but is **not yet released**:
ts-runtypes `version.json` is still 0.12.1 and the fix merged after that release. Nothing is owed
upstream any more; what remains is mion-side. Companion to the shipped record
[../done/module-mode-allsingle-broken.md](../done/module-mode-allsingle-broken.md), which explains
why mion rejects the mode in the meantime.
**Created:** 2026-08-22 · **Affects:** @ts-runtypes/devtools@0.12.1

## What was wrong

`moduleMode: 'allSingle'` groups the compiled-fn cache into per-family modules
(`types/fns/<family>.js`) but emitted a **single** import from `types/fns/val.js` listing bindings
from all nine families, so every binding belonging to the other eight was unresolvable. Measured on
mion's `test-server` (68 types): **605 bindings imported from `val.js`, which exports 99. 537
unresolvable.** rollup failed the build with an empty error body ~6000 columns into a single-line
import; esbuild / vite-node did not check at all, so the names became `undefined` and surfaced far
from the cause as a registration error naming an internal route nobody wrote.

## What is owed

1. **Bump** past the release that carries `c7fb861`.
2. **Delete the `allSingle` guard** in `packages/devtools/src/vite-plugin/mionVitePlugin.ts` and its
   two cases in `removedOptions.spec.ts`.
3. **Run the end-to-end verification the guard currently blocks** — the server-mapper transport's
   `allSingle` handling is unit-tested but has never run in a live server (see
   [../done/server-mappers-from-generated-pure-fn-cache.md](../done/server-mappers-from-generated-pure-fn-cache.md)).

Deleting the guard is the whole mion-side remedy. Nothing else changes.

> **Opportunity:** phase 2 of
> [ts-run-types `unified-type-dependency-invalidation.md`](https://github.com/MionKit/ts-run-types/blob/main/docs/todos/unified-type-dependency-invalidation.md)
> temp-installs a locally packed ts-runtypes build into mion. That build already contains `c7fb861`,
> so it is the natural moment to run item 3 — the live-server check — without waiting for a release.
