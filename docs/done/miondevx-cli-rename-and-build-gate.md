---
type: chore
spec: full-plan
status: done
created: 2026-09-02
---

# Rename `rtx` to `miondevx`, gate every command on a fresh engine, table-driven help

## Outcome

Shipped in five commits on `claude/build-deps-rtx-refactor-eht7x6`, as planned below, with four decisions the plan did not anticipate:

- **`release preflight` and `release all` are build-free at the gate**, not gated. Preflight opens with `pnpm run fresh-start`, a hard clean that wipes `bin/` and every dist, so a gate build would only be thrown away. Preflight builds the engine itself right after the clean, through `coreBuild(['all'])` instead of its old bare `go build` (which stamped `Version=dev` and guaranteed a rebuild on the next check).
- **An unknown command never builds.** The plan said "fail-safe: true". Since every dispatcher now looks its sub up in the registry before running it, an unregistered word can only reach the usage error, and building first would make a typo cost a link. The test interference this caused (the stamp test corrupting the stamp while another test spawned `release pacK`) is what surfaced it.
- **`check:builds` trusts the stamp.** `core build` grew a `--trust-stamp` flag, the gate's posture; the `check:builds` script uses it, so `pretest` / `prelint` / `pretypecheck` / `pretest:bun` / `precheck-types-examples` and `packages/run-types`' own `pretest` are stamp no-ops on a warm tree. A bare `pnpm miondevx core build` stays the authoritative build-id compare.
- **The bench area lists only the verbs `bench.mjs` actually accepts** (`clean` is its one build-free row); `bench build-image|login|push|pull` never existed behind `rtx` (the `BENCH_SUB` gate rejected them) and live under `container`. The bench leaves pass `trustStamp` to their own `ensureArtifacts` calls so the gate's check and theirs agree.

Measured on this host: a trusted engine check is ~250 ms end to end (`go` 117 ms, the two dists ~15 ms, the uws cache ~100 ms), a full help render stays under 100 columns, and the playground wasm digest is byte-identical to the one before the digest helper was shared.

## Problem

Three related problems in the repo's dev CLI ([scripts/rt.mjs](../../scripts/miondevx.mjs), run as `pnpm rtx <area> <command>`).

**1. The build check is per-command and full of holes.** `bin/mion` (the Go resolver) and `packages/devtools/dist` must be fresh before almost anything runs: vitest spawns the binary from the devtools plugin, eslint loads `devtools/dist/lint`, the website container mounts the built `.d.ts`, the `@mionjs/*` vite builds run the plugin. Today freshness is checked by `coreBuild(['all'])` ([scripts/core/build.mjs](../../scripts/core/build.mjs)), but only where someone remembered to call it:

- Calls it: `core fuzz|smoke|converted-suites|drizzle-translate`, `core test-batches` (run), `verify`, every `bench` verb via its own wrapper ([bench.mjs:76](../../scripts/website/bench-data/bench.mjs)), `pnpm test` / `pnpm lint` via the `pretest` / `prelint` hooks.
- Never calls it: the WHOLE `website` area (`dev`, `container-build`, `preview`, `check`, `test-counts`, `shell`; `website build` only gets it by accident through `bench prep`), the WHOLE `release` area (`e2e` packs `@mionjs/*` without checking `bin/mion`; `preflight.mjs:24` does a bare `go build` WITHOUT the version ldflags, so the next check throws that binary away), `core codegen`, `typecheck`, `check-types-examples`, `test:bun`, `packages/run-types` `pretest` (an unconditional devtools rebuild).
- CI papers over it with explicit `check:builds` steps, and the two `website container-build` jobs ([release-gate.yml:410](../../.github/workflows/release-gate.yml), [pr-heavy.yml:73](../../.github/workflows/pr-heavy.yml)) have no build step at all.
- Four leaf scripts carry their own existence-only gates with stale advice: [smoke.mjs:34](../../scripts/core/smoke.mjs) names `check:go-binary`, a script that no longer exists; [converted-suites.mjs:65](../../scripts/core/converted-suites.mjs) and [drizzle-translate.mjs:83](../../scripts/core/drizzle-translate.mjs) exit instead of building.

**2. The fresh path is not cheap enough to run everywhere.** `checkGo` ([build.mjs:114](../../scripts/core/build.mjs)) proves freshness by compiling a reference binary and comparing `go tool buildid`, every time. Correct, but a full link of the tsgo-sized binary on every `miondevx container pull` is why the gate was never made global.

**3. The name is from the old repo.** `rt` = RunTypes; the tool came over in the ts-run-types merge ([merge-ts-runtypes-into-mion-master-plan.md:78](merge-ts-runtypes-into-mion-master-plan.md)). It is the dev CLI of the mion monorepo now. 818 whole-word `rtx` hits across 187 files, plus 45 `scripts/rt.mjs` path hits, plus the name baked into Go emitters whose generated headers CI drift-gates. And the help text is hand-written prose: `HELP` and `RELEASE_HELP` strings ([rt.mjs:490-543](../../scripts/miondevx.mjs)) plus per-area `usage:` one-liners that already disagree with them (the `core` usage line and the `core` help block list different flags).

## Plan

Five commits, each with its own tests. Order matters: the rename first so every later diff already uses the new name.

### 1. Rename `rtx` to `miondevx`

- `git mv scripts/rt.mjs scripts/miondevx.mjs`. One constant at the top, `const CLI = 'miondevx'`, used by every message, the `die` prefix ([rt.mjs:54](../../scripts/miondevx.mjs)), the banner, and the usage errors. No other string carries the name.
- Root `package.json`: `"miondevx": "node scripts/miondevx.mjs"`; the four path scripts (`test:ci`, `check:builds`, `check:env`, `check:test-batches`) point at the new file. Remove the `rtx` script. `check:builds` keeps its NAME (CI and docs call it) and becomes `node scripts/miondevx.mjs core build`.
- Mechanical replace over the tree, case-sensitive whole word: `\brtx\b` to `miondevx`, `scripts/rt.mjs` and bare `rt.mjs` to `scripts/miondevx.mjs` / `miondevx.mjs`. EXCLUDE `node_modules`, `ts-go-runtypes/third_party`, `**/_deps`, `pnpm-lock.yaml`, `CHANGELOG.md`, `docs/done/**` (history stays as written). NEVER touch `rt$` (the marker prefix, 1,635 hits) or `tsrt-` (image names).
  Hot spots the replace must reach: [SETUP.md](../../SETUP.md) (87 hits, the command table at :109-123), [CLAUDE.md](../../CLAUDE.md) (`## The rtx CLI` section :209), [scripts/README.md](../../scripts/README.md) (7 relative markdown links `[rt.mjs](rt.mjs)` that break on the file move), [.env.sample](../../.env.sample) section headers, [.claude/skills/drizzle-slim-schemas/SKILL.md:3](../../.claude/skills/drizzle-slim-schemas/SKILL.md) (the `description:` frontmatter routes the skill), the `ts-runtypes-setup` skill + `setup.sh`, [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh), the ten workflow files under `.github/`, the container READMEs, [packages/uws/package.json:51](../../packages/uws/package.json).
- Generated files carry the name in their headers and CI drift-gates them. Edit the EMITTERS, then regenerate, never the outputs by hand: `ts-go-runtypes/cmd/gen-{plugin-keys,type-formats,run-type-kind,fn-hashes,builtin-purefns,drizzle-manifest}` and [scripts/core/gen-diagnostics-catalog.mjs](../../scripts/core/gen-diagnostics-catalog.mjs); then `pnpm miondevx core codegen all` and `pnpm miondevx core drizzle-manifest`; `--check` on both must be green.
- Fix the two pre-existing stale names found on the way: [scripts/env/check.mjs:8](../../scripts/env/check.mjs) still says `rt env push-image`; [smoke.mjs:34](../../scripts/core/smoke.mjs) points at the dead `check:go-binary` script.
- Update the five tests that pin the name: [repo-contracts.test.ts:299-335](../../packages/devtools/test/repo-contracts.test.ts) (spawns the file, asserts help text), [fuzz-lane-contracts.test.ts](../../packages/devtools/test/fuzz-lane-contracts.test.ts) (reads the file as a string AND asserts the workflow lines), [test-batch-contracts.test.ts:82-91](../../packages/devtools/test/test-batch-contracts.test.ts) (pins the exact `package.json` strings), [bench-lane-contracts.test.ts:441-458](../../packages/devtools/test/bench-lane-contracts.test.ts), [website-theme-contracts.test.ts:184](../../packages/devtools/test/website-theme-contracts.test.ts).

### 2. One command table: help, usage errors, and the build gate

Replace the hand-written `HELP` / `RELEASE_HELP` strings and the per-area `usage:` lines with one registry in a new `scripts/lib/devx-registry.mjs` (a plain module with no side effects, so tests can import it; the entry file keeps its top-level `loadEnv()` + `dispatch()`):

```js
export const AREAS = {
  core: {summary: 'the engine (Go resolver + TS marker/plugin)', commands: [
    {name: 'build', args: '[targets…]', summary: 'build the binary + dev dists if stale', build: false},
    {name: 'fuzz', args: '<suite…>', summary: 'run fuzz lanes (unit|value|types|…|all)',
      flags: [['--quick', 'the per-PR budget tier'], ['--soak', 'the release tier']]},
    {name: 'test-batches', summary: 'the batched whole vitest suite (what test:ci runs)',
      flags: [['--check', 'gate the batches against vitest.config.ts'], ['--list', 'print them']],
      build: (args) => !hasFlag(args, '--check', '--list')},
    …
  ]},
  website: {…}, bench: {…}, release: {…}, container: {…, build: false}, env: {…, build: false},
};
```

- `build` is the gate switch (step 4): `false` = never builds, a function = decided from the args, absent = builds. It sits in the SAME row as the help text so an exemption can never be added without a help line, and vice versa.
- `renderHelp()` (no area) prints the banner, then per area: the area name + summary, then ONE line per command, `name args` padded to the area's longest entry (cap 36 columns), summary after. No flags here, so the full listing stays a screen long.
- `renderHelp(area)` prints that area only, each command line followed by one indented line per flag:

```
core   the engine (Go resolver + TS marker/plugin)
  build [targets…]         build the binary + dev dists if stale
  fuzz <suite…>            run fuzz lanes (unit|value|types|…|all)
      --quick              the per-PR budget tier
      --soak               the release tier
  test-batches             the batched whole vitest suite (what test:ci runs)
      --check              gate the batches against vitest.config.ts
      --list               print them
```

  Summaries longer than the remaining width wrap onto a continuation line aligned to the summary column, so nothing exceeds 100 columns.
- `usage(area)` builds the `usage: miondevx core <build|smoke|…>` line from the row names, and every `die('usage: …')` in the area dispatchers calls it. Unknown command in any area: that usage line plus `run pnpm miondevx <area> --help`, exit 2 (today `core` exits 1, the rest 2; unify on 2).
- The area dispatchers look the sub up in the table BEFORE running it, so a command that is not in the table cannot be reached (the table IS the command list). `release` keeps its safety posture: bare `miondevx release` and `--help` print the release area help, the chain answers only to `all`, the `UMBRELLA_FLAGS` guard stays ([rt.mjs:424-457](../../scripts/miondevx.mjs)).
- `FUZZ`, `CODEGEN`, `BENCH_SUB` stay where they are in the entry file (three contract tests regex-parse them line-wise from that file).

### 3. A cheap "already fresh" path for the Go binary

`checkGo` keeps the reference-build + build-id compare as the authoritative check, but gets a fast pre-check so a gated command on a warm tree costs milliseconds, not a link:

- Generalise [scripts/website/playground-wasm-inputs.mjs](../../scripts/website/playground-wasm-inputs.mjs) into `scripts/lib/go-inputs.mjs`: `goInputsDigest(repoRoot, inputs)` (sha256 over path + bytes, `_test.go` and `testdata/` excluded, sorted, ~40 ms) and `readStamp` / `writeStamp`. The playground keeps its own input list and calls the shared function; its digest must stay byte-identical so the wasm cache does not invalidate.
- Resolver inputs: `ts-go-runtypes/cmd/mion`, `ts-go-runtypes/internal`, `go.mod`, `go.sum`, `go.work`, `go.work.sum`, PLUS the tsgolint identity the digest cannot see through the submodule: `headCommit()` and the patch files from [scripts/lib/tsgolint.mjs](../../scripts/lib/tsgolint.mjs), the ldflags string (`goVersionLdflags()`, so a version bump or tsgo re-pin invalidates), and `go version` (a toolchain bump invalidates).
- Stamp at `bin/.mion.stamp`, written after `checkGo` builds or verifies. `checkGo({trustStamp: true})`: bin exists and executable and the stamp matches the digest, print `OK bin/mion is up to date (stamp)` and return; otherwise the existing full path, then write the stamp. The stamp is git-ignored beside the binary and `clean.mjs` removes it with `bin/`.
- The gate (step 4) calls `coreBuild(['all'], {trustStamp: true})`. An explicit `miondevx core build` keeps doing the full build-id compare, so it remains the way to prove the binary against ANY edit, including a hand edit inside `third_party/` that no patch file records (off-limits per CLAUDE.md, but the authoritative check still catches it).
- `checkUws` spawns `node fetch-uws.mjs` on every call; import and call its function in-process instead if it exports one, otherwise leave it (sha256 of a cached file, cheap either way).

### 4. Gate every command in the entry point

- In `dispatch()` ([rt.mjs:550](../../scripts/miondevx.mjs)), after the help interception and before the area switch: `if (needsEngine(verb, rest)) coreBuild(['all'], {trustStamp: true})`. `needsEngine` reads the table from step 2: whole area `build: false` (`container`, `env`, `fmt`, `clean`, help), row `build: false`, row function, else true. Unknown area/command: true (fail-safe; the usage error follows anyway). Any `--help` / `-h` / `help` in argv skips the gate so a leaf's own `--help` (`release e2e --help`) stays instant.
- Exempt rows (`build: false`): `core build` (it IS the build and takes its own targets), `core fuzz-lanes`, `core drizzle-suites`, `core ensure-tsgolint`, `core bump-tsgolint` (re-pins first, then calls `coreBuild(['go'])` itself; building before the re-pin would build the OLD pin), `core drizzle-manifest` (`go run`, no binary), `core test-batches --check|--list` (function), `website check --static` (serves a built artifact) and `website shell`, `bench clean|build-image|login|push|pull` and `bench servers build-image|push|pull|clean`, `release bump|unpublish|stage-approve|verify-live|tarballs|npm|manual-publish|check-drizzle-versions|binaries|pack`. `release tarballs` MUST stay exempt: [publish.yml:171](../../.github/workflows/publish.yml) runs it in a deliberately pnpm-free job with no Go toolchain.
- Gated (default): everything else, notably the whole `website` area, `release preflight|dists|website|e2e|drizzle-e2e|all`, `core codegen`, and all `bench` verbs (their own `ensureArtifacts` calls stay because they add `linux-go` / `linux-extract`; the second call is a stamp no-op).
- Remove the now-redundant `ensureBuilt()` calls from the area dispatchers ([rt.mjs:242,251,264,285,289,566](../../scripts/miondevx.mjs)) and the bare `go build` in [preflight.mjs:24-26](../../scripts/release/preflight.mjs) (the gate builds it WITH the ldflags before preflight starts).
- Leaf scripts that only checked existence now trust the gate: drop the exit-on-missing blocks in [converted-suites.mjs:65](../../scripts/core/converted-suites.mjs), [drizzle-translate.mjs:83](../../scripts/core/drizzle-translate.mjs), [smoke.mjs:34-39](../../scripts/core/smoke.mjs) (they are only reachable through the gated entry; keep a one-line `fail` naming `pnpm miondevx core build` for someone running the file directly).
- Package scripts get the same guarantee: root `pretest` and `prelint` stay `pnpm run check:builds`; add `pretypecheck`, `pretest:bun` and `precheck-types-examples` with the same value (each is a stamp no-op inside `lint`, which already built). [packages/run-types/package.json:94](../../packages/run-types/package.json) `pretest` changes from the unconditional `pnpm --filter @mionjs/devtools run build` to `node ../../scripts/miondevx.mjs core build`.
- CI: rename only. The explicit `check:builds` steps STAY (they keep a build failure separate from a test failure, as their comments say). The two `website container-build` jobs need no new step, the gate covers them now.

### 5. Docs

See the Docs section.

## Tests

All Vitest, under [packages/devtools/test/](../../packages/devtools/test/) next to the existing repo-contract tests. No marker API is touched, so the Marker test coverage rule does not apply. No Go changes beyond the emitter strings, which `codegen --check` covers.

- **`devx-registry.test.ts`** (new): imports `scripts/lib/devx-registry.mjs`. Every row has a non-empty `summary`; every flag starts with `--`; `needsEngine` truth table: `core fuzz-lanes` false, `core test-batches --check` false, `core test-batches` true, `website dev` true, `website check --static` false, `release tarballs` false, `release e2e` true, `container pull` false, `env` false, `core bogus` true (fail-safe). `renderHelp()` contains every area and command name and no flag lines; `renderHelp('core')` contains every core flag, one per line, indented deeper than its command; no rendered line exceeds 100 columns.
- **`repo-contracts.test.ts`** (extend): spawn `miondevx --help` and each `miondevx <area> --help`, exit 0; `miondevx core bogus` exit 2 with the table-built usage line on stderr; root `package.json` has `miondevx` and no `rtx` script; `pretest`, `prelint`, `pretypecheck`, `pretest:bun`, `precheck-types-examples` all equal `pnpm run check:builds`; `check:builds` equals `node scripts/miondevx.mjs core build`; a whole-word `rtx` grep over `scripts/`, `.github/`, `.claude/`, `package.json`, `CLAUDE.md`, `SETUP.md`, `.env.sample` returns nothing (the same shape as the env registry check).
- **`go-inputs.test.ts`** (new): the digest is deterministic across two calls; `_test.go` and `testdata/` paths are excluded; the playground's digest equals the one `playground-wasm-inputs.mjs` produced before the refactor (pin the function, not a value); stamp read/write round trip in a temp dir, a missing stamp reads as empty.
- **`build-gate.test.ts`** (new, needs the bootstrapped host like every plugin test): after `node scripts/miondevx.mjs core build go`, a second `coreBuild(['go'], {trustStamp: true})` prints the `(stamp)` line and leaves no `.rt-build-ref-*` temp file (no reference build ran); appending a comment to a copy of a `.go` input in a temp checkout is out of reach, so instead assert that changing the stamp file's content makes the next trusted call take the full path (the `Verifying bin/mion matches current source` line).
- The five renamed contract tests keep passing; `fuzz-lane-contracts` in particular must still find the `FUZZ` rows in the moved file and the `node scripts/miondevx.mjs core fuzz-lanes` line in the workflows.

## Docs

Internal docs only; the public site content ([container/website/sites/](../../container/website/sites/)) has zero hits and stays untouched.

- [CLAUDE.md](../../CLAUDE.md) `## The rtx CLI` becomes `## The miondevx CLI`: new name, and the two new rules in one line each: every command builds the engine first unless its registry row says `build: false`; adding a command means adding a registry row (help, usage and the gate come from it).
- [SETUP.md](../../SETUP.md) command table and prose; [scripts/README.md](../../scripts/README.md) (dispatch description at :50-60 and the links); [docs/FUZZING.md](../FUZZING.md), [docs/WEBSITE-DOCGEN.md](../WEBSITE-DOCGEN.md); [container/website/CLAUDE.md](../../container/website/CLAUDE.md), [container/website/CONTAINER.md](../../container/website/CONTAINER.md), the benchmark / mion-bench / drizzle-e2e READMEs; the five `.claude/skills` that quote commands; [.env.sample](../../.env.sample) section headers.
- [.claude/skills/create-todo/SKILL.md:89](../../.claude/skills/create-todo/SKILL.md) points at two exemplar todos that no longer exist (`seeded-mock-data.md`, `union-validate-dedup-object-guard.md`); point it at [first-unified-release.md](../todos/first-unified-release.md) and [docs/done/unified-type-dependency-invalidation.md](unified-type-dependency-invalidation.md) instead.

## Out of scope

- Keeping an `rtx` alias. One name.
- [website/site.mjs:140-148](../../scripts/website/site.mjs) `ensureMionDists`: the unconditional `pnpm --filter @mionjs/* run build` for the mion site. It builds ALL `@mionjs/*` dists, not the two the gate owns; a staleness gate for those is its own change. The entry gate now guarantees `bin/mion` + the devtools dist BEFORE it runs, which is what those builds need.
- The tarball / platform-binary staleness logic in [release/e2e.mjs](../../scripts/release/e2e.mjs) and [release/drizzle-e2e.mjs](../../scripts/release/drizzle-e2e.mjs). They gate release artifacts, not the engine.
- Removing the explicit `check:builds` steps from the workflows.
- A vitest `globalSetup` build for bare `pnpm exec vitest`: impossible, the devtools plugin spawns the binary from `configResolved`, before any globalSetup ([vitest.config.ts:13-18](../../vitest.config.ts)).
- Rewriting the fuzz / codegen / bench tables into the registry (three tests parse them from the entry file line-wise).

## Done when

- `pnpm miondevx --help` and every `pnpm miondevx <area> --help` exit 0 in the new layout; `pnpm rtx` no longer exists; `pnpm miondevx core bogus` prints the table-built usage and exits 2.
- On a fresh clone with deps installed, `pnpm miondevx website container-build --site both` builds `bin/mion` and both dists before the container starts; `pnpm miondevx container pull` and `pnpm miondevx release tarballs` run no build at all.
- After one `pnpm miondevx core build`, any gated command's pre-step prints `bin/mion is up to date (stamp)` and finishes in well under a second on a warm tree; editing a `.go` file under `ts-go-runtypes/internal/` (or `packages/devtools/src/`) makes the next gated command rebuild that artifact.
- `git grep -w rtx` over the tree, minus `docs/done/`, `CHANGELOG.md`, `third_party/`, `_deps/` and `node_modules/`, returns nothing; `rt$` and `tsrt-` counts unchanged.
- `pnpm miondevx core codegen all --check`, `pnpm miondevx core drizzle-manifest --check`, `pnpm run lint`, `pnpm run check-format`, `pnpm test` and `go -C ts-go-runtypes test ./internal/...` all green; CI green on the PR, including the two website-build jobs that had no build step.
