# Mion & RunTypes Guidelines

> ⚠️ **When replying to the user, talk in plain everyday language.** Avoid jargon and internal nicknames unless very basic. If a term or idea could be unclear, define it in one short sentence, and add a tiny code example when it helps. (This is about how you communicate, not how you write docs or code.)

> **Do not load linked / relevant files into context unless the current task strictly needs them** — [SETUP.md](SETUP.md) only for setup / build / publish work; skill dirs only when invoking them; deep-dive docs only when touching what they describe.

For setup, build, test, and publish workflows, see [SETUP.md](SETUP.md) — the single setup document. **To set up or repair a local dev environment (submodules + patches, `bin/ts-runtypes`, workspace deps, package dists), run the [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) — it drives the whole host bootstrap end-to-end. Don't hand-roll a bootstrap.** ([scripts/setup-claude-web.sh](scripts/setup-claude-web.sh) is the Linux web-container variant only — never for local/macOS; it hard-exits off Linux and redirects you to the skill.)

## ⚠️ THE RULE: a finding is FIXED now, not filed for later

**This is the rule broken most often, so it comes first.** Anything you discover while doing something else — a fuzzer finding, a soundness tripwire in test output, a latent bug a new test exposes, a doc-vs-code contradiction, a bug in code you were only reading — is **surfaced to the user in your reply** (what it is, where it came from, whether it predates your change; bisect if cheap), and then fixed NOW, in one of exactly two lanes:

- **Related to the current task → fix it in the SAME task and the SAME pull request**, with its own commit and its own test. Size buys no exemption — a big related finding means a bigger PR, not a later one.
- **Unrelated to the current task → hand it to a PARALLEL agent, never a backlog.** Open a Claude background session for it — via [agent view](https://code.claude.com/docs/en/agent-view) (`claude agents`) or an equivalent background session the user can peek at, reply to, and steer — so the fix proceeds in parallel while you continue the main task. That agent lands the finding on its own branch and its own PR, and **the finding's PR gets merged BEFORE the main task's PR** — the main PR waiting on it is the forcing function that keeps the parallel fix from stalling. When spawning a cloud session, ALWAYS open it in the **Mion cloud environment** (the environment named "Mion" — it carries the setup scripts for the mion + ts-runtypes toolchain) AND attach the repo (and branch) as the session source — that environment's setup script fails in a container with no checkout, so a bare session dies at init.
- **A [docs/todos/](docs/todos/) spec is a commitment to solve it, never a way to close the loop.** File one ONLY when the fix genuinely cannot land now in either lane (it needs an upstream release, or a decision only the user can make), and say plainly why, with the evidence and a concrete fix plan. Filing does not mean "immediately", but the work is still owed. A spec filed and then left is the exact failure this rule exists to prevent: a backlog nobody drains.
- **Blocked on a decision only the user can make? ASK, in the same session**, then carry out the answer.

**Absolute: never let a finding live only in chat, and never let one end up neither fixed, nor in flight with a parallel agent, nor genuinely tracked toward a fix.**

## Setup

- Go ≥ 1.26
- Node ≥ 26
- podman ≥ 4.0
- git
- pnpm ≥ 11 — never `npm install`; workspace policies live in `pnpm-workspace.yaml` (`.npmrc` is auth/registry only, everything else is silently ignored there).

## Repo structure

### JS monorepo (`packages/`)

One pnpm workspace holding BOTH families: the `@ts-runtypes/*` packages (the type system) and the `@mionjs/*` framework packages (which consume them via `workspace:*`). ⚠️ `@mionjs/*` is NOT on the release train yet — `publish-tarballs.mjs` filters to `ts-runtypes-*` until [docs/todos/merge-6-unify-release-train-and-ci.md](docs/todos/merge-6-unify-release-train-and-ci.md) unifies the versions. pnpm workspace, lockstep versioning ([version.json](version.json), bumped by [scripts/release/bump-version.mjs](scripts/release/bump-version.mjs)); all three published packages move together (`forcePublish: true`, `exact: true`), per-platform `@ts-runtypes/binary-<os>-<arch>` packages (their packed tarballs keep npm's unscoped `ts-runtypes-binary-*.tgz` filename) are assembled at publish time and pinned exact-equal by [scripts/release/build-binaries.mjs](scripts/release/build-binaries.mjs) / [scripts/release/publish.mjs](scripts/release/publish.mjs). All `dependencies` / `devDependencies` are exact-pinned (only `ts-runtypes-devtools` peerDeps stay as ranges so consumers can dedupe Vite); cross-package deps use the `workspace:*` protocol. All devDependencies live root-level, never per-package. Filter a package: `pnpm --filter @ts-runtypes/<name> run <cmd>`. Full policy list (frozenLockfile, minimumReleaseAge, ignoreScripts, allowNonRegistryProtocols, savePrefix, strictPeerDependencies, nodeLinker) + dep-update gotchas: [SETUP.md → pnpm policies](SETUP.md#pnpm-policies-workspace-security-posture).

- [ts-runtypes](packages/ts-runtypes/) — public marker + runtime helpers (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T,Fn>`, `getRunTypeId`, runtime family bodies).
- [ts-runtypes-devtools](packages/ts-runtypes-devtools/) — build-tool integration around the resolver. What it does:
  - **Transform** — rewrites `createX<T>()` call sites and injects the import block.
  - **Codegen** — emits per-entry cache modules under `<genDir>/types/`.
  - **Enrich** — scaffolds and keeps in sync the FriendlyText + MockData mirror files.
  - **Lint** — OXlint plugin (primary) + ESLint v9 adapter on the `./eslint` subpath; surfaces compiler diagnostics and forbids `@todo` / `@rtOrphan` in enrich files.
  - ⚠️ **Next.js / Turbopack** ([src/next/](packages/ts-runtypes-devtools/src/next/)) — the one adapter that reaches a bundler with NO plugin (Turbopack has no plugin API): a broker started from `next.config` plus a `turbopack.rules` loader. **Read [src/next/CLAUDE.md](packages/ts-runtypes-devtools/src/next/CLAUDE.md) before touching it** — it records the invariants that look like cleanups but are not, and why the only real `next build` coverage lives in the e2e container ([apps/smoke-next](container/pre-publish-e2e/apps/smoke-next/)) rather than in vitest.
- [ts-runtypes-bin](packages/ts-runtypes-bin/) — platform launcher; `getExePath()` resolves the prebuilt resolver binary from per-platform `@ts-runtypes/binary-<os>-<arch>` optional deps. NEVER add a postinstall downloader — `ignoreScripts: true` blocks it. The binary embeds `constants.Version` (folded into typeID hashes) + `constants.TsgoVersion` (pure metadata: `--version` + the launcher's `tsgo` field, NEVER in the hash).
- [examples](packages/examples/) — MERGED package of compilable TS example files (mion + runtypes) consumed by both docs sites' `<code-import>` blocks; mion's program is `tsconfig.json`/`tsconfig.check.json`, the runtypes examples are type-checked by `tsconfig.runtypes.json` (root `typecheck` runs both, so doc drift fails CI).

The mion framework packages (`@mionjs/*`):

- [core](packages/core/) — shared framework foundation (`RpcError`/`TypedError`, router metadata, binary body framing, the mion↔ts-runtypes reflection adapter under `src/runtypes/`).
- [router](packages/router/) — HTTP routing and request handling. [client](packages/client/) — client-side utilities.
- [devtools](packages/devtools/) (`@mionjs/devtools`) — Vite plugin (wraps `@ts-runtypes/devtools`) + ESLint plugin.
- [drizzle](packages/drizzle/) (`@mionjs/drizzle`) — drizzle-orm extension.
- `platform-aws|bun|cloudflare|gcloud|node|vercel` — platform adapters. [test-server](packages/test-server/) — private e2e fixture server.
- Every `@mionjs/*` dependency on `@ts-runtypes/*` is `workspace:*`, so the mion side builds against the sibling sources and spawns the locally built `bin/ts-runtypes` — **the mion tests need the Go toolchain**, exactly like the runtypes ones: bootstrap before running them.

**Published READMEs stay thin — a short description, the sibling relationship, and a link to [runtypes.pages.dev](https://runtypes.pages.dev/), plus the status/license lines.** No option tables, no usage walkthroughs, no env vars or dev-only knobs: the website is the one home for those, and a README that restates it drifts. Applies to the three package READMEs and the generated per-platform `@ts-runtypes/binary-*` one in [scripts/release/build-binaries.mjs](scripts/release/build-binaries.mjs); pinned by `repo-contracts.test.ts`. The root [README.md](README.md) is the GitHub landing page, not an npm page, and is exempt.

### Go resolver (`ts-go-runtypes/`)

The side-channel type resolver behind the `@ts-runtypes/*` packages: a Go program that reaches into tsgo's checker (via the `oxc-project/tsgolint` shim) to answer call-site type queries at build time; the devtools spawn its compiled binary, so `bin/ts-runtypes` MUST be built before `pnpm test` (the root `pretest` covers it). Go ≥ 1.26; tests: `go -C ts-go-runtypes test ./internal/...`. ⚠️ `ts-go-runtypes/third_party/` is an OFF-LIMITS git submodule. **The full map and rules — the directory layout, the submodule/patch workflow, and the Marker test coverage rule — live in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md); read it before touching anything under `ts-go-runtypes/`.**

### Containers (`container/`)

Supplementary apps whose heavy, unrelated dependencies (Nuxt/Docus, competitor validators like zod/typebox/ajv/typia, verdaccio + multi-bundler toolchains) run **only inside podman images** — never installed on the host, never mixed into the workspace lockfile.

Two images owned by [scripts/container/image.mjs](scripts/container/image.mjs) (`pnpm rtx container [website|e2e]`), published to GHCR under `ghcr.io/mionkit/` (`tsrt-website`, `tsrt-e2e`); see [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).

- [website/](container/website/) — Nuxt/Docus docs site (`/app`), baked into `tsrt-website`. ONE install builds TWO sites, picked by `RT_SITE=runtypes|mion` (`pnpm rtx website … --site mion`): per-site content, app.config and public assets live under [sites/](container/website/sites/); components, layouts, server utils and the playground are shared. `website-deploy.yml` deploys them to runtypes.pages.dev and mion.pages.dev.
- [benchmarks/](container/benchmarks/) — per-competitor validation benchmarks + typecost / serialization / transform-wire; each competitor is its own isolated pnpm project under `_deps/`, baked at `/bench` into the same `tsrt-website` image so CI pulls one image.
- [pre-publish-e2e/](container/pre-publish-e2e/) — `tsrt-e2e` image; verdaccio + the multi-bundler builder toolchains at `/e2e` and the mion consumer toolchain at `/e2e-mion` for the release e2e gate, split from `tsrt-website` so the light lanes don't pull the heavy toolchains. ONE gate covers BOTH families: the same verdaccio serves `@ts-runtypes/*` and `@mionjs/*`, so a packed `@mionjs/core` resolves its exact sibling `@ts-runtypes/core` from the same registry. The mion side rides two consumer lanes — `mion-consumer/` (vite + vitest: JSON/binary round-trips, packaged-tarball inspection, eslint transport, production-build inlining) and `mion-bun/` (a real `Bun.serve` mion server).

## Testing

- JS uses **Vitest** (root [vitest.config.ts](vitest.config.ts)); test files use `.spec.ts` or `.test.ts`.
- All JS: `pnpm test` (all 15 vitest projects). Single file: `pnpm exec vitest run <pattern>`. Single package: `pnpm --filter <name> test`. If one full run OOMs, `pnpm run test:ci` batches the projects (resolver processes are ~200 MB each); `test:bun` runs platform-bun's bun:test suites, which vitest cannot host.
- Go: `go -C ts-go-runtypes test ./internal/...`.
- ALWAYS rebuild `bin/ts-runtypes` before `pnpm test` — plugin tests spawn it; `pnpm run pretest` runs [`scripts/core/build.mjs`](scripts/core/build.mjs) automatically (covers the Go binary, the marker dist, and the vite plugin dist).
- Never run `pnpm run build` during development (only for publishing) — EXCEPT for `ts-runtypes-devtools` (consumers read its dist `.d.ts` for typecheck; no `source` condition in its exports) and `@mionjs/devtools` (consumed compiled via `build/` — see [packages/devtools/CLAUDE.md](packages/devtools/CLAUDE.md)); both MUST be rebuilt after every src edit, and `pnpm run check:builds` covers both when stale.
- **A fresh clone can't run `pnpm test`** — plugin tests spawn `bin/ts-runtypes`, which needs [ts-go-runtypes/third_party/](ts-go-runtypes/third_party/) submodules + patches applied, the Go resolver built, and `ts-runtypes-devtools` dist built. If the host isn't bootstrapped (missing binary, uninit submodules, no Go / pnpm), **bootstrap first via the [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) — never report "tests pass" or "tests skipped" from an unbuilt host**.

- ⚠️ Any test exercising the marker API — Go OR the JS plugin — must follow the **Marker test coverage rule** in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md): both `getRunTypeId` call shapes, as paired tests.

## Code style

- No `I` prefix on interfaces; no `T` prefix on type parameters.
- `InjectRunTypeId` (capital T mid-word) — same casing as `RunType`.
- Prefer type casting over assertions.
- No `@param` / `@returns` in JSDoc; prefer one-liner comments and one-line `if`s.
- Use meaningful names in Go + TS; avoid one-letter abbreviations like `p`, `c`, `t`; when a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Environment variables

- **Single source of truth:** the `REGISTRY` array in [scripts/lib/env.mjs](scripts/lib/env.mjs) lists EVERY env var the project consumes (scripts, containers, CI, tests). `pnpm run check:env` prints it. **Any new env var a script / container / CI step / test reads MUST be added there** — the registry is the contract.
- **Prefix runtypes-owned vars with `RT_`** (`RT_WEBSITE_*`, `RT_BENCH_*`, `RT_FUZZ_*`, `RT_AUDIT_*`, …) and **mion-owned vars with `MION_`** (`MION_TEST_PORT`, `MION_SUPPRESS_DUAL_LOAD_WARN`, …). External/standard names keep their conventional spelling because the tools that read them require it: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, `GHCR_*`, `CI`, `NODE_ENV`, `PORT`. `GENERATE_ROUTER_SPEC` is the one unprefixed exception: it is a public `@mionjs/router` knob read at runtime, so renaming it would break consumers who already set it.
- **Three scopes** (the registry's `SCOPE` column): `secret` (credential), `dev` (overridable knob with a default), `internal` (set by the scripts themselves — container paths / plumbing). Mark new vars accordingly.
- **`.env.sample` mirrors the user-settable rows only** (`secret` + `dev`); add new ones there too. NEVER list an `internal` var in `.env.sample` — setting it breaks the run.
- **One credential, one load path:** secrets live directly in `.env` (loaded by [scripts/lib/env.mjs](scripts/lib/env.mjs)'s `loadEnv()`); no file-path alternates or proxy/duplicate names.
- **`.env` is LOCAL-only:** CI and cloud agents (Claude Code on the web) export the vars directly, so check `printenv` — a missing `.env` never means a missing credential.
- A var that crosses the host→container or host→CI boundary must be renamed on BOTH ends in the same change (the setter and every reader), or the protocol silently breaks.

## Development workflow

- **The internal `rtx` CLI ([scripts/rt.mjs](scripts/rt.mjs)) is the front door for dev/website/bench/publish** — run it as `pnpm rtx <area> <command>` over the area scripts (core/website/bench/container/env/release): e.g. `pnpm rtx core fuzz <suite>`, `pnpm rtx website dev`, `pnpm rtx bench`, `pnpm rtx verify`, `pnpm rtx fmt`, `pnpm rtx core codegen all --check`, `pnpm rtx release all`. It's a zero-dep dispatcher over the same `scripts/*.sh`/`*.mjs`/`vitest` the workflows call (never a reimplementation), so it can't drift from CI, and it builds the resolver + dists first where needed (replacing the old per-script `check:builds` pre-hooks). Run `pnpm rtx --help`. The underlying `scripts/*.sh` and the CI-literal aliases (`check:builds`, `check-format`, `lint`, `test`, `build`) stay as-is — `rtx` sits above them.
- After modifying Go sources, rebuild `bin/ts-runtypes` before re-running JS plugin tests; Go-only tests (`go -C ts-go-runtypes test ./internal/...`) exercise the packages directly and don't need the prebuilt binary — but they DO read the built marker dist (`packages/ts-runtypes/dist`, the real-package overlay the test fixtures resolve); `pnpm run check:builds` covers it.
- `pnpm run clean` ([scripts/core/clean.mjs](scripts/core/clean.mjs)) is a HARD clean — dists, `bin/`, tool caches, run artifacts (`logs/`, `.docdata/`, bench results, `dist-binaries/`, `tarballs/`, test `__runtypes/` genDirs) AND every `node_modules`. `--keep-deps` keeps the install, `--dry-run` lists without deleting, `pnpm run fresh-start` cleans then reinstalls. Some of what it drops is expensive to rebuild (playground WASM, benchmark data), so prefer `--dry-run` first; `pnpm --filter <pkg> run clean` still wipes just one package's dist.
- Before committing, run `pnpm run lint` and `pnpm run format` (fix errors first). Lint split: oxlint covers every package and owns the `runtypes/*` rules; eslint carries only mion's own plugin rules (`strong-typed-routes` and friends) and stops at the mion package dirs; `pnpm run lint` runs both plus typecheck.
- **"Format" means running `pnpm run format` — never hand-format, and never widen its scope.** That one command is the single source of truth: it runs **oxfmt** over `packages/**/*.ts` (TypeScript), **Prettier** over `packages/**/*.md` (markdown only), AND `gofmt -w` over `ts-go-runtypes/cmd` + `ts-go-runtypes/internal` (all the Go source). `pnpm run check-format` is its read-only twin (CI / pre-commit). The scope is deliberately narrow: everything else is EXCLUDED on purpose — the website / docs / scripts / `.claude` markdown (Prettier mangles the MDC `::`-component and ` ```md ` examples in them), the vendored `ts-go-runtypes/third_party/` and `_deps/` trees, lockfiles, and the `ts-go-runtypes/internal/**/testdata` golden fixtures. If a formatting change ever seems needed outside `pnpm run format`'s scope, STOP and surface it rather than running oxfmt/Prettier/gofmt manually over other paths.
- Prefer `pnpm` scripts from `package.json` over raw `pnpm exec <cmd>` when a script exists.
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script.
- **TWO podman images**, both owned by [scripts/container/image.mjs](scripts/container/image.mjs) (`pnpm rtx container <cmd> [website|e2e]`; shared podman/GHCR helpers in [scripts/lib/engine.mjs](scripts/lib/engine.mjs)): **`tsrt-website`** ([container/website/Containerfile](container/website/Containerfile)) bakes the docs sites (`/app` — one Nuxt install, two content trees) + benchmark deps (`/bench`); **`tsrt-e2e`** ([container/pre-publish-e2e/Containerfile](container/pre-publish-e2e/Containerfile)) bakes verdaccio, the multi-bundler builder toolchains (`/e2e`) and the mion consumer toolchain (`/e2e-mion` — a separate root because the matrix pins rolldown-vite + TypeScript 5 while a mion consumer runs plain vite 8 + TypeScript 6). The e2e toolchains live in their OWN image so the lightweight smoke / benchmark / website-build lanes never pull them — only the release gate's e2e lane does (splitting them fixed a runner-disk-exhaustion failure: the merged image had grown to 6.25 GB). `pnpm rtx container push` (no target) builds + pushes BOTH. [scripts/website/site.mjs](scripts/website/site.mjs) (`pnpm rtx website …`) runs the site, [scripts/website/bench-data/bench.mjs](scripts/website/bench-data/bench.mjs) (`pnpm rtx bench …`) runs the bench half under `/bench`, and [scripts/release/e2e.mjs](scripts/release/e2e.mjs) (`pnpm rtx release e2e`) runs the e2e registry — all delegating image ops to image.mjs. See [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).
## PR readiness

Before opening a PR, confirm the change is **PR ready** — never open one otherwise. For any **new feature, or a significant change to an existing one**, treat all of the following as a hard gate:

- **Front-end tests exist and pass.** Every new or changed behaviour needs Vitest coverage under [packages/](packages/) (`.spec.ts` / `.test.ts`); run the whole JS suite with `pnpm test`. Marker-API work must cover BOTH `getRunTypeId` call shapes (the **Marker test coverage rule** in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md)). Go-side changes also need `go -C ts-go-runtypes test ./internal/...`.
- **Docs are updated — especially the website.** Reflect the change in the site's content tree under [container/website/sites/](container/website/sites/) (follow the **Website docs style** section below), and update [docs/ROADMAP.md](docs/ROADMAP.md) whenever it touches what it describes (scope, lossy mappings).
- **If the PR implements a [docs/todos/](docs/todos/) spec, `git mv` it into [docs/done/](docs/done/) and update it to match what shipped.** Shipped only PART of it? **SPLIT it, never park it**: the moved doc records what actually landed (and why the rest was cut), and the remainder becomes a NEW [docs/todos/](docs/todos/) spec that stands on its own. There is no half-done lane — a spec is either done or open, so nothing can rot in between.
- **A replacement spec never points back at the one it replaced.** When a spec is dropped, superseded, or rewritten because the situation changed, write the new one from scratch: state the problem, the evidence, and the plan as they stand today, as if the old doc never existed. **This is strictest when none of the old spec was ever built** — there is no history to preserve, only a dead document that sends the reader chasing abandoned ideas and reading rejected plans as decisions. Delete the old spec (or `git mv` it to [docs/done/](docs/done/) if part of it genuinely shipped). Never leave a link, a "supersedes" note, or a summary of what the previous version said.

## Git workflow

- **Branch naming is a convention, not a gate.** Prefer `feature/<name>` (or `fix/`, `docs/`, `chore/`), but a branch name handed over by a tool or session, a `claude/`-prefixed one included, is fine to keep as-is; no renaming required.
- **PRs land via Rebase-and-merge — keep every branch LINEAR (no merge commits).**
- **Commit messages: subject line only by default.** A single Conventional-Commits subject; add one short paragraph only when the _why_ isn't visible in the diff. `Co-Authored-By` trailer stays at the end when present.
- **ONE exception — the `prod` release line.** `release/vX.Y.Z` → `prod` lands with **"Create a merge commit"** — never rebase, never squash ([publish.yml](.github/workflows/publish.yml)'s `merge-shape` job enforces it). The release branch is frozen from `main` and `prod` is never merged back. **Never author a commit on the release branch** — fix on `main`, re-cut forward; [pre-publish.yml](.github/workflows/pre-publish.yml)'s `main-ancestor` job enforces the frozen-prefix invariant. Whole flow: the [release-to-prod skill](.claude/skills/release-to-prod/).
- **Integrate upstream by rebasing, never merging.** `main` may be force-updated / history-rewritten:
  ```
  git fetch origin main
  git rebase origin/main            # resolve conflicts per replayed commit
  git push --force-with-lease origin <branch>
  ```
  If a stubborn branch won't rebase cleanly, linearize onto current `main` first: `git commit-tree $(git rev-parse HEAD^{tree}) -p origin/main` then `git reset --hard <new>`.
- **Never `git merge main` into a feature branch.** GitHub's rebase-merge replays your ORIGINAL commits one-by-one, so a merged branch that looks `mergeable` (final tree clean) still fails with **"this branch cannot be rebased due to conflicts."** Rebase instead.
- **Before pushing, confirm the branch is linear** — `git log --oneline origin/main..HEAD` should list only your own commits, no merge commits.
- **After any rebase, push with `git push --force-with-lease`** — never plain `--force` (the lease refuses the push if the remote branch moved under you).
- **Resolve a PR review thread once you've FIXED it — never before.** Fixes → mark resolved (GitHub `resolve_review_thread`) so the reviewer sees only what's still open. Push-backs (you disagree) and plain explanations (no code change) stay OPEN — reply with the reasoning, let the reviewer close.

## Architecture

Load-bearing invariants to know before touching the pipeline:

- **Marker self-import resolution** — the marker package's own tests import `ts-runtypes` and must resolve to `src/` (not `dist/`) via a `source` export condition on BOTH vitest and tsgo; dropping either breaks dev tests when `dist/` is stale or missing.
- **Rewrite mechanics** — rewrites use UTF-8 byte offsets (converted via `makeByteToChar` before indexing) applied through an in-house `EditBuffer` that is a Go ⇄ JS twin; two wire modes (`transformMode: 'go' | 'edits'`) are byte-identical by construction, pinned by a mode-parity corpus.
- **Two markers + demand-driven caches** — `InjectRunTypeId<T>` (injects typeId) drives the reflection cache; `InjectTypeFnArgs<T, Fn>` (injects typeId + opaque 3-char fnHash) drives per-family caches that contain ONLY the types their own call sites demand — a `getRunTypeId`-only file emits ZERO function-cache entries.
- **Validate contract — serializable data only** — validators / decoders operate on the JSON-shaped projection of `T`; non-serialisable members (functions, symbols, getters) silently drop with a build-time **Warning** and decoders return `DataOnly<T>`. Line to remember: **Warning** = expected drop, fine; **Error** = will throw at runtime, build must fail.
- **The mion request pipeline sits on top** — `@mionjs/router` executes typed `route()` / `middleFn()` handlers using the compiled validators/serializers the runtypes caches provide (via `@mionjs/core`'s reflection adapter); the `platform-*` adapters wrap the router per runtime, and `@mionjs/client` calls routes with the same compiled functions serialized into the client bundle (which is why `emitMode: 'functions'` is rejected by `@mionjs/devtools`).

## Website Documentation (`container/website/sites/<site>/content/`)

User-facing docs live in TWO content trees, [container/website/sites/runtypes/content/](container/website/sites/runtypes/content/) and [container/website/sites/mion/content/](container/website/sites/mion/content/) (Nuxt + Docus Markdown + MDC). Both follow a deliberate, reader-first voice. Keep it when editing:

- **Plain, user-focused language.** Say what a feature does for the reader and why it helps, not how it is built; cut deep internals (hashing, byte offsets, "side-channel", "fixpoint", demand-driven cache mechanics). Consumer-facing means CONSUMER-facing: a knob only a RunTypes contributor would set does not belong here at all, however well written.
- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or a spaced single `-` as punctuation; use a comma, a period, or parentheses. Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- **Prefer fenced code blocks over heavy inline `code`.** Keep essential public API / type names, but do not clutter prose with backticks.
- **Short frontmatter `description`:** one simple sentence, aim under ~100 chars; leave already-short ones alone.
- **Style passes are prose-only.** A style/voice pass never touches: MDC component syntax (`::` / `:::`, `<code-import>`, `::code-group`, `::note`, `::bench-table`, twoslash blocks), the content of fenced code blocks, or the `<!-- code-import-timestamp -->` comments (machine-owned, always off-limits). Edit the prose in and around a component; never restructure the component to fit copy.
- **`index.md` (the home page) gets the SIMPLEST wording on the site.** It is not exempt from any rule above. Its landing-page voice is punchier and plainer than the docs voice: short sentences, second person ("your types"), the concrete benefit first. Match or beat that bar, never write it in a more elaborate register than the docs. Its MDC usage is the densest on the site, so the component-structure rule matters most here, but that protects the components, not the words.
- **API-truth updates are the opposite of forbidden.** When the product API changes, updating the affected code examples, `index.md`'s included, is REQUIRED. Keep the edit scoped to the example (never restructure an MDC component), and verify the per-file MDC-component and code-fence counts match the pre-edit baseline afterwards.
- **Prefer `<code-import>` over hand-written fences for TypeScript examples.** Import real files from [packages/examples/src/](packages/examples/src/) — they compile under [packages/examples/tsconfig.json](packages/examples/tsconfig.json) (wired into the root `typecheck` script, hence `pnpm run lint` and CI), so the type checker flags doc drift instead of letting it rot. Hand-written fences are for bash/CLI, JSON config, output/tree listings, and deliberately partial or deliberately invalid fragments only. Example files resolve the public package names via the tsconfig `paths` (built dist `.d.ts` — the published surface).
- **Broad style pass:** fan out one agent per `N.section/` dir, then verify em/en dashes are gone and per-file MDC-component / code-fence counts match the pre-edit baseline.

## Relevant files

- [SETUP.md](SETUP.md) — single setup doc: prereqs, bootstrap, build, test, lint, dev loop, containerized apps, publishing, troubleshooting.
- [.claude/skills/ts-runtypes-setup/](.claude/skills/ts-runtypes-setup/) — automated host bootstrap + smoke verification skill.
- [.claude/skills/release-to-prod/](.claude/skills/release-to-prod/) — agent-driven release flow: bump + changelog PR into `main`, then the `main → prod` merge-commit promotion, CI watching, and the 2FA / deploy handoff.
- [.claude/skills/create-todo/](.claude/skills/create-todo/) — turns a rough request or idea into a well-formed spec doc under [docs/todos/](docs/todos/) (classifies, investigates to the matching depth, writes the doc with the standard metadata header the implement-todo skill later reads). Never implements the change.
- [.claude/skills/implement-todo/](.claude/skills/implement-todo/) — drives a [docs/todos/](docs/todos/) spec end-to-end: lists open todos, plans the required tests / docs / fuzzing via the plan tool BEFORE any code, implements, runs the PR-readiness gate, and moves the spec into [docs/done/](docs/done/).
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings.

