# The Next.js / Turbopack adapter

- Only adapter reaching a bundler **without a plugin**: Turbopack has no plugin API, runs no webpack plugins.
  → unplugin cannot support it ([unjs/unplugin#302](https://github.com/unjs/unplugin/issues/302)).
- Turbopack DOES run webpack-style **loaders**, declared in `turbopack.rules`.
- [`index.ts`](./index.ts) (`withRunTypes` + composable pieces) starts a [`broker.ts`](./broker.ts) from `next.config`.
- [`loader.ts`](./loader.ts) runs in each Turbopack worker, asks the broker to rewrite one file over a socket
  ([`wire.ts`](./wire.ts)).
- Loader owns no resolver, runs no `buildStart`.
- `MION_NEXT_DEBUG=1` traces the broker (election, buildStart, absorbed edit batches, stamp changes).
  No plugin log here, so a misbehaving dev loop is otherwise opaque.

## ⚠️ There is deliberately NO `next build` test in the vitest suite

- Never "fix" that by adding one. `next` is ~202 MB, **not** a workspace dependency.
  → a vitest test would be skipped on every dev machine and in CI: never runs, worse than no test.
- Real `next build` coverage = e2e container (`container/pre-publish-e2e/`), where Next **is** installed:
  - [`apps/smoke-next/`](../../../../../container/pre-publish-e2e/apps/smoke-next/):
    the app. Page prerenders shared `selfCheck()` → passing build proves the rewrite survived Turbopack
    **and** the transformed code ran.
  - [`build-all.mjs`](../../../../../container/pre-publish-e2e/build-all.mjs):
    `smoke-next` entry + its `buildNext` driver (out-of-process, like the bun apps).
  - [`test/build-outputs.test.mjs`](../../../../../container/pre-publish-e2e/test/build-outputs.test.mjs):
    assertions, read from the prerendered HTML.
- Broker/loader logic testable without Next → [`../../../test/next-broker.test.ts`](../../../test/next-broker.test.ts).
- Needs a real Turbopack build → the e2e app. A change here needs BOTH.

## ⚠️ Invariants that look like cleanups and are not

Each was a real failure before it was a rule. Tests cite them by number: keep the numbering.

1. **Socket key includes the process id** (`socketPathFor`).
   - Root-only key = global rendezvous any process evaluating `next.config` can claim.
   - Incl. Next's detached telemetry flush: loads config, outlives dev server, reparented to init.
   - Later run joins THAT resolver → every file fails with `source file not in program` from a Program of a
     build that ended minutes ago. Silent about the cause.
2. **Connections accepted BEFORE `buildStart` finishes**, each request waits on a readiness promise.
   - Handler attached afterwards → connections during startup dropped silently (EventEmitter discards events
     with no listener) → worker hangs forever.
3. **`setSources` must receive the WHOLE overlay.** Lives in the shared `rtHotUpdate` leaf
   ([`src/core/unplugin.ts`](../../core/unplugin.ts)), but this adapter makes it load bearing.
   - `setSources` REPLACES the overlay, rebuilds the Program against exactly what it gets.
   - Pushing only edited files collapses the Program → next `generate()` deletes every other entry's module
     from disk (measured: 62 modules → 2 on one two-file edit, then ~180 unresolvable imports).
   - Vite survives by re-transforming lazily. Turbopack resolves the whole graph eagerly and fails.
4. **Broker watches the source tree itself.** Turbopack gives loaders no update callback.
   - Absorbing edits one loader call at a time regenerates the module set once PER FILE; a file resolved
     during one of those rewrites fails on a module that exists moments later.
   - One batch per edit = one regenerate.
5. **`./runtypes/next/loader` exports a `default` condition, not `import`** (see package `exports`).
   - Turbopack resolves loader specifiers with CJS `require` conditions → `import`-only entry is invisible.
   - Symptom: build dies with `Package subpath './runtypes/next/loader' is not defined by "exports"`.
6. **Loader options cross into the worker as plain JSON.** No functions.
   - So `onPureFnReport` cannot go through the rules → set on the broker (runs in the `next.config` process).
7. **Loader must declare type deps** (`addDependency`): **`reply.typeDeps` AND `reply.stamp`, both, every time**.
   - Turbopack knows only the import graph, cannot see a rewrite depends on a type declared elsewhere.
   - `typeDeps` = files that declare the reflected types → a type edit re-runs only files reflecting it.
   - Source: resolver (`TransformResult.typeDeps`) → shared transform hook's `addWatchFile` → collected by
     broker's plugin context. Same mechanism as every bundler host, so this lane cannot drift.
   - **Empty `typeDeps` = UNKNOWN, not "no dependencies"** (unattributed type, or older resolver on the socket).
   - Stamp = coarse fallback: one path every rewritten file declares → any type change re-runs all.
   - Dropping it because "typeDeps covers it now" turns an unknown into a silently stale rewrite.
   - Verified by A/B on an AMBIENT type (in a `.d.ts`, no import edge). Stamp removed, before typeDeps:
     `next dev` kept a cached rewrite importing a just-pruned module → 500 with
     `Can't resolve ../.mion/types/<hash>.js`. With stamp: clean re-transform, zero resolve errors.
   - Asymmetry, easy to test the wrong lane and call the stamp dead code: **`next build` re-runs loaders on
     every build** → picks up type changes even with stamp disabled (confirmed vs persistent build cache,
     imported and ambient type).
   - Stamp = belt-and-braces for builds, load bearing for dev. Test in **dev**, with a type with no import edge.
8. **Broker syncs the pure-fn artifact dir itself, twice.**
   - Other hosts put `mion-pure-fns/` next to the bundle from a post-bundle hook. Turbopack has none.
   - Broker syncs into Next's `distDir` (`artifactDir`, derived by `withRunTypes`): once `buildStart` is done
     AND again on the first loader request.
   - Second write is not redundant: Turbopack empties `distDir` between loading config and first loader run.
   - Best effort by design: a Next app is never installed as a package. Lanes that matter: library bundlers
     and `mion compile`.

## Gotchas when testing by hand

- `turbopack.root` must contain `node_modules` **and** any shared source the app imports.
  Turbopack refuses to compile outside it → in a monorepo, root = app dir fails on both counts.
- `npm install file:…` symlinks by default. Turbopack will not resolve a **bundled** package through a link
  pointing outside the project root → use `--install-links`, or stage real directories.
- Runner-side packages (`next` itself, `unplugin`) can stay linked.
