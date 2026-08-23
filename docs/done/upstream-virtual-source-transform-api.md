# Upstream ask: a "transform this virtual source" API — NOT NEEDED, it already exists

**Status:** done — **WITHDRAWN. The API was already there.** Investigated and closed 2026-08-23.
**Created:** 2026-08-23 · **Closed:** 2026-08-23

## Outcome

The premise was wrong. `@ts-runtypes/devtools` already exposes exactly the entry point mion needs,
and has since before the 0.12.2 bump: **`rtHotUpdate`**, documented in the plugin as

> the escape hatch a host with no HMR hook of its own uses to absorb an edit

It takes `{file, content}` pairs and runs setSources → scanFiles → generate — which is the whole of
what mion needs to make a Vue SFC's `<script>` visible to the resolver despite existing nowhere on
disk. Turbopack's broker uses it for the same reason: no HMR callback of its own.

So there was never anything to ask upstream for. mion had simply reached for the wrong entry point.

## What changed instead

`injectFns` in `packages/devtools/src/vite-plugin/sfcTransform.ts` now calls `rtHotUpdate` directly:

```ts
await absorb(ctx, [{file: virtualPath, content: source}]);
```

instead of fabricating a vite HMR context (`{file, read, modules: [], timestamp: 0}`) to reach
`handleHotUpdate`. Both land on the same shared leaf, so behaviour is unchanged — but the code now
uses a hook for what it is named for, which is what the "awkwardness" motivating this spec actually
was. The old path is kept as a fallback so an older plugin still works.

Verified: `sfcTransform.spec.ts` stays at 13/13, including the end-to-end type-dependency
invalidation test.

## A side effect that was checked and is NOT real

Worth recording, because it looks plausible on a code read. `rtHotUpdate` fires
`onSiteFilesChanged`, and mion calls it on **every** SFC transform, not only on a real edit — so in
principle a plain transform could invalidate unrelated marker-bearing modules through mion's
`invalidateStaleSites` handler.

Measured rather than assumed: a dev server was instrumented to record every
`moduleGraph.invalidateModule` call, then an SFC was transformed with nothing changed. The result
was **`[]`** — nothing invalidated. The stale set excludes the files being registered, and nothing
in the fixture depended on the SFC's virtual path. No churn, no loop, nothing to fix.

## Why this spec existed at all

It began as a loose "optional afterwards" note inside
[type-only-dep-hmr-staleness.md](type-only-dep-hmr-staleness.md), was dropped twice during rewrites
of that document, and was given its own file so it would stop getting lost. Then the first person to
actually look at the upstream API surface found the API already shipped. The note had been carried
forward on trust for longer than it survived scrutiny.
