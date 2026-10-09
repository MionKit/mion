# Tests, typecheck, lint

How to run and add JS + Go checks. Read before adding, running or reporting tests.

## Run tests

- JS = **Vitest** (root [vitest.config.ts](../../vitest.config.ts)). Files `.spec.ts` / `.test.ts` in each package's
  `test/` dir, mirroring `src/`, never beside the code (pinned by `repo-contracts.test.ts`).
- All JS: `pnpm test` (all 23 vitest projects). Single file: `pnpm exec vitest run <pattern>`.
  Single package: `pnpm --filter <name> test`.
- Go: `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- `pnpm test` needs a bootstrapped host: plugin tests spawn `mion-bin/mion`. Needs the
  [third_party/](../../ts-go-runtypes/third_party/) submodules + patches, Go resolver built, `@mionjs/devtools` dist.
- `pnpm run pretest` ([build.mjs](../../scripts/core/build.mjs)) rebuilds all that.
  Fresh clone or host missing Go / pnpm → [setup skill](../skills/ts-runtypes-setup/) first.
- Stale `@mionjs/devtools` dist breaks typecheck + root lint too:
  [devtools/AGENTS.md](../../packages/devtools/AGENTS.md). `pnpm run check:builds` covers it when stale.

## Run less

- Only what a branch touched: `pnpm miondevx core test-pr [--base <ref>] [--list]`
  ([test-pr.mjs](../../scripts/core/test-pr.mjs)): changed packages + dependents, from the committed diff.
  CI's JS suite runs it on PRs, saves a narrower `js-pr` green marker a push to `main` never accepts.
- Only files whose inputs changed since they last passed: `pnpm miondevx core test-skip`
  ([test-skip.mjs](../../scripts/core/test-skip.mjs)), or `test-pr --skip-passed`.
- A file that starts a process, touches the file system or runs TypeScript / a bundler always runs,
  unless the module doing it is listed in `DECLARED` there with everything it reads.
  Adding such a helper → declare its inputs, or its files never skip.
- CI: PRs skip what the cached list proved. `main` runs `--audit`: runs everything, fails when a file the list
  would have skipped fails.

## Batches and bun

- One full run OOMs → `pnpm run test:ci`: SAME 23 projects in 7 batches, one vitest process each
  (resolver processes ~200 MB each).
- Batches live in [test-batches.mjs](../../scripts/core/test-batches.mjs), only GROUP the names `vitest.config.ts`
  declares. `pnpm run check:test-batches` (CI gate + the run's preflight) fails on a project in no batch or two.
  Adding a project → add it to a batch.
- `test:bun` runs platform-bun's bun:test suites (vitest cannot host them), all in ONE process.
  Build the router in a hook or test, NEVER in a describe body (else whole file skipped, run still says `0 fail`).
  Detail: [rpc-router/AGENTS.md](../../packages/rpc-router/AGENTS.md).
- [test-bun.mjs](../../scripts/core/test-bun.mjs) is what `test:bun` runs. Fails when a test file reported no tests.

## Typecheck

- `pnpm run typecheck` checks EVERY package. ONE config per package serves both check and editor.
- `tsconfig.json`: non-composite, `noEmit`, NO `references` → cross-package imports resolve through the `source`
  export condition, not a sibling's built declarations.
  (Fresh checkout has no dists: that is the TS6305 "has not been built from source file" wall.)
- `tsconfig.build.json` = emit half, ONLY place dist appears: re-enables `composite` / `incremental` / `outDir`.
  Its `references` name sibling BUILD configs (a reference target must be composite). Root tsconfig does the same.
- No package keeps a second config for checking. `run-types` builds with
  `mion compile --tsconfig tsconfig.build.json`, `devtools` with `tsc --build tsconfig.build.json`.
  `examples` emits nothing → no `tsconfig.build.json`.
- `pnpm -r` silently skips a package with no `typecheck:test` script. `pnpm run check:typecheck-coverage`
  ([typecheck-coverage.mjs](../../scripts/core/typecheck-coverage.mjs), typecheck preflight + CI gate) fails
  on a package without it, or a shipped file in no project. Adding a package → add that script.
- Root typecheck then runs `pnpm run check:tsgo` ([tsgo-check.mjs](../../scripts/core/tsgo-check.mjs)):
  `mion compile --no-emit` over the same projects. Bundled tsgo rejects some code tsc accepts
  (a write through `readonly || mutable`), and a consumer's `mion compile` build would hit it first.

## Lint

- oxlint covers every package with the `mion/*` rules. This repo raises `mion/warning` to an error.
- eslint runs them again only over the mion package dirs, test helpers included, turned off for spec files.
