# Optional upstream: a first-class "transform this virtual source" API

**Status:** todo — OPTIONAL and unblocked-by-nothing. Nothing in mion needs it; the current path
works and is covered by tests. Filed so the idea has a durable home: it was carried as a loose note
inside another spec and got dropped twice during rewrites.
**Created:** 2026-08-23

## The shape of it

mion registers a Vue SFC's `<script>` with the resolver under a VIRTUAL path (`Comp.vue.ts`) so the
type-aware transform can see code that exists nowhere on disk. There is no API for that, so
`injectFns` in `packages/devtools/src/vite-plugin/sfcTransform.ts` fabricates an HMR context:

```ts
await register.call(ctx, {file: virtualPath, read: async () => source, modules: [], timestamp: 0});
const result = await plugin.transform.call(ctx, source, virtualPath);
```

`handleHotUpdate` is used purely to reach setSources → scanFiles → generate. It works, and
`@ts-runtypes/devtools` 0.12.2 reads that context defensively (`ctx.server?.moduleGraph`,
`ctx.modules ?? []`), so it keeps working. But it is a hook being used for something other than what
it is named for, and that is only safe by upstream's continued goodwill.

## What would replace it

If `@ts-runtypes/devtools` exposed registering-and-transforming a virtual source directly (an id
filter plus `setSources`), part of `sfcTransform.ts` could be deleted in favour of it.

## Why this is not urgent

**The current path keeps working either way.** It is exercised by
`packages/devtools/src/vite-plugin/sfcTransform.spec.ts` (13 cases, including the end-to-end
type-dependency invalidation test that runs against the real released build), so a regression in the
delegation would fail the suite rather than go quiet. Treat this as a cleanup to take when someone
is already in that file, not work to schedule.

## Related

- [../done/type-only-dep-hmr-staleness.md](../done/type-only-dep-hmr-staleness.md) — the invalidation
  work that made mion's SFC delegation load-bearing.
- [../done/next-ts-runtypes-bump.md](../done/next-ts-runtypes-bump.md) — the 0.12.2 bump.
