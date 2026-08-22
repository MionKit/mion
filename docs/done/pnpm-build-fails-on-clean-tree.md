# `pnpm run build` fails on a clean tree — test-server's lib build consumes a client TEST artifact

**Status:** done — fixed once
[server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md)
merged. Found while fixing
[stale-test-server-edge-bundles.md](stale-test-server-edge-bundles.md); unrelated in cause.
**Created:** 2026-08-22

## Problem

On a fresh clone, `pnpm run build` — step 4 of `scripts/pre-publish-test.sh` — died before it reached
any publishable package:

```
> @mionjs/test-server:build
$ vite build && vite build --config vite.edge.config.ts && vite build --config vite.cloudflare.config.ts
✗ Build failed in 21ms
[mionVitePlugin] serverMappers manifest not found at build time:
  /home/user/mion/packages/client/.mion/server-mappers.json
```

### Why

`serverMapFrom` lets client code declare a mapper that must execute on the **server**
(`serverMapFrom(order, (o) => o.userId)`). A function cannot cross the wire, so the client build
harvests those inline mappers into a manifest and the server build bakes them in; the wire carries
only the `rt::<hash>` key.

- **Emit side:** `packages/client/vitest.config.ts` → `packages/client/.mion/server-mappers.json`.
- **Consume side:** `packages/test-server/vite.config.ts`.

`packages/test-server`'s `build` script ran three vite builds — (1) `vite build` → `.dist/esm/**`, an
ESM lib build, (2) the edge bundle, (3) the cloudflare bundle. Only **(1)** carried
`serverMappers.consume`, and in `vite build` mode a missing manifest is a deliberate hard error
(`b9dbbae` — a production server bundle silently missing its mappers is worse than a failed build).

But that manifest is written **only by the client's test run**. Real `serverMapFrom(...)` call sites in
`packages/client` exist only in `*.spec.ts`, so the client's own library build could not produce it
either — it would write an empty manifest, which is worse: silently zero mappers. And `.mion/` is
gitignored, so a fresh clone had nothing.

Dependency ordering could not rescue it — the build task graph is **cyclic**, as nx reports:

```
@mionjs/client:build → @mionjs/platform-node:build → @mionjs/router:build
  → @mionjs/test-server:build → @mionjs/platform-cloudflare:build → @mionjs/router:build
```

(`router` devDepends on `test-server`, `client` devDepends on `test-server`, `test-server` depends on
`router`.) Adding `client` to test-server's deps just deepens the cycle.

It stayed invisible because the release gate happens to run tests (step 2) before build (step 4), and
because a maintainer's `.mion/` is warm from an earlier run — the same class of latent breakage as the
stale edge bundles.

## What shipped

**1. Replaced the coverage first.** Build (1) was the only place in the repo running
`serverMappers.consume` in build mode. After the pure-fn-cache refactor that lane does more, not less:
the generated module now emits `import * as __mionMapper0 from "<abs path into the CLIENT build's
__runtypes/types/ tree>"`, and whether rollup can actually **resolve** that import is a property
`serverMappersModule.spec.ts` cannot reach — it asserts the generated module's source text, not a
build. Removing build (1) with nothing in its place would have deleted the only end-to-end check of a
transport that had just been rewritten.

So `packages/devtools/src/vite-plugin/serverMappersBuild.spec.ts` now runs a **real `vite build`** over
a fixture: a generated pure-fn module in a fake client tree, a manifest pointing at it, and an entry
calling `initMionRouter`. It asserts the module's body is inlined into the artifact, that the
manifest's own `code` copy is **not** (the two bodies differ on purpose, so the spec cannot pass
through the fallback lane), that the real `bodyHash` rides along, that no `node:fs` or manifest path
survives into the bundle, and that a manifest pointing at a pruned module fails the build. Verified by
mutation: neutering the import lane in `renderMappersModule` turns it red.

**2. Then dropped build (1) from the release chain.** `test-server`'s `build` is now
`build:edge && build:cloudflare`; the lib build moved to an opt-in `build:lib`. It removes **no test**:

- `@mionjs/test-server` is `private: true` and absent from `scripts/pack-packages.sh` — never packed,
  never published.
- Every consumer resolves it through the `source` export condition (`resolve: {conditions: ['source']}`
  in every vitest config): the six client specs and `router/src/dispatch.binary.spec.ts` read
  `index.ts`, never `.dist`.
- The client's managed test server is spawned through **vite-node** in _serve_ mode over
  `vite.config.ts`; there the generated mappers module reads the manifest at runtime with a lazy
  re-read and tolerates it being absent. The dev/serve lane keeps its end-to-end coverage from the
  client suite.

`build:lib` still exists for anyone who wants `.dist` (run the client suite first), and
`packages/test-server/README.md` says why it is not in `build` — `package.json`'s `main` / `types` /
`exports.default` still point at a `.dist` that a plain `build` no longer produces, which is harmless
for a private package everything resolves via `source`, but should not be a surprise.

Verified: `rm -rf packages/client/.mion packages/*/.dist packages/test-server/build
packages/test-server/__runtypes*` then `pnpm run build` → "Successfully ran target build for 13
projects", exit 0.
