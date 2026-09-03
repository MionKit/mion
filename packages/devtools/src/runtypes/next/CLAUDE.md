# The Next.js / Turbopack adapter

This is the only adapter that reaches a bundler **without a plugin**. Turbopack has no
plugin API and does not run webpack plugins, which is why unplugin cannot support it
([unjs/unplugin#302](https://github.com/unjs/unplugin/issues/302), open since 2023). What
it does run is webpack-style **loaders**, declared in `turbopack.rules`.

Shape: [`index.ts`](./index.ts) (`withRunTypes` + the composable pieces) starts a
[`broker.ts`](./broker.ts) from `next.config`, and [`loader.ts`](./loader.ts) runs inside
each Turbopack worker and asks that broker to rewrite one file over a socket
([`wire.ts`](./wire.ts)). The loader owns no resolver and runs no `buildStart`.

Set `MION_NEXT_DEBUG=1` to trace the broker (election, buildStart, absorbed edit batches,
stamp changes). There is no plugin log here, so a misbehaving dev loop is otherwise opaque.

## ⚠️ There is deliberately NO `next build` test in the vitest suite

Do not "fix" that by adding one. `next` is ~202 MB and is **not** a workspace dependency,
so a vitest test would be permanently skipped on every developer machine and in CI — a
test that never runs, which is worse than no test.

The real `next build` coverage lives in the e2e container, where Next **is** installed:

- [`container/pre-publish-e2e/apps/smoke-next/`](../../../../container/pre-publish-e2e/apps/smoke-next/) —
  the app. Its page prerenders the shared `selfCheck()`, so a passing build proves the
  rewrite survived Turbopack **and** the transformed code ran.
- [`container/pre-publish-e2e/build-all.mjs`](../../../../container/pre-publish-e2e/build-all.mjs) —
  the `smoke-next` entry and its `buildNext` driver (out-of-process, like the bun apps).
- [`container/pre-publish-e2e/test/build-outputs.test.mjs`](../../../../container/pre-publish-e2e/test/build-outputs.test.mjs) —
  the assertions, read out of the prerendered HTML.

**So: broker/loader logic that can be tested without Next goes in
[`../../test/next-broker.test.ts`](../../test/next-broker.test.ts); anything that needs a
real Turbopack build goes in the e2e app.** Both are required for a change here.

## ⚠️ Invariants that look like cleanups and are not

Each of these was a real failure before it was a rule.

1. **The socket key includes the process id** (`socketPathFor`). Keying on the project root
   alone makes the socket a global rendezvous that any process evaluating `next.config` can
   claim — including Next's detached telemetry flush, which loads the config, outlives the
   dev server, and gets reparented to init. A later run then joins THAT resolver and every
   file fails with `source file not in program` from a Program belonging to a build that
   ended minutes ago. It is completely silent about the cause.
2. **Connections are accepted BEFORE `buildStart` finishes**, with each request waiting on a
   readiness promise. Attaching the handler afterwards silently drops any connection that
   arrived during startup, because an EventEmitter discards events with no listener, and the
   worker hangs forever.
3. **`setSources` must receive the WHOLE overlay** — that lives in the shared
   [`rtHotUpdate`](../unplugin.ts) leaf, not here, but this adapter is what makes it
   load-bearing. `setSources` REPLACES the overlay and rebuilds the Program against exactly
   what it gets, so pushing only edited files collapses the Program and the next
   `generate()` deletes every other entry's module from disk (measured: 62 modules → 2 on a
   single two-file edit, then ~180 unresolvable imports). Vite survives it by re-transforming
   lazily; Turbopack resolves the whole graph eagerly and just fails.
4. **The broker watches the source tree itself.** Turbopack gives loaders no update callback.
   Absorbing edits one loader call at a time regenerates the module set once PER FILE, and a
   file resolved during one of those rewrites fails on a module that exists moments later.
   One batch per edit is one regenerate.
5. **`./next/loader` exports a `default` condition, not `import`** (see the package's
   `exports`). Turbopack resolves a loader specifier with CJS `require` conditions, so an
   `import`-only entry is invisible to it and the build dies with
   `Package subpath './next/loader' is not defined by "exports"`.
6. **Loader options cross into the worker as plain JSON.** No functions. That is why
   `onPureFnReport` cannot be forwarded through the rules and has to be set on the broker
   (which runs in the `next.config` process, so it still works there).
7. **The loader must declare its type dependencies** (`addDependency`), and that means
   **`reply.typeDeps` AND `reply.stamp`, both, every time**. Turbopack only knows the import
   graph, so it cannot see that a rewrite depends on a type declared elsewhere.

   `typeDeps` names the files that actually declare the reflected types, so a type edit
   re-runs only the files reflecting it. It comes from the resolver
   (`TransformResult.typeDeps`) via the shared transform hook's `addWatchFile`, which the
   broker's plugin context collects — the same mechanism every bundler host uses, so this
   lane cannot drift from them.

   **An empty `typeDeps` means UNKNOWN, not "no dependencies"** (a type the resolver could
   not attribute, or an older resolver on the other end of the socket). The stamp is the
   coarse fallback that keeps that case correct: one path every rewritten file declares, so
   any type change re-runs all of them. Dropping it because "typeDeps covers it now" turns
   an unknown into a silently stale rewrite. Verified by A/B on an AMBIENT type (declared in
   a `.d.ts`, so there is genuinely no import edge to follow): with the stamp removed and
   before typeDeps existed, editing it under `next dev` left a cached rewrite importing a
   generated module that had just been pruned and the dev server returned 500 with
   `Can't resolve ../.mion/types/<hash>.js`; with it, the same edit re-transformed
   cleanly with zero resolve errors.

   Note the asymmetry, because it is easy to test the wrong lane and conclude the stamp is
   dead code: **`next build` re-runs loaders on every build**, so a type change is picked up
   there even with the stamp disabled (confirmed against the persistent build cache, both
   for an ordinary imported type and an ambient one). The stamp is belt-and-braces for
   builds and load-bearing for dev. Test it in **dev**, with a type that has no import edge.

## Gotchas when testing by hand

- `turbopack.root` must contain `node_modules` **and** any shared source the app imports.
  Turbopack refuses to compile outside it, so in a monorepo pointing root at the app dir
  fails on both counts.
- `npm install file:…` symlinks by default and Turbopack will not resolve a **bundled**
  package through a link pointing outside the project root. Use `--install-links`, or stage
  real directories. Runner-side packages (`next` itself, `unplugin`) can stay linked.
