---
type: fix
spec: guidelines
status: ready
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
- No code test (a container manifest pin), no docs, no fuzzing.
