---
type: fix
spec: guidelines
status: done
created: 2026-10-04
---

# The validation bench mion lane runs a TypeScript below the devtools floor

## Intent

`container/benchmarks/_deps/competitors/mion/package.json` asks for `"typescript": "^5.6.0"`, which the `tsrt-website` image resolves to 5.9.3. `@mionjs/devtools` supports TypeScript 6.0.0 and up, so every mion lane build warns:

    @mionjs/devtools: TypeScript 5.9.3 is below the supported floor of 6.0.0. Type resolution uses this package's own compiler, so builds keep working, but your tsconfig may be read differently than your editor reads it.

Repro: `pnpm miondevx container login && pnpm miondevx bench compiletime` (the mion lane prints it during warm-up). The published numbers should come from a supported setup, the same way `container/mion-bench/_deps/mion` already pins `typescript: 6.0.3`.

## Direction

- Bump the mion lane's `typescript` to an exact 6.x pin (match `container/mion-bench/_deps/mion`). Check whether other lanes that run the mion plugin share the pin; the zod / typebox / ajv lanes do not load the plugin and only matter if a script resolves TypeScript from them.
- The `_deps` change moves the image deps-hash, so rebuild, verify, and push `tsrt-website` (see the Containers section of CLAUDE.md for the mirror, host-network and arm64 knobs).
- Re-run `pnpm miondevx bench compiletime` and the validation bench lanes: no floor warning, numbers still written.

## Docs

None, contributor bench setup.

## Done when

- The mion lane builds with no TypeScript floor warning.
- The pushed image matches the tree's deps-hash.

## Plan (approved 2026-10-04, automatic mode)

- Pin `typescript` to `6.0.3` in `container/benchmarks/_deps/competitors/mion/package.json`, the same pin as `container/mion-bench/_deps/mion` and `_deps/typecost`.
- Leave zod / typebox / ajv on 5.x: they never load the plugin, and `compiletime.mjs` resolves TypeScript from the running lane first, then mion, so the mion lane now reads 6.0.3.
- Rebuild, verify and push `tsrt-website`, then run `pnpm miondevx bench compiletime` and check the warning is gone.
- No docs, no fuzzing.

## What shipped

- The mion lane pins `typescript` to `6.0.3`. The other lanes keep 5.x: none loads the plugin, and `compiletime.mjs` reads TypeScript from the running lane first, so the mion lane now gets 6.0.3.
- `bench-lane-contracts.test.ts` checks that both bench lanes that load the devtools plugin pin an exact TypeScript at or above the devtools floor, so a lane cannot drift back.
- `tsrt-website` rebuilt from this tree and pushed for amd64 and arm64.
- Checked in the rebuilt image: `bench compiletime` (with the separate parse fix for that script laid over the tree) shows no floor warning and writes both results; `bench --one mion --quick` and `bench typecheck` pass.
