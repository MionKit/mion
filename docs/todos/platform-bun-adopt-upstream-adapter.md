# platform-bun: collapse the local Bun shims onto `@ts-runtypes/devtools/bun`

**Status:** todo — **DRY-RUN VERIFIED** (2026-08-21), blocked on an upstream release only.
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


## Dry-run result (2026-08-21) — plan correct, and it fixes a bug mion has TODAY

Applied against a locally packed upstream build and reverted afterwards. `runtypes-loader.ts`
collapses to a ~10-line wrapper over `@ts-runtypes/devtools/bun`, both local shims deleted, and
`bun-preload.ts` needs no change. `pnpm run test:bun`: 12 pass / 0 fail.

**The `bun run` hang is real and reproducible right now.** A mion server started with
`bun --preload ./bun-preload.ts server.ts` serves requests correctly, stops its server, and then
never exits: the resolver child process keeps the event loop alive and nothing closes it, because
the runtime plugin host gets no `buildEnd`. Measured with a minimal server:

| loader | exit |
| --- | --- |
| mion's own shims (today) | **124 — hung, killed by timeout** |
| upstream adapter | **0** |

`bun test` hides this because the test runner force-exits the process, which is why the lane has
looked healthy. Anyone running a mion API on Bun in production would see the process refuse to
shut down. Upstream's `detachResolver` unrefs the child so the host exits when its own work is
done, and the resolver still dies on its own (losing the parent closes its stdin, and the Go serve
loop exits on EOF).

That moves this spec from "cleanliness" to "fixes a shutdown bug" — worth doing promptly once the
release lands, not whenever.

## Overlay recipe (how the dry-run was done)

To test an unreleased `@ts-runtypes/*` against mion without touching `package.json` or the
lockfile:

```bash
# in ts-run-types
node scripts/core/build.mjs
(cd packages/ts-runtypes        && pnpm pack --pack-destination ../../tarballs)
(cd packages/ts-runtypes-devtools && pnpm pack --pack-destination ../../tarballs)

# in mion — rm -rf FIRST, never copy over: node_modules files are HARDLINKED to the
# pnpm store (nodeLinker: hoisted), so writing in place corrupts the store for every
# project on the machine. Check with `stat -c %h <file>`: 1 means detached.
tar -xzf <ts-run-types>/tarballs/ts-runtypes-core-*.tgz -C /tmp/ovl/core
rm -rf node_modules/@ts-runtypes/core && mv /tmp/ovl/core/package node_modules/@ts-runtypes/core
#   ... same for devtools ...
pnpm --filter @mionjs/devtools run build       # it reads devtools' dist .d.ts

# the Go resolver needs no file surgery — @ts-runtypes/bin honours RT_BIN
RT_BIN=<ts-run-types>/bin/ts-runtypes pnpm run test:ci

# undo everything
pnpm install --frozen-lockfile
```

Two gotchas that cost time: the local binary's version must match the installed one
(`ts-runtypes --version` on both) because it is folded into every typeId; and RT diagnostics are
cached per package under `node_modules/.cache/ts-runtypes`, so clear it before comparing warning
counts or a warm cache will silently give you different numbers.

## Done when

- `loader/runtypes-loader.ts` carries no `build.onStart` / `onLoad` shim of its own.
- The bun CI step is green on the upstream adapter.
