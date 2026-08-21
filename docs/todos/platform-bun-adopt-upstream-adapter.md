# platform-bun: collapse the local Bun shims onto `@ts-runtypes/devtools/bun`

**Status:** todo — blocked on an upstream release.
**Type:** chore (delete local code once upstream ships)
**Created:** 2026-08-21 (split from
[../done/platform-bun-runtypes-lane.md](../done/platform-bun-runtypes-lane.md))

## Why

`loader/runtypes-loader.ts` hand-patches two gaps in unplugin's Bun context, which targets
`Bun.build` rather than the `Bun.plugin` runtime loader mion's preload uses:

1. the runtime plugin context has no `onStart` / `onEnd`, so the resolver's `buildStart` is
   never registered;
2. its `onLoad` rejects an `undefined` return, which the bundler treats as a default load.

Neither is mion-specific, and both are now fixed upstream in `@ts-runtypes/devtools/bun`
(branch `feature/devtools-bun-lane-and-diagnostics`). That entry also closes a third gap mion
works around by hand: `Bun.plugin()` does not await an async `setup`, so registration races
the resolver's startup. mion's `bun-preload.ts` handles that with an `await`; upstream gates
every load on the resolver being ready, which makes the keyword unnecessary and the failure
mode impossible.

Upstream additionally unrefs the resolver child on the runtime host (`detachResolver`), so a
`bun run` script exits instead of hanging on the live child. mion currently gets away without
that only because `bun test` force-exits the process — a plain `bun run` of a mion server
would hang at shutdown today.

## Fix plan

1. Upgrade `@ts-runtypes/devtools` to the release carrying `./bun`.
2. Replace the body of `loader/runtypes-loader.ts` with a thin wrapper over
   `@ts-runtypes/devtools/bun`, keeping mion's `RunTypesLoaderOptions` surface
   (`tsConfig` / `genDir` / `failOnError`) so `bun-preload.ts` and any consumer are unchanged.
   Delete both local shims and the `unplugin` import.
3. Keep the `await` in `bun-preload.ts`. It becomes belt-and-braces rather than load-bearing,
   and its comment should be updated to say so rather than removed — the reason it existed is
   worth not re-deriving.
4. Confirm `pnpm run test:bun` still reports `10 pass / 1 todo / 0 fail`, and additionally
   check a plain `bun run` of a mion server exits cleanly (the `detachResolver` behaviour that
   `bun test` masks).

## Done when

- `loader/runtypes-loader.ts` carries no `build.onStart` / `onLoad` shim of its own.
- The bun CI step is green on the upstream adapter.
