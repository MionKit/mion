# Scripts and the `miondevx` CLI

Dev commands for the repo. Read before running or adding one. Full detail: [README.md](README.md).

## `miondevx`

- [miondevx.mjs](miondevx.mjs) runs every command in this repo: dev, tests, website, benchmarks, containers, release.
- `pnpm miondevx <area> <command>`. List: `pnpm miondevx --help`.
  Areas: core, website, bench, container, env, release, card.
- Zero-dep dispatcher over the same `scripts/*.sh` / `*.mjs` / `vitest` the workflows call, never a
  reimplementation → cannot drift from CI.
- CI-literal aliases (`check:builds`, `check-format`, `lint`, `test`, `build`) stay as-is. `miondevx` sits above them.

```bash
pnpm miondevx core fuzz <suite>
pnpm miondevx core codegen all --check
pnpm miondevx website dev
pnpm miondevx bench
pnpm miondevx verify
pnpm miondevx fmt
pnpm miondevx release all
```

## Every command builds the engine first

- Entry point builds or verifies `mion-bin/mion` + the marker and devtools dists before any command whose registry
  row does not say `build: false` (help, `container`, `env`, `fmt`, `clean`, the npm-side release steps).
- Warm tree: a content stamp (`mion-bin/.mion.stamp`, ~250 ms).
  Bare `pnpm miondevx core build` = authoritative build-id compare, never trusts the stamp.
- `pretest` / `prelint` / `pretypecheck` hooks run the same trusted check (`check:builds`).
- Adding a command → add a registry row in [devx-registry.mjs](lib/devx-registry.mjs).
  Help (`miondevx --help`, `miondevx <area> --help` or bare `miondevx <area>` adds flags), usage errors and the
  build gate all render from that one table. A dispatcher refuses any word with no row.

## Clean

- `pnpm run clean` ([clean.mjs](core/clean.mjs)): HARD clean (dists, `bin/`, tool caches, run artifacts,
  every `node_modules`).
- `--dry-run` first: lists without deleting. Drops costly playground WASM + benchmark data.
  `--keep-deps` keeps the install. `pnpm run fresh-start` = clean + reinstall.
- `pnpm --filter <pkg> run clean` wipes just one package's dist.

## `tools/`

- [tools/](../tools/): private dev tools with their own deps, outside `packages/` → no CI lane, root test run or
  root lint touches them.
- [tools/code-card/](../tools/code-card/) renders `.vue` cards to a shareable PNG or the website: `pnpm miondevx card`,
  own checks `pnpm miondevx card test`. Agents use the [card skill](../.agents/skills/card/).
