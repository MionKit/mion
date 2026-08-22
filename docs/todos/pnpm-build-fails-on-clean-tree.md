# `pnpm run build` fails on a clean tree — test-server's lib build consumes a client TEST artifact

**Status:** todo — deferred on purpose, see "Why not now". Found while fixing
[stale-test-server-edge-bundles.md](../done/stale-test-server-edge-bundles.md); unrelated in cause.
**Created:** 2026-08-22

## Problem

On a fresh clone, `pnpm run build` — step 4 of `scripts/pre-publish-test.sh` — dies before it reaches
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

- **Emit side:** `packages/client/vitest.config.ts:15` → `packages/client/.mion/server-mappers.json`.
- **Consume side:** `packages/test-server/vite.config.ts`.

`packages/test-server`'s `build` script runs three vite builds — (1) `vite build` → `.dist/esm/**`, an
ESM lib build, (2) the edge bundle, (3) the cloudflare bundle. Only **(1)** carries
`serverMappers.consume`, and in `vite build` mode a missing manifest is a deliberate hard error
(`b9dbbae` — a production server bundle silently missing its mappers is worse than a failed build).

But that manifest is written **only by the client's test run**. Real `serverMapFrom(...)` call sites in
`packages/client` exist only in `*.spec.ts`, so the client's own library build could not produce it
either — it would write an empty manifest, which is worse: silently zero mappers. And `.mion/` is
gitignored, so a fresh clone has nothing.

Dependency ordering cannot rescue it — the build task graph is **cyclic**, as nx reports:

```
@mionjs/client:build → @mionjs/platform-node:build → @mionjs/router:build
  → @mionjs/test-server:build → @mionjs/platform-cloudflare:build → @mionjs/router:build
```

(`router` devDepends on `test-server`, `client` devDepends on `test-server`, `test-server` depends on
`router`.) Adding `client` to test-server's deps just deepens the cycle.

It stays invisible because the release gate happens to run tests (step 2) before build (step 4), and
because a maintainer's `.mion/` is warm from an earlier run — the same class of latent breakage as the
stale edge bundles.

## Fix plan

Drop build (1) — the `.dist` ESM lib output — from `packages/test-server`'s `build` script, keeping
`build:edge` and `build:cloudflare`. This removes **no test**:

- `@mionjs/test-server` is `private: true` and absent from `scripts/pack-packages.sh` — never packed,
  never published.
- Every consumer resolves it through the `source` export condition (`resolve: {conditions: ['source']}`
  in every vitest config): the six client specs and `router/src/dispatch.binary.spec.ts` read
  `index.ts`, never `.dist`.
- The client's managed test server is spawned through **vite-node** in _serve_ mode over
  `vite.config.ts`; there the generated mappers module reads the manifest at runtime with a lazy
  re-read and tolerates it being absent. The `serverMapFrom` transport keeps its end-to-end coverage
  from the client suite.
- The build-mode inlining that (1) exercises is already unit-tested by
  `packages/devtools/src/vite-plugin/serverMappersModule.spec.ts`.

Caveat to handle in the same change: `package.json`'s `main` / `types` / `exports.default` then point
at a `.dist` that is never built. Harmless for a private package everything resolves via `source`, but
it needs a comment on the `build` script saying so, or the fields trimmed.

## Why not now

Build (1) is the **only place in the repo that runs `serverMappers.consume` in build mode**, and
[server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md) is
being implemented right now against exactly that path — its fix-plan step 2 changes what
`.mion/server-mappers.generated.js` emits at build time. Deleting the build now would pull the only
integration-level exercise out from under that work.

That refactor does **not** fix this on its own: its step 1 keeps the harvest (shrunk to an allow-list
of keys), so the manifest stays a client-test-time artifact and a fresh clone still has nothing to
consume. Land this once that merges, and decide then whether build (1) goes away or gains a
manifest-independent way to run.
