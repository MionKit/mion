# RunTypes Architectural Guidelines

> **Do not load linked / relevant files into context unless the current task strictly needs them** — [SETUP.md](SETUP.md) only for setup / build / publish work; skill dirs only when invoking them; deep-dive docs only when touching what they describe.

For setup, build, test, and publish workflows, see [SETUP.md](SETUP.md) — the single setup document. **To set up or repair a local dev environment (submodules + patches, `bin/ts-runtypes`, workspace deps, package dists), run the [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) — it drives the whole host bootstrap end-to-end. Don't hand-roll a bootstrap.** ([scripts/setup-claude-web.sh](scripts/setup-claude-web.sh) is the Linux web-container variant only — never for local/macOS; it hard-exits off Linux and redirects you to the skill.)

## Setup

- Go ≥ 1.26
- Node ≥ 26
- podman ≥ 4.0
- git
- pnpm ≥ 11 — never `npm install`; workspace policies live in `pnpm-workspace.yaml` (`.npmrc` is auth/registry only, everything else is silently ignored there).

## Repo structure

The Go program is the side-channel type resolver; the JS packages are the only public surface. Test seam: the Vite plugin's tests spawn `bin/ts-runtypes`, so the binary MUST be built before `pnpm test` (see [SETUP.md → Build](SETUP.md#build)).

### Go program (`ts-go-runtypes/`)

Compiler-driven resolver — reaches into tsgo's checker via the `oxc-project/tsgolint` shim to answer call-site type queries. Go ≥ 1.26 (enforced by [go.mod](ts-go-runtypes/go.mod)); tests: `go -C ts-go-runtypes test ./internal/...`.

- [cmd/](ts-go-runtypes/cmd/) — the resolver binary (`ts-runtypes`), its WASM twin (`ts-runtypes-wasm`), and the `gen-*` / `extract-*` codegen commands (fn-hashes, diag-catalog, ts-constants, builtin-purefns, run-type-kind, type-formats, plugin-keys, sourcerewrite-fixtures, fn-bodies).
- [internal/](ts-go-runtypes/internal/) — pipeline packages (below). Our only writable Go tree apart from `cmd/`.
- ⚠️ [third_party/](ts-go-runtypes/third_party/) — `oxc-project/tsgolint` submodule (which nests `microsoft/typescript-go`). **OFF-LIMITS — never edit anything under here, including the patches at `third_party/tsgolint/patches/`.** Local changes are discarded by `git submodule update`, and `.gitmodules` declares `ignore = dirty` so accidental edits are invisible to `git status`. Bumping the pinned revision is a separate intentional commit on the submodule pointer. If a change seems genuinely required, STOP and surface the case — the patch workflow is in [SETUP.md → Patching tsgolint](SETUP.md#patching-tsgolints-typescript-go).

Working subpackages under `internal/`:

- [compiler/](ts-go-runtypes/internal/compiler/) — source transformers (program, marker, builders, comptimeargs, resolver, sourcerewrite, entrymodules, batchcompile).
- [cachegen/](ts-go-runtypes/internal/cachegen/) — cache generation (runtype, typefunctions, purefunctions, operations, diskcache, builtinpurefns, hashid).
- [enrichment/](ts-go-runtypes/internal/enrichment/) — FriendlyText / MockData codegen (astcheck, cldr, mirror, enrichgen — the shared plan/config/check leaf the CLI verb and the daemon op both call, so they can never drift).
- [diagnostics/](ts-go-runtypes/internal/diagnostics/) — diagnostic catalog + severity messages shared by resolver and lint plugin.
- [protocol/](ts-go-runtypes/internal/protocol/) — Go ⇄ JS wire shapes (scan sites, family tags, subkinds, Site demand).
- Auxiliary (kept small, no cross-package state): `constants`, `jsquote`, `testfixtures` (F1–F17 fixtures), `textpos`.

### JS monorepo (`packages/`)

pnpm workspace, lockstep versioning ([version.json](version.json), bumped by [scripts/release/bump-version.mjs](scripts/release/bump-version.mjs)); all three published packages move together (`forcePublish: true`, `exact: true`), per-platform `@ts-runtypes/binary-<os>-<arch>` packages (their packed tarballs keep npm's unscoped `ts-runtypes-binary-*.tgz` filename) are assembled at publish time and pinned exact-equal by [scripts/release/build-binaries.mjs](scripts/release/build-binaries.mjs) / [scripts/release/publish.mjs](scripts/release/publish.mjs). All `dependencies` / `devDependencies` are exact-pinned (only `ts-runtypes-devtools` peerDeps stay as ranges so consumers can dedupe Vite); cross-package deps use the `workspace:*` protocol. All devDependencies live root-level, never per-package. Filter a package: `pnpm --filter @ts-runtypes/<name> run <cmd>`. Full policy list (frozenLockfile, minimumReleaseAge, ignoreScripts, allowNonRegistryProtocols, savePrefix, strictPeerDependencies, nodeLinker) + dep-update gotchas: [SETUP.md → pnpm policies](SETUP.md#pnpm-policies-workspace-security-posture).

- [ts-runtypes](packages/ts-runtypes/) — public marker + runtime helpers (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T,Fn>`, `getRunTypeId`, runtime family bodies).
- [ts-runtypes-devtools](packages/ts-runtypes-devtools/) — build-tool integration around the resolver. What it does:
  - **Transform** — rewrites `createX<T>()` call sites and injects the import block.
  - **Codegen** — emits per-entry cache modules under `<genDir>/types/`.
  - **Enrich** — scaffolds and keeps in sync the FriendlyText + MockData mirror files.
  - **Lint** — OXlint plugin (primary) + ESLint v9 adapter on the `./eslint` subpath; surfaces compiler diagnostics and forbids `@todo` / `@rtOrphan` in enrich files. See [docs/ARCHITECTURE.md → ts-runtypes-devtools](docs/ARCHITECTURE.md#ts-runtypes-devtools).
- [ts-runtypes-bin](packages/ts-runtypes-bin/) — platform launcher; `getExePath()` resolves the prebuilt resolver binary from per-platform `@ts-runtypes/binary-<os>-<arch>` optional deps. NEVER add a postinstall downloader — `ignoreScripts: true` blocks it. The binary embeds `constants.Version` (folded into typeID hashes) + `constants.TsgoVersion` (pure metadata: `--version` + the launcher's `tsgo` field, NEVER in the hash).
- [examples](packages/examples/) — compilable TS example files consumed by the docs website's `<code-import>` blocks; typechecked by the root `typecheck` script so doc drift fails CI.

**Published READMEs stay thin — a short description, the sibling relationship, and a link to [runtypes.pages.dev](https://runtypes.pages.dev/), plus the status/license lines.** No option tables, no usage walkthroughs, no env vars or dev-only knobs: the website is the one home for those, and a README that restates it drifts. Applies to the three package READMEs and the generated per-platform `@ts-runtypes/binary-*` one in [scripts/release/build-binaries.mjs](scripts/release/build-binaries.mjs); pinned by `repo-contracts.test.ts`. The root [README.md](README.md) is the GitHub landing page, not an npm page, and is exempt.

### Containers (`container/`)

Supplementary apps whose heavy, unrelated dependencies (Nuxt/Docus, competitor validators like zod/typebox/ajv/typia, verdaccio + multi-bundler toolchains) run **only inside podman images** — never installed on the host, never mixed into the workspace lockfile.

Two images owned by [scripts/container/image.mjs](scripts/container/image.mjs) (`pnpm rtx container [website|e2e]`), published to GHCR under `ghcr.io/mionkit/` (`tsrt-website`, `tsrt-e2e`); see [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).

- [website/](container/website/) — Nuxt/Docus docs site (`/app`), baked into `tsrt-website`.
- [benchmarks/](container/benchmarks/) — per-competitor validation benchmarks + typecost / serialization / transform-wire; each competitor is its own isolated pnpm project under `_deps/`, baked at `/bench` into the same `tsrt-website` image so CI pulls one image.
- [pre-publish-e2e/](container/pre-publish-e2e/) — `tsrt-e2e` image; verdaccio + multi-bundler builder toolchains at `/e2e` for the release e2e gate, split from `tsrt-website` so the light lanes don't pull the heavy toolchains.

## Testing

- JS uses **Vitest** (root [vitest.config.ts](vitest.config.ts)); test files use `.spec.ts` or `.test.ts`.
- All JS: `pnpm test`. Single file: `pnpm exec vitest run <pattern>`. Single package: `pnpm --filter <name> test`.
- Go: `go -C ts-go-runtypes test ./internal/...`.
- ALWAYS rebuild `bin/ts-runtypes` before `pnpm test` — plugin tests spawn it; `pnpm run pretest` runs [`scripts/core/build.mjs`](scripts/core/build.mjs) automatically (covers the Go binary, the marker dist, and the vite plugin dist).
- Never run `pnpm run build` during development (only for publishing) — EXCEPT for `ts-runtypes-devtools`, which MUST be rebuilt after every src edit (consumers read its dist `.d.ts` for typecheck; no `source` condition in its exports).
- **A fresh clone can't run `pnpm test`** — plugin tests spawn `bin/ts-runtypes`, which needs [ts-go-runtypes/third_party/](ts-go-runtypes/third_party/) submodules + patches applied, the Go resolver built, and `ts-runtypes-devtools` dist built. If the host isn't bootstrapped (missing binary, uninit submodules, no Go / pnpm), **bootstrap first via the [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) — never report "tests pass" or "tests skipped" from an unbuilt host**.

### ⚠️ Marker test coverage rule

- Any test exercising the marker API (Go under [ts-go-runtypes/internal/](ts-go-runtypes/internal/) or JS plugin under [packages/ts-runtypes-devtools/test/](packages/ts-runtypes-devtools/test/)) MUST cover both call shapes of `getRunTypeId`: static `getRunTypeId<T>()` (caller supplies T, no value) AND reflection `getRunTypeId(value)` (T inferred from the value).
- Write paired tests (not parameterized); use the natural call shape for each intent — e.g. `getRunTypeId<string>()` vs `const s: string = 'hello'; getRunTypeId(s);`. Both forms should resolve to the same cache entry for equivalent T.
- At least one paired test per suite must assert hash equivalence between the two forms (see `TestAtomic_FormEquivalence` in [ts-go-runtypes/internal/compiler/resolver/atomic_test.go](ts-go-runtypes/internal/compiler/resolver/atomic_test.go)).

## Code style

- No `I` prefix on interfaces; no `T` prefix on type parameters.
- `InjectRunTypeId` (capital T mid-word) — same casing as `RunType`.
- Prefer type casting over assertions.
- No `@param` / `@returns` in JSDoc; prefer one-liner comments and one-line `if`s.
- Use meaningful names in Go + TS; avoid one-letter abbreviations like `p`, `c`, `t`; when a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Environment variables

- **Single source of truth:** the `REGISTRY` array in [scripts/lib/env.mjs](scripts/lib/env.mjs) lists EVERY env var the project consumes (scripts, containers, CI, tests). `pnpm run check:env` prints it. **Any new env var a script / container / CI step / test reads MUST be added there** — the registry is the contract.
- **Prefix runtypes-owned vars with `RT_`** (`RT_WEBSITE_*`, `RT_BENCH_*`, `RT_FUZZ_*`, `RT_AUDIT_*`, …). External/standard names keep their conventional spelling because the tools that read them require it: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, `GHCR_*`, `CI`, `NODE_ENV`, `PORT`.
- **Three scopes** (the registry's `SCOPE` column): `secret` (credential), `dev` (overridable knob with a default), `internal` (set by the scripts themselves — container paths / plumbing). Mark new vars accordingly.
- **`.env.sample` mirrors the user-settable rows only** (`secret` + `dev`); add new ones there too. NEVER list an `internal` var in `.env.sample` — setting it breaks the run.
- **One credential, one load path:** secrets live directly in `.env` (loaded by [scripts/lib/env.mjs](scripts/lib/env.mjs)'s `loadEnv()`); no file-path alternates or proxy/duplicate names.
- **`.env` is LOCAL-only:** CI and cloud agents (Claude Code on the web) export the vars directly, so check `printenv` — a missing `.env` never means a missing credential.
- A var that crosses the host→container or host→CI boundary must be renamed on BOTH ends in the same change (the setter and every reader), or the protocol silently breaks.

## Development workflow

- **The internal `rtx` CLI ([scripts/rt.mjs](scripts/rt.mjs)) is the front door for dev/website/bench/publish** — run it as `pnpm rtx <area> <command>` over the area scripts (core/website/bench/container/env/release): e.g. `pnpm rtx core fuzz <suite>`, `pnpm rtx website dev`, `pnpm rtx bench`, `pnpm rtx verify`, `pnpm rtx fmt`, `pnpm rtx core codegen all --check`, `pnpm rtx release all`. It's a zero-dep dispatcher over the same `scripts/*.sh`/`*.mjs`/`vitest` the workflows call (never a reimplementation), so it can't drift from CI, and it builds the resolver + dists first where needed (replacing the old per-script `check:builds` pre-hooks). Run `pnpm rtx --help`. The underlying `scripts/*.sh` and the CI-literal aliases (`check:builds`, `check-format`, `lint`, `test`, `build`) stay as-is — `rtx` sits above them.
- After modifying Go sources, rebuild `bin/ts-runtypes` before re-running JS plugin tests; Go-only tests (`go -C ts-go-runtypes test ./internal/...`) exercise the packages directly and don't need the prebuilt binary.
- `pnpm run clean` (per-package clean via `pnpm -r run clean`) before a fresh start.
- Before committing, run `pnpm run lint` and `pnpm run format` (fix errors first).
- **"Format" means running `pnpm run format` — never hand-format, and never widen its scope.** That one command is the single source of truth: it runs **oxfmt** over `packages/**/*.ts` (TypeScript), **Prettier** over `packages/**/*.md` (markdown only), AND `gofmt -w` over `ts-go-runtypes/cmd` + `ts-go-runtypes/internal` (all the Go source). `pnpm run check-format` is its read-only twin (CI / pre-commit). The scope is deliberately narrow: everything else is EXCLUDED on purpose — the website / docs / scripts / `.claude` markdown (Prettier mangles the MDC `::`-component and ` ```md ` examples in them), the vendored `ts-go-runtypes/third_party/` and `_deps/` trees, lockfiles, and the `ts-go-runtypes/internal/**/testdata` golden fixtures. If a formatting change ever seems needed outside `pnpm run format`'s scope, STOP and surface it rather than running oxfmt/Prettier/gofmt manually over other paths.
- Prefer `pnpm` scripts from `package.json` over raw `pnpm exec <cmd>` when a script exists.
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script.
- **TWO podman images**, both owned by [scripts/container/image.mjs](scripts/container/image.mjs) (`pnpm rtx container <cmd> [website|e2e]`; shared podman/GHCR helpers in [scripts/lib/engine.mjs](scripts/lib/engine.mjs)): **`tsrt-website`** ([container/website/Containerfile](container/website/Containerfile)) bakes the docs site (`/app`) + benchmark deps (`/bench`); **`tsrt-e2e`** ([container/pre-publish-e2e/Containerfile](container/pre-publish-e2e/Containerfile)) bakes verdaccio + the multi-bundler builder toolchains (`/e2e`). The e2e toolchains live in their OWN image so the lightweight smoke / benchmark / website-build lanes never pull them — only the release gate's e2e lane does (splitting them fixed a runner-disk-exhaustion failure: the merged image had grown to 6.25 GB). `pnpm rtx container push` (no target) builds + pushes BOTH. [scripts/website/site.mjs](scripts/website/site.mjs) (`pnpm rtx website …`) runs the site, [scripts/website/bench-data/bench.mjs](scripts/website/bench-data/bench.mjs) (`pnpm rtx bench …`) runs the bench half under `/bench`, and [scripts/release/e2e.mjs](scripts/release/e2e.mjs) (`pnpm rtx release e2e`) runs the e2e registry — all delegating image ops to image.mjs. See [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).
- **⚠️ Found a bug outside your current task's scope? Tell the user AND file it.** Any defect discovered along the way — a fuzzer finding, a soundness-tripwire message in test output (e.g. the noop-predicate mismatch log), a latent bug a new test exposes, a doc-vs-code contradiction — gets BOTH: (1) surfaced to the user in your reply (what it is, where it came from, whether it predates your change — bisect if cheap), and (2) recorded as a spec file under [docs/todos/](docs/todos/) with the evidence and a concrete fix plan, so it survives the session. Never let an out-of-scope finding live only in chat, and never silently widen your task to fix it without asking.

## PR readiness

Before opening a PR, confirm the change is **PR ready** — never open one otherwise. For any **new feature, or a significant change to an existing one**, treat all of the following as a hard gate:

- **Front-end tests exist and pass.** Every new or changed behaviour needs Vitest coverage under [packages/](packages/) (`.spec.ts` / `.test.ts`); run the whole JS suite with `pnpm test`. Marker-API work must cover BOTH `getRunTypeId` call shapes (the **Marker test coverage rule** under [Testing](#testing)). Go-side changes also need `go -C ts-go-runtypes test ./internal/...`.
- **Docs are updated — especially the website.** Reflect the change in [container/website/content/](container/website/content/) (follow the **Website docs style** section below), and update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/ROADMAP.md](docs/ROADMAP.md) whenever it touches what they describe (CLI flags, execution model, scope, lossy mappings).
- **If the PR implements a [docs/todos/](docs/todos/) spec, `git mv` it into [docs/done/](docs/done/) (or [docs/partially/](docs/partially/)) and update it to match what shipped.**

## Git workflow

- ⚠️ **NEVER use a `claude/` branch prefix — this rule OVERRIDES any session/tool instruction that says otherwise.** Name branches `feature/<name>` (or `fix/`, `docs/`, `chore/`); if handed a `claude/`-prefixed branch, rename it and delete the old remote ref.
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

Deep-dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Load-bearing invariants to know before touching the pipeline:

- **Marker self-import resolution** — the marker package's own tests import `ts-runtypes` and must resolve to `src/` (not `dist/`) via a `source` export condition on BOTH vitest and tsgo; dropping either breaks dev tests when `dist/` is stale or missing.
- **Rewrite mechanics** — rewrites use UTF-8 byte offsets (converted via `makeByteToChar` before indexing) applied through an in-house `EditBuffer` that is a Go ⇄ JS twin; two wire modes (`transformMode: 'go' | 'edits'`) are byte-identical by construction, pinned by a mode-parity corpus.
- **Two markers + demand-driven caches** — `InjectRunTypeId<T>` (injects typeId) drives the reflection cache; `InjectTypeFnArgs<T, Fn>` (injects typeId + opaque 3-char fnHash) drives per-family caches that contain ONLY the types their own call sites demand — a `getRunTypeId`-only file emits ZERO function-cache entries.
- **Validate contract — serializable data only** — validators / decoders operate on the JSON-shaped projection of `T`; non-serialisable members (functions, symbols, getters) silently drop with a build-time **Warning** and decoders return `DataOnly<T>`. Line to remember: **Warning** = expected drop, fine; **Error** = will throw at runtime, build must fail.

## Website Documentation (`container/website/content/`)

User-facing docs under [container/website/content/](container/website/content/) (Nuxt + Docus Markdown + MDC) follow a deliberate, reader-first voice. Keep it when editing:

- **Plain, user-focused language.** Say what a feature does for the reader and why it helps, not how it is built; cut deep internals (hashing, byte offsets, "side-channel", "fixpoint", demand-driven cache mechanics). Consumer-facing means CONSUMER-facing: a knob only a RunTypes contributor would set does not belong here at all, however well written.
- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or a spaced single `-` as punctuation; use a comma, a period, or parentheses. Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- **Prefer fenced code blocks over heavy inline `code`.** Keep essential public API / type names, but do not clutter prose with backticks.
- **Short frontmatter `description`:** one simple sentence, aim under ~100 chars; leave already-short ones alone.
- **Style passes are prose-only.** A style/voice pass never touches: MDC component syntax (`::` / `:::`, `<code-import>`, `::code-group`, `::note`, `::bench-table`, twoslash blocks), the content of fenced code blocks, the `<!-- code-import-timestamp -->` comments (machine-owned, always off-limits), or `index.md` (the home page: hand-tuned copy and the densest custom-MDC usage).
- **API-truth updates are the opposite of forbidden.** When the product API changes, updating the affected code examples, `index.md`'s included, is REQUIRED. Keep the edit scoped to the example (never restructure an MDC component), and verify the per-file MDC-component and code-fence counts match the pre-edit baseline afterwards.
- **Prefer `<code-import>` over hand-written fences for TypeScript examples.** Import real files from [packages/examples/src/](packages/examples/src/) — they compile under [packages/examples/tsconfig.json](packages/examples/tsconfig.json) (wired into the root `typecheck` script, hence `pnpm run lint` and CI), so the type checker flags doc drift instead of letting it rot. Hand-written fences are for bash/CLI, JSON config, output/tree listings, and deliberately partial or deliberately invalid fragments only. Example files resolve the public package names via the tsconfig `paths` (built dist `.d.ts` — the published surface).
- **Broad style pass:** fan out one agent per `N.section/` dir, then verify em/en dashes are gone and per-file MDC-component / code-fence counts match the pre-edit baseline.

## Relevant files

- [SETUP.md](SETUP.md) — single setup doc: prereqs, bootstrap, build, test, lint, dev loop, containerized apps, publishing, troubleshooting.
- [.claude/skills/ts-runtypes-setup/](.claude/skills/ts-runtypes-setup/) — automated host bootstrap + smoke verification skill.
- [.claude/skills/release-to-prod/](.claude/skills/release-to-prod/) — agent-driven release flow: bump + changelog PR into `main`, then the `main → prod` merge-commit promotion, CI watching, and the 2FA / deploy handoff.
- [.claude/skills/create-todo/](.claude/skills/create-todo/) — turns a rough request or idea into a well-formed spec doc under [docs/todos/](docs/todos/) (classifies, investigates to the matching depth, writes the doc with the standard metadata header the implement-todo skill later reads). Never implements the change.
- [.claude/skills/implement-todo/](.claude/skills/implement-todo/) — drives a [docs/todos/](docs/todos/) spec end-to-end: lists open todos, plans the required tests / docs / fuzzing via the plan tool BEFORE any code, implements, runs the PR-readiness gate, and moves the spec into [docs/done/](docs/done/).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design, execution model, sentinel markers, lossy mappings, factory reference.
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings.
