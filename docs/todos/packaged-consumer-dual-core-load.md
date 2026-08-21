# `@mionjs/core` loads twice in a packaged consumer's server, splitting mion's registries

**Status:** todo — reproducible, with a skipped test pinned to it. Surfaced by the repaired release
gate ([pre-publish-gate-repair.md](../done/pre-publish-gate-repair.md)).
**Created:** 2026-08-21

## Problem

In `test-publish` — a project consuming the packed tarballs the way a real user would — the server
process started through `mionVitePlugin`'s managed-server lane prints mion's own dual-load warning at
boot:

```
[mion] @mionjs/core has been loaded 2 times in this process. This indicates @mionjs/* is not properly
bundled — most often a missing/incorrect ssr.noExternal config. mion requires
ssr.noExternal: [/@mionjs\//] to guarantee single-instance state.
```

Only **one** `@mionjs/core` is installed (`ls node_modules/.pnpm | grep '^@mionjs+core'` → a single
entry), so this is a module-graph duplication — the same file loaded under two identities, the classic
vite SSR externalized-vs-inlined split — not a duplicate install.

The consequence is not cosmetic. mion's global registries are per-instance, so the
`serverMapFrom` transport breaks: `virtual:mion/server-mappers` registers the harvested mapper into one
core instance and the router resolves the wire key against the other. The whole routesFlow is rejected
with the generic error envelope, exactly as `packages/client/src/routesFlow.spec.ts` documents for an
unregistered mapper key.

## Evidence

- The client half works: `test-publish/.mion/server-mappers.json` is written with the harvested body,
  `[{"key": "rt::e86nWQ4Uzet9jZ", "code": "return (customerValue) => customerValue.preferenceId;"}]`.
- The same flow passes in the monorepo (`packages/client/src/routesFlow.spec.ts`, inline-mapper case),
  because `packages/test-server/vite.config.ts` sets `resolve.conditions: ['source']` for both the app
  and SSR graphs, so everything resolves to workspace source — a single instance by construction. The
  duplication only appears against real installed packages.
- Adding `ssr: {noExternal: [/@mionjs\//]}` by hand to `test-publish/vite.server.config.ts` did **not**
  clear the warning, so the fix is not simply "the consumer should have configured it" — needs a look
  at how vite-node resolves `ssr.noExternal` in this lane.
- Pinned by the skipped test in `test-publish/src/tests/json.spec.ts`
  ("serverMapFrom should run a client-authored mapper on the server, mid-flow"). Un-skip with the fix.

## Related, and probably the same wave

This is R28 from [migration-review-findings.md](../done/migration-review-findings.md): the plugin
stopped auto-adding `ssr.noExternal: [/@mionjs\//]`, noted in
[vite-plugin-ssr-middleware-mode.md](vite-plugin-ssr-middleware-mode.md) as an SSR nicety to re-add.
The gate shows it is more than that — it breaks `serverMapFrom` for packaged consumers.

## A second, separable defect found in the same place

`virtual:mion/server-mappers` is swallowed by the standard `rollupOptions.external` regexes. Rollup
tests `external` against the resolved id, and the plugin resolves it to `\0virtual:mion/server-mappers`,
which still matches a catch-all like `/^[^./]/`. The production bundle therefore ships a literal
`import "virtual:mion/server-mappers";` that nothing can resolve at runtime, and the build-time
inlining the plugin documents ("entries are INLINED into the bundle at build time … no node:fs in the
artifact") silently never happens.

**This is not hypothetical and not limited to test-publish** — the in-repo artifact has it too:

```
$ grep -n 'virtual:mion' packages/test-server/.dist/esm/src/test-server-json.js
649:import "virtual:mion/server-mappers";
```

Fix plan: have `mionVitePlugin` defend itself rather than relying on every consumer's `external`
config — e.g. wrap `build.rollupOptions.external` in the plugin's `config()` hook so ids starting with
`\0` or `virtual:` are never externalized. Then assert the inlined mapper body in
`test-publish/src/tests/build-output.spec.ts`, which deliberately does not assert it today.
