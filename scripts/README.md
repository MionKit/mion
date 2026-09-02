# scripts/

Internal dev/build/publish tooling for the mion monorepo. **Not** a public CLI — this directory exists for maintainers.

Everything here is reached through a single front door: the `miondevx` dispatcher at [miondevx.mjs](miondevx.mjs), exposed as the root package.json script `miondevx`. Run it from the repo root as:

```
pnpm miondevx <area> <command> [flags…]
```

To see the full command list, run `pnpm miondevx` (no args): one line per command. `pnpm miondevx <area> --help` adds one indented line per flag.

## Why one CLI

Before `miondevx`, the workflows lived as loose `scripts/*.sh` files and per-package `package.json` entries. They drifted from CI, duplicated env loading, and made it hard to answer "how do I run the fuzzer / bench / release?" without grepping. `miondevx` is a zero-dep Node ESM dispatcher that:

- **Sits over the same underlying scripts and tools CI runs** (`go`, `podman`, `pnpm`, `vitest`, `git`, `npm`) — never a reimplementation, so it cannot drift.
- **Loads env exactly once** (`loadEnv()` in [lib/env.mjs](lib/env.mjs), called at the entry point), then hands a populated `process.env` to every area module.
- **Builds the resolver + dev dists first**, in the entry point, for every command that needs them (see *The build gate* below), replacing the per-script `check:builds` pre-hooks.
- **Handles failures uniformly.** Leaves throw `CliError` (never `process.exit`); [miondevx.mjs](miondevx.mjs) catches, prints, and sets `process.exitCode`.

## Areas

Each area is a subdirectory under `scripts/` plus a dispatch case in [miondevx.mjs](miondevx.mjs):

| Area        | Directory                  | Purpose                                                                  |
| ----------- | -------------------------- | ------------------------------------------------------------------------ |
| `core`      | [core/](core/)             | Go resolver + TS marker/plugin: build, smoke, fuzz, codegen, tsgolint    |
| `website`   | [website/](website/)       | Docs site (Nuxt + Docus): dev server, build, preview, container         |
| `bench`     | [website/bench-data/](website/bench-data/) | Benchmarks (audit / typecost / compiletime / serialization / smoke)       |
| `release`   | [release/](release/)       | npm publish pipeline (preflight → publish → website → CI deploy)         |
| `container` | [container/](container/)   | Podman image lifecycle (tsrt-website + tsrt-e2e): build / push / pull    |
| `env`       | [env/](env/)               | `.env` registry check + one-shot secret pushers                          |
| `lib`       | [lib/](lib/)               | Shared helpers: the command registry, env loading, spawn wrappers, CliError, the Go input digest, podman helpers… |

Top-level aliases (no area prefix): `verify`, `fmt`, `clean` — see `pnpm miondevx` for details.

## How dispatch works

[miondevx.mjs](miondevx.mjs) is the ONLY entry point. Roughly:

```
loadEnv();                        // once, from repo-root .env (dev only)
try {
  await dispatch(process.argv.slice(2));
} catch (err) {
  reportCliError(err);            // prints message, sets process.exitCode
}
```

`dispatch()` reads the first arg as the area, then delegates:

- **In-process leaves** (`website`, `bench`, `container`, `env`, and `core build`) are `await import(...)`ed and their `main()` is called. Dynamic import defers evaluation until AFTER `loadEnv()`, so the leaf sees a populated env.
- **Child-process leaves** (`core smoke`, `core codegen`, `release *`, most tool wrappers) are spawned via `proxy()` with `stdio: 'inherit'`. A non-zero exit throws `CliError` code-only (the child already printed).

Some commands run a pipeline via `steps([[cmd, args, env?], …])` — the first non-zero exit short-circuits.

### The build gate

`dispatch()` runs `coreBuild(['all'], {trustStamp: true})` before the area switch for every command whose registry row does not opt out, so `bin/mion`, the marker dist and the `@mionjs/devtools` dist are current before anything spawns or imports them. The gate is decided by [lib/devx-registry.mjs](lib/devx-registry.mjs) (`needsEngine`): a row's `build: false` (or a function of the args, as for `test-batches --check`) keeps a command build-free; help never builds; an unregistered word never builds either, because every dispatcher refuses it with the usage line.

On a warm tree the gate is cheap: [core/build.mjs](core/build.mjs) stamps `bin/.mion.stamp` with a content digest of the resolver's inputs ([lib/go-inputs.mjs](lib/go-inputs.mjs): `cmd/mion` + `internal` + the go module files, plus the tsgolint commit and patch state, the ldflags and the Go version) and, when trusting, skips the reference build if the stamp matches (~100 ms). A bare `pnpm miondevx core build` never trusts the stamp and stays the authoritative build-id compare. The package hooks (`pretest`, `prelint`, `pretypecheck`, `pretest:bun`, `precheck-types-examples`) run `check:builds`, which is the trusted form.

## Environment loading

`.env` is dev-only, git-ignored, loaded ONCE by [lib/env.mjs](lib/env.mjs)'s `loadEnv()`. Skipped when `CI` is set. `process.loadEnvFile` does NOT override an already-set var, so real inline env or CI env always wins.

The **env-var registry** in [lib/env.mjs](lib/env.mjs) (`REGISTRY`) is the single source of truth for every env var the project consumes. `pnpm run check:env` prints it. Any new env var a script / container / CI step / test reads MUST be added there — the registry is the contract (see the root [CLAUDE.md](../CLAUDE.md) → *Environment variables*).

## Conventions

- **Zero dependencies.** Node built-ins only. `miondevx.mjs` and every area module.
- **No `process.exit` in leaves.** Throw `CliError(msg, code)` via `die()` from [lib/proc.mjs](lib/proc.mjs). The top-level handler prints and sets the exit code.
- **Prefixed error messages.** Match the shell-era convention: `'core build: …'`, `'bench: …'`, `'release preflight: …'`.
- **Prefer `pnpm` scripts over raw `pnpm exec <cmd>`** when a script exists — keeps CI and local invocations identical.
- **`miondevx` never reimplements a workflow.** It calls the same `scripts/*.mjs` / `pnpm` scripts / `vitest` configs CI does.

## Adding a new command

1. Add the implementation as a module under the area directory (e.g. [core/new-thing.mjs](core/)). Export a `main(argv)` function. Fail via `die()` from [lib/proc.mjs](lib/proc.mjs), never `process.exit`.
2. Add its row to `AREAS` in [lib/devx-registry.mjs](lib/devx-registry.mjs): `name`, `summary`, its `flags`, and `build: false` if it does not need the engine. That one row is the help line, the usage entry and the gate decision; `test/devx-registry.test.ts` checks every `sub === '…'` in the dispatcher has a row and vice versa.
3. Wire it into `runCore` / `runWebsite` / … in [miondevx.mjs](miondevx.mjs). Prefer dynamic `import()` for in-process leaves (so `loadEnv` runs first); use `proxy(...)` if it's a child-process wrapper.
4. If it reads a new env var, add it to `REGISTRY` in [lib/env.mjs](lib/env.mjs) with the correct scope (`secret` | `dev` | `internal`), and mirror the `secret` / `dev` rows into [.env.sample](../.env.sample) — `pnpm run check:env` enforces that mirror (it exits 1 on a missing row, an `internal` var listed there, or an unregistered key), and CI runs it in the `js-lint` job.

## Related

- Root [CLAUDE.md](../CLAUDE.md) → *Development workflow* section describes the miondevx CLI from a maintainer's perspective.
- [SETUP.md](../SETUP.md) has the full host bootstrap + build / test / publish reference.
- The [mion-setup skill](../.claude/skills/ts-runtypes-setup/) drives the end-to-end host bootstrap automatically.
