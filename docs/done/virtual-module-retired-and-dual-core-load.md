# Retire `virtual:mion/server-mappers` — it was breaking the transport AND duplicating `@mionjs/core`

**Status:** done. Surfaced by the repaired release gate
([pre-publish-gate-repair.md](pre-publish-gate-repair.md)).
**Created:** 2026-08-21

## What was wrong

`virtual:mion/server-mappers` was mion's last virtual module (ts-runtypes had already moved to real
generated files under `__runtypes/`). It caused two distinct failures:

1. **The transport never travelled in production builds.** Rollup tests `external` against the
   RESOLVED id, and the plugin resolved to `\0virtual:mion/server-mappers`, which still matches a
   catch-all like `/^[^./]/`. So the import was externalized and survived verbatim into the bundle,
   where nothing can resolve it. The build-time inlining the code documented never happened. Not
   hypothetical — the in-repo artifact had it:
   `packages/test-server/.dist/esm/src/test-server-json.js:649: import "virtual:mion/server-mappers";`
2. **It duplicated `@mionjs/core` in packaged consumers.** In `test-publish` the server process
   printed mion's own dual-load warning at boot ("has been loaded 2 times in this process") with only
   ONE `@mionjs/core` installed — a module-graph duplication, not a duplicate install. The virtual
   module's bare `import {installServerMapperReader} from '@mionjs/core'` was resolved from a
   `\0`-prefixed id with no file context, so it did not dedupe with the rest of the SSR graph.

The consequence of (2) is not cosmetic. `registerServerMappers` writes the mapper body through
`getRTUtils().addPureFn` (`packages/core/src/runtypes/serverMappers.ts:88-118`), and upstream's
registry is plain module-scoped state (`@ts-runtypes/core/dist/runtypes/rtUtils.js:6-9` —
`rtFnsCache` / `pureFnsCache` / `runTypesCache`, no `globalThis` backing). Two instances means the
router resolves the wire key against a registry that never received it, and the whole routesFlow is
rejected with the generic error envelope.

**Correction to this spec's first draft:** it blamed _mion's_ registries. That was wrong — mion's own
state is dual-load safe (`allowedMapperKeys` and `mapperReaderStore` both go through
`getOrCreateGlobal`, `packages/core/src/utils.ts:11`). The split was upstream's registry, and the
cause was the virtual module, not a missing `ssr.noExternal`.

## What shipped

The plugin now writes a **real** module, `<root>/.mion/server-mappers.generated.js` (`.mion/` is
already gitignored, and is where the harvest writes its JSON), and injects the side-effect import
itself into whichever module imports `initMionRouter` from `@mionjs/router` — users write nothing.
Both modes are unchanged: `vite build` inlines the entries as static data (no `node:fs` in the
artifact), dev/serve installs the lazy re-reader that covers the client-build race.

Removed with it: `virtual-modules.d.ts`, the `./virtual-modules` export from
`packages/devtools/package.json`, the `resolveId`/`load` hooks, the ambient `types` entries in four
tsconfigs, and the hand-written `import 'virtual:mion/server-mappers';` lines. The transport is also
no longer wired at all when `serverMappers.consume` is absent, so pipelines that merely import a
server module for its route types are untouched.

The two-stage JSON transport is unchanged — it is the cross-package handoff (`packages/client`
harvests, `packages/test-server` consumes).

## Verified

- `packages/test-server/.dist/esm/src/test-server-json.js` now imports
  `../.mion/server-mappers.generated.js`, emitted alongside it and carrying
  `registerServerMappers([{"key":"rt::e86nWQ4Uzet9jZ", …}])`. The mappers ship for the first time.
- The dual-load warning is **gone** from the packaged consumer, and `test-publish` is 62/62 with
  nothing skipped — the `serverMapFrom` flow test that was pinned to this spec now passes against
  packed tarballs. Fixing (1) fixed (2).
- `packages/devtools/src/vite-plugin/serverMappersModule.spec.ts` (7 cases) covers both modes, the
  injection rule, the modules it must NOT touch, and the missing-manifest build failure.
- `test-publish/src/tests/build-output.spec.ts` now asserts the inlined mapper body and that no
  `virtual:` specifier survives into the artifact.

## Note for the SSR work

`docs/todos/vite-plugin-ssr-middleware-mode.md` item 3 (R28) proposes re-adding
`ssr.noExternal: [/@mionjs\//]`. The duplication we could actually reproduce came from the virtual
module and is fixed without it — adding `noExternal` by hand did NOT clear the warning. Whether a real
Nuxt/SSR setup still needs it is untested, so treat R28 as open but unproven rather than as a known bug.
