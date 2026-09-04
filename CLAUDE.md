# Mion & RunTypes Guidelines

> ⚠️ When replying to the user, talk in plain everyday language and extremely condensed phrases! Avoid jargon and internal nicknames unless very basic. If a term or idea could be unclear, define it in one short sentence, and add a tiny code example when it helps. 
> Never use em dashes "—" 
> Do not load linked / relevant files into context unless the current task strictly needs them!

For setup, build, test, and publish workflows, see [SETUP.md](SETUP.md), the single setup document.
If environment is not already setup you can run the [mion-setup skill](.claude/skills/ts-runtypes-setup/) — it drives the whole host bootstrap end-to-end. Don't hand-roll a bootstrap! 

## ⚠️ IMPORTANT!!! any issue found during a task must be FIXED, not filed for later

This is the rule broken most often, so it comes first!! Any issue or blocker you discover while doing a task should be fixed before task gets done:

- **Related to the current task** → fix it in the SAME task and the SAME pull request, with its own commit and its own test. Size buys no exemption — a big related finding means a bigger PR, not a later one.
- **Completely Unrelated to the current task** → delegate it to a PARALLEL background agent, never a backlog — run the [delegate-finding skill](.claude/skills/delegate-finding/). That takes care of creating the todo and delegating it to a parallel agent.
- A [docs/todos/](docs/todos/) spec is a commitment to solve it, never a way to close the loop!

**Absolute:** never let a finding slide and get lost, either fix it or delegate it to a parallel claude session. Ask if there are open questions you can't solve!

## Setup

- Go ≥ 1.26
- Node ≥ 26
- podman ≥ 4.0
- git
- pnpm ≥ 11 — never `npm install`; workspace policies live in `pnpm-workspace.yaml` (`.npmrc` is auth/registry only, everything else is silently ignored there).


## JS monorepo (`packages/`)

One pnpm workspace, one `@mionjs/*` namespace, one release train: the type-system packages and the framework packages ride the same `version.json` lockstep and depend on each other via `workspace:*`. 
All `dependencies` / `devDependencies` are exact-pinned. THREE peerDeps exceptions stay as ranges: `@mionjs/devtools` (so consumers can dedupe Vite) and, on the `@mionjs/drizzle-orm-*-core` packages, BOTH their `drizzle-orm` peer (the range IS the compatibility promise of their drizzle-aligned version line) and their `@mionjs/run-types` peer (the consumer's single copy must supply both the format types and the runtime `getRunType` the tableFromType/toDrizzle marker overloads forward to; an exact pin would also force a republish every release).
Cross-package deps use the `workspace:*` protocol. All devDependencies live root-level, never per-package, with ONE exception: each drizzle dialect package carries `@mionjs/run-types: workspace:*` as a devDependency to satisfy its own peer in the workspace (dev deps never reach a consumer). 

- [mion](packages/run-types/) — public marker + runtime helpers (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T,Fn>`, `getRunTypeId`, runtime family bodies).
- [@mionjs/devtools](packages/devtools/) — build-tool integration around the resolver, and the ONLY devtools package (the two merged). Five source areas: `src/core/` (bundler agnostic), `src/runtypes/` (the unopinionated adapter per bundler), `src/vite/` and `src/next/` (the mion presets, one dir per host, sharing `src/options.ts`), `src/lint/`. Read [its CLAUDE.md](packages/devtools/CLAUDE.md). What it does:
  - **Transform** — rewrites `createX<T>()` call sites and injects the import block.
  - **Codegen** — emits per-entry cache modules under `<genDir>/types/`.
  - **Enrich** — scaffolds and keeps in sync the FriendlyText + MockData mirror files.
  - **Lint** — ONE module, TWO namespaces on the `./eslint` (and `./oxlint`) subpath: the default export is the `runtypes/*` plugin OXlint's `jsPlugins` loads, `mionPlugin` carries mion's own `@mionjs/*` rules, and `configs.recommended` registers both for ESLint. ESM only, deliberately: its top-level `await prewarmSession()` has no CommonJS spelling and must fork the resolver launcher before OXlint reserves its address space.
  - **Presets** — `@mionjs/devtools/vite` (`mionVitePlugin`) and `@mionjs/devtools/next` (`withMion`) are the mion-opinionated entries; the plain adapters live under `@mionjs/devtools/runtypes/*` (vite, rollup, rolldown, webpack, rspack, esbuild, bun, next). Both presets map options through `src/mion/options.ts` so they cannot drift.
  - ⚠️ **Next.js / Turbopack** ([src/runtypes/next/](packages/devtools/src/runtypes/next/)) — the one adapter reaching a bundler with NO plugin API: a broker started from `next.config` plus a `turbopack.rules` loader. `withMion` composes those pieces; it never nests one wrapper in another.
    Read [src/runtypes/next/CLAUDE.md](packages/devtools/src/runtypes/next/CLAUDE.md) first, it records invariants that look like cleanups but are not!
- [@mionjs/bin](packages/bin/) — platform launcher, and the `mion` CLI command; `getExePath()` resolves the prebuilt resolver binary from per-platform `@mionjs/binary-<os>-<arch>` optional deps.
  NEVER add a postinstall downloader, `ignoreScripts: true` blocks it. `constants.Version` is folded into typeID hashes; `constants.TsgoVersion` is metadata and NEVER enters the hash.
- [examples](packages/examples/) — MERGED package of compilable TS example files (mion + runtypes) consumed by both docs sites' `<code-import>` blocks; the root `typecheck` compiles them, so doc drift fails CI.

The mion framework packages (`@mionjs/*`):

- [core](packages/core/) — shared framework foundation (`RpcError`/`TypedError`, router metadata, binary body framing, the mion↔mion reflection adapter under `src/runtypes/`).
- [router](packages/router/) — HTTP routing and request handling. [client](packages/client/) — client-side utilities.
- [devtools](packages/devtools/) (`@mionjs/devtools`) — Vite plugin (wraps `@mionjs/devtools`) + ESLint plugin.
- [drizzle-orm](packages/drizzle-orm/) (`@mionjs/drizzle-orm`) — the dialect-agnostic slim recorder core (column/table/entry/sql recorders, flat Infer* models, refineTableType); never imports drizzle.
- [drizzle-orm-pg-core](packages/drizzle-orm-pg-core/) / [-mysql-core](packages/drizzle-orm-mysql-core/) / [-sqlite-core](packages/drizzle-orm-sqlite-core/) — the per-dialect authoring surfaces: drizzle-identical builders/helpers that RECORD calls, with `toDrizzle` on the `./drizzle` subpath as the one drizzle-importing module (drizzle-orm is an optional peer). All four ride the drizzle version line instead of the lockstep train (the `versionLine` package.json marker) and republish only when their own published sources changed ([scripts/lib/drizzle-line.mjs](scripts/lib/drizzle-line.mjs)). Generator config: [drizzle-dialects.json](drizzle-dialects.json); the same run emits the import map `mion drizzle-migrate` rewrites with.
  Proven against real databases by the drizzle-e2e lane (below), which translates drizzle's own suites onto these packages and runs them.
- `platform-aws|bun|cloudflare|gcloud|node|uws|vercel` — platform adapters. [test-server](packages/test-server/) — private e2e fixture server.
- [uws](packages/uws/) (`@mionjs/uws`) — loader for the uWebSockets.js prebuilt binaries platform-uws runs on (sha256-verified on-demand fetch in dev via `pnpm miondevx core build uws`).
- Every `@mionjs/*` dependency on `RunTypes/*` is `workspace:*`, so **the mion tests need the Go toolchain** exactly like the runtypes ones.

**Published READMEs stay thin** — a short description, the sibling relationship, a link to [mion.pages.dev/runtypes](https://mion.pages.dev/runtypes), plus the status/license lines.
No option tables, no usage walkthroughs, no env vars or dev-only knobs: the website is the one home for those.
Applies to the three package READMEs and the generated per-platform `@mionjs/binary-*` one; pinned by `repo-contracts.test.ts`. The root [README.md](README.md) is exempt.

## TS RunTypes Go program (`ts-go-runtypes/`)

The side-channel type resolver behind the `RunTypes/*` packages: a Go program that reaches into tsgo's checker (via the `oxc-project/tsgolint` shim) to answer call-site type queries at build time; the devtools spawn its compiled binary.
Tests: `go -C ts-go-runtypes test ./internal/...`. ⚠️ `ts-go-runtypes/third_party/` is an OFF-LIMITS git submodule.
The full map and rules (directory layout, submodule/patch workflow, Marker test coverage rule) live in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md). Read it before touching anything under `ts-go-runtypes/`!

## Containers (`container/`)

Supplementary apps whose heavy, unrelated dependencies (Nuxt/Docus, competitor validators like zod/typebox/ajv/typia, verdaccio + multi-bundler toolchains) run **only inside podman images** — never installed on the host, never mixed into the workspace lockfile.

SEVEN images, all owned by [scripts/container/image.mjs](scripts/container/image.mjs) (`pnpm miondevx container <cmd> [website|e2e|mion-bench|drizzle-pg|drizzle-mysql|drizzle-sqlite|drizzle-cloudflare]`), published to GHCR under `ghcr.io/mionkit/`.
`pnpm miondevx container push` with no target builds + pushes ALL SEVEN. Shared podman/GHCR helpers in [scripts/lib/engine.mjs](scripts/lib/engine.mjs).
Pulling or pushing needs `GHCR_PAT`, `GHCR_OWNER`, `GHCR_USER` and `GHCR_REGISTRY` in the environment or in `.env` (see [SETUP.md → GHCR](SETUP.md#publishing--consuming-the-image-via-ghcr)); without them a run falls back to building the image locally.
⚠️ **The containers DO run here, and DO build and push here (Claude cloud sessions, CI, any host with podman): the four `GHCR_*` vars are already exported, check `printenv`, a missing `.env` is not a missing credential.** Run `pnpm miondevx container login` ONCE before the first container / bench / website command: it does the `podman login` with `GHCR_PAT`. The run path pulls but never logs in by itself, so skipping it fails with `unauthorized` and falls back to a needless local build.
**Never conclude "containers can't run / can't be built / can't be pushed in this environment".** Running means logging in and pulling. Building and pushing means the two knobs below, both of which exist precisely for a sandboxed or proxied host:

- **Docker Hub blocked** (`podman pull node:26-trixie` answers `403 Forbidden` from `production.cloudfront.docker.com`)? That is the base image, NOT GHCR, and it is not a dead end. Point the build at a pull-through mirror: `MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie`. It serves the identical config digest, so the image is the same one, and the knob is honoured by build AND push.
- **Downloads inside the build fail** (`curl` exit 7, `apt-get` cannot connect)? The egress proxy listens on `127.0.0.1`, which a build container in its own netns cannot reach. `MION_WEBSITE_BUILD_NETWORK=host` puts the build in the host's network namespace and it works. (Both knobs are shared by every image target, `MION_WEBSITE_`-prefixed name included.)
- **The arm64 half of a push dies early** (`exit status 255` on an innocuous step like `update-ca-certificates`)? `container push` always builds `linux/amd64,linux/arm64`, and an x86 box with no emulator registered fails the moment it runs an arm64 binary. Register one, once per boot:
  ```bash
  mount | grep -q binfmt_misc || mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc
  podman run --rm --privileged mirror.gcr.io/tonistiigi/binfmt --install arm64
  podman run --rm --platform linux/arm64 mirror.gcr.io/library/node:26-trixie uname -m   # must print aarch64
  ```
  ⚠️ The mount line is load-bearing and the installer will NOT tell you: on a microVM `/proc/sys/fs/binfmt_misc` exists but nothing is mounted there, so `--install` writes into a plain directory, prints a healthy `"emulators": ["qemu-aarch64"]`, and changes nothing. The `uname -m` check is how you find out; without it the next symptom is `exec format error`.
  NEVER "fix" a failing arm64 half by pushing an amd64-only manifest: the maintainer works on arm64, so that silently breaks them.

So the whole line, from a cold sandbox, is:
```bash
pnpm miondevx container login
podman run --rm --privileged mirror.gcr.io/tonistiigi/binfmt --install arm64
MION_WEBSITE_BASE_IMAGE=mirror.gcr.io/library/node:26-trixie MION_WEBSITE_BUILD_NETWORK=host \
  pnpm miondevx container push mion-bench
```
Pulling is already the DEFAULT: `ensureImage` only builds when `MION_*_USE_LOCAL` is set, or when the image's `org.mionkit.deps-hash` no longer matches the tree. A drifted hash means a `_deps` manifest or the Containerfile changed, so a rebuild is the correct answer, not something to work around: build it, verify it, and push it so the next run pulls it.
See [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).

- **`tsrt-website`** ← [website/](container/website/) + [benchmarks/](container/benchmarks/); run with `pnpm miondevx website …` and `pnpm miondevx bench …`.
  - Nuxt/Docus docs at `/app`; per-competitor validation benchmark deps at `/bench`, each competitor its own isolated pnpm project under `_deps/`.
  - ONE install builds ONE site with THREE subsites, `/rpc`, `/runtypes` and `/benchmarks`: one content tree under [content/](container/website/content/) (`01.rpc`, `02.runtypes`, `03.benchmarks`), one colour scheme per subsite under [sites/](container/website/sites/), everything else shared. Each subsite has its own sidebar and theme; the header shows the mion logo plus the subsite word.
  - `website-deploy.yml` deploys it to mion.pages.dev, and a redirect-only upload to the old runtypes.pages.dev project.
- **`tsrt-e2e`** ← [pre-publish-e2e/](container/pre-publish-e2e/); run with `pnpm miondevx release e2e`. Its OWN image so the light smoke / benchmark / website-build lanes never pull the heavy toolchains.
  - Verdaccio + the multi-bundler builder toolchains at `/e2e`; the mion consumer toolchain at `/e2e-mion` (separate root: the matrix pins rolldown-vite + TypeScript 5, a mion consumer runs plain vite 8 + TypeScript 6).
  - ONE gate covers BOTH families: the same verdaccio serves `RunTypes/*` and `@mionjs/*`, so a packed `@mionjs/core` resolves its exact sibling `@mionjs/run-types`.
- **`mion-drizzle-pg|mysql|sqlite|cloudflare`** ← [drizzle-e2e/](container/drizzle-e2e/); run with `pnpm miondevx release drizzle-e2e`. FOUR images cover FIVE lanes: `pg` / `mysql` / `sqlite` are dialects, and the `cloudflare` image serves BOTH Cloudflare storage-driver lanes (`d1` and `durable`), which are drivers rather than dialects. The ONLY thing that proves a `toDrizzle()` table works against a real database.
  - Each translates drizzle's OWN integration suites onto the slim packages with `mion drizzle-migrate`, converts that tree AGAIN onto the pure-type road with `mion convert --to type`, then runs all three trees (control, builders, types) against three databases, typechecks them, and crosses both reports against the manifests. The type-road tree runs through the devtools build transform, which is the only place a `tableFromType<T>()` marker resolves.
  - The DATABASE image is the base (`postgres:17-trixie`, `mysql:8.4`, `node:26-trixie` for sqlite), with Node from the official tarball: drizzle's suites want real postgres and real MySQL, and Debian ships MariaDB.
  - NO docker-in-docker: drizzle's runners prefer `PG_CONNECTION_STRING` / `MYSQL_CONNECTION_STRING` / `SQLITE_DB_PATH` over their own docker helper.
  - `pnpm miondevx core drizzle-translate [--to-types]` is the host half: the same translations and typechecks, no container and no database.
- **`mion-bench`** ← [mion-bench/](container/mion-bench/); run with `pnpm miondevx bench servers`. One isolated pnpm project per app under `_deps/`.
  - The mion HTTP **server** benchmarks: mion on platform-node / platform-uws / platform-bun against express, fastify, hapi, hono, elysia and a bare node server.
  - `node:26-trixie` base, not bookworm: the uWebSockets.js addon links against `GLIBC_2.38`.
  - Lanes are built in-container by vite + `@mionjs/devtools` against the bind-mounted workspace, so published numbers describe the current tree.
  - Every lane must answer correctly AND reject an invalid payload before it is measured!

## Testing

- JS uses **Vitest** (root [vitest.config.ts](vitest.config.ts)); test files use `.spec.ts` or `.test.ts`.
- All JS: `pnpm test` (all 21 vitest projects). Single file: `pnpm exec vitest run <pattern>`. Single package: `pnpm --filter <name> test`.
- If one full run OOMs, `pnpm run test:ci` runs the SAME 21 projects in 7 batches, one vitest process per batch (resolver processes are ~200 MB each). The batches live in [scripts/core/test-batches.mjs](scripts/core/test-batches.mjs) and only GROUP the names `vitest.config.ts` declares: `pnpm run check:test-batches` (a CI gate, and the run's own preflight) fails if a project sits in no batch or in two. Adding a project means adding it to a batch.
  `test:bun` runs platform-bun's bun:test suites, which vitest cannot host.
- Go: `go -C ts-go-runtypes test ./internal/...`.
- **`pnpm test` needs a bootstrapped host** — plugin tests spawn `bin/mion`, which needs the [third_party/](ts-go-runtypes/third_party/) submodules + patches applied, the Go resolver built, and the `@mionjs/devtools` dist built.
  `pnpm run pretest` ([scripts/core/build.mjs](scripts/core/build.mjs)) rebuilds all of that, but a fresh clone or a host missing Go / pnpm needs the setup skill first.
  Never report "tests pass" or "tests skipped" from an unbuilt host!
- Never run `pnpm run build` during development, only for publishing. ONE exception, which MUST be rebuilt after every src edit (`pnpm run check:builds` covers them when stale):
  - `@mionjs/devtools` — consumers read its `dist/` `.d.ts` for typecheck, AND the root eslint config loads its `./eslint` entry through node (no `source` condition), so a stale dist breaks lint too. See [packages/devtools/CLAUDE.md](packages/devtools/CLAUDE.md).
- ⚠️ Any test exercising the marker API — Go OR the JS plugin — must follow the **Marker test coverage rule** in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md): both `getRunTypeId` call shapes, as paired tests.

## Code style

- No `I` prefix on interfaces; no `T` prefix on type parameters.
- `InjectRunTypeId` (capital T mid-word) — same casing as `RunType`.
- Prefer type casting over assertions.
- No `@param` / `@returns` in JSDoc; prefer one-liner comments and one-line `if`s.
- Use meaningful names in Go + TS; avoid one-letter abbreviations like `p`, `c`, `t`; when a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Environment variables

- **Single source of truth:** the `REGISTRY` array in [scripts/lib/env.mjs](scripts/lib/env.mjs) lists EVERY env var the project consumes (scripts, containers, CI, tests). `pnpm run check:env` prints it. Any new env var a script / container / CI step / test reads MUST be added there!
- **Prefix EVERY project-owned var with `MION_`** (`MION_WEBSITE_*`, `MION_VALIDATION_BENCH_*`, `MION_FUZZ_*`, `MION_TEST_PORT`, …). The old `RT_` prefix is retired; never add a new one.
  Two `MION_*BENCH_*` families, kept apart on purpose: `MION_BENCH_*` drives the mion HTTP **server** benchmarks (the `mion-bench` image) and `MION_VALIDATION_BENCH_*` the validation benchmarks (the `tsrt-website` image). They never share a container.
  External/standard names keep their conventional spelling: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, `GHCR_*`, `CI`, `NODE_ENV`, `PORT`.
  `GENERATE_ROUTER_SPEC` is the one unprefixed exception: a public `@mionjs/router` knob read at runtime, renaming it would break consumers.
- **Five vars still answer to their old `RT_` name, and warn once**: `MION_BIN`, `MION_CACHE_DIR`, `MION_JS_RUNTIME`, `MION_LINT_PRESPAWN`, `MION_NEXT_DEBUG`. They are read out of a CONSUMER's environment, where neither end is ours to move. The fallback lives in [envCompat.ts](packages/devtools/src/core/envCompat.ts) and [envcompat.go](ts-go-runtypes/internal/envcompat/envcompat.go); the alias is noted on the registry row rather than given a row of its own.
- **Three scopes** (the registry's `SCOPE` column): `secret` (credential), `dev` (overridable knob with a default), `internal` (set by the scripts themselves). Mark new vars accordingly.
- **`.env.sample` mirrors the user-settable rows only** (`secret` + `dev`); add new ones there too. NEVER list an `internal` var in `.env.sample` — setting it breaks the run.
- **One credential, one load path:** secrets live directly in `.env` (loaded by `loadEnv()`); no file-path alternates or proxy/duplicate names.
- **`.env` is LOCAL-only:** CI and cloud agents export the vars directly, so check `printenv` — a missing `.env` never means a missing credential.
- A var that crosses the host→container or host→CI boundary must be renamed on BOTH ends in the same change (the setter and every reader), or the protocol silently breaks.

## Development workflow

- Go-only tests (`go -C ts-go-runtypes test ./internal/...`) don't need the prebuilt binary, but they DO read the built marker dist (`packages/run-types/dist`, the real-package overlay the test fixtures resolve); `pnpm run check:builds` covers it.
- `pnpm run clean` ([scripts/core/clean.mjs](scripts/core/clean.mjs)) is a HARD clean — dists, `bin/`, tool caches, run artifacts AND every `node_modules`.
  `--keep-deps` keeps the install, `--dry-run` lists without deleting, `pnpm run fresh-start` cleans then reinstalls.
  Some of what it drops is expensive to rebuild (playground WASM, benchmark data), so prefer `--dry-run` first; `pnpm --filter <pkg> run clean` still wipes just one package's dist.
- Before committing, run `pnpm run lint` and `pnpm run format` (fix errors first). `pnpm run lint` runs both linters plus typecheck.
  Lint split: oxlint covers every package and owns the `runtypes/*` rules; eslint carries only mion's own plugin rules (`strong-typed-routes` and friends) and stops at the mion package dirs.
- "Format" means running `pnpm run format`, never hand-format and never widen its scope! `pnpm run check-format` is its read-only twin (CI / pre-commit).
  It runs **oxfmt** over `packages/**/*.ts`, **Prettier** over `packages/**/*.md` (markdown only), AND `gofmt -w` over `ts-go-runtypes/cmd` + `ts-go-runtypes/internal`.
  Everything else is EXCLUDED on purpose: the website / docs / scripts / `.claude` markdown (Prettier mangles the MDC `::`-components), the vendored `third_party/` and `_deps/` trees, lockfiles, and the `testdata` golden fixtures.
  If a formatting change ever seems needed outside that scope, STOP and surface it rather than running oxfmt/Prettier/gofmt manually.
- Prefer `pnpm` scripts from `package.json` over raw `pnpm exec <cmd>` when a script exists.
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script.

## PR readiness

Before opening a PR, confirm the change is **PR ready** — never open one otherwise. For any **new feature, or a significant change to an existing one**, treat all of the following as a hard gate:

- **Front-end tests exist and pass.** Every new or changed behaviour needs Vitest coverage under [packages/](packages/) (`.spec.ts` / `.test.ts`); run the whole JS suite with `pnpm test`. Go-side changes also need `go -C ts-go-runtypes test ./internal/...`.
- **Docs are updated**, especially the website. Reflect the change in the site's content tree under [container/website/content/](container/website/content/) (follow the **Website docs style** section below).
- If the PR implements a [docs/todos/](docs/todos/) spec, `git mv` it into [docs/done/](docs/done/) and update it to match what shipped!
  Shipped only PART of it? **SPLIT it, never park it**: the moved doc records what actually landed, the remainder becomes a NEW [docs/todos/](docs/todos/) spec that stands on its own. There is no half-done lane.
- **A superseded spec is rewritten from scratch**, never cross-referenced. Delete the old one (or `git mv` it to [docs/done/](docs/done/) if part genuinely shipped). Never leave a link, a "supersedes" note, or a summary of the previous version.
- **No other file ever names a `docs/todos/` or `docs/done/` document.** Not a doc, a skill, a workflow, a test, or a code comment: those specs get deleted eventually, so every such reference rots. Put the reasoning in the file that needs it. A spec may list the documents that could go stale once it merges, but that list lives inside the spec.

## Git workflow

- **Branch naming is a convention**, not a gate. Prefer `feature/<name>` (or `fix/`, `docs/`, `chore/`), but a branch name handed over by a tool or session, a `claude/`-prefixed one included, is fine to keep as-is; no renaming required.
- PRs land via Rebase-and-merge, keep every branch LINEAR (no merge commits)!
- **Commit messages:** subject line only by default. A single Conventional-Commits subject; add one short paragraph only when the _why_ isn't visible in the diff. `Co-Authored-By` trailer stays at the end when present.
- **ONE exception — the `prod` release line.** `release/vX.Y.Z` → `prod` lands with **"Create a merge commit"**, never rebase, never squash ([publish.yml](.github/workflows/publish.yml)'s `merge-shape` job enforces it).
  The release branch is frozen from `main` and `prod` is never merged back. **Never author a commit on the release branch** — fix on `main`, re-cut forward ([pre-publish.yml](.github/workflows/pre-publish.yml)'s `main-ancestor` job enforces it).
  Whole flow: the [release-to-prod skill](.claude/skills/release-to-prod/).
- **Integrate upstream by rebasing, never merging.** `main` may be force-updated / history-rewritten:
  ```
  git fetch origin main
  git rebase origin/main            # resolve conflicts per replayed commit
  git push --force-with-lease origin <branch>
  ```
  If a stubborn branch won't rebase cleanly, linearize onto current `main` first: `git commit-tree $(git rev-parse HEAD^{tree}) -p origin/main` then `git reset --hard <new>`.
- **Never `git merge main` into a feature branch.** GitHub's rebase-merge replays your ORIGINAL commits one-by-one, so a merged branch that looks `mergeable` (final tree clean) still fails with **"this branch cannot be rebased due to conflicts."** Rebase instead.
- **Before pushing, confirm the branch is linear** — `git log --oneline origin/main..HEAD` should list only your own commits, no merge commits.
- **After any rebase**, push with `git push --force-with-lease` — never plain `--force` (the lease refuses the push if the remote branch moved under you).
- Resolve a PR review thread once you've FIXED it, never before! Fixes → mark resolved (GitHub `resolve_review_thread`) so the reviewer sees only what's still open. Push-backs (you disagree) and plain explanations (no code change) stay OPEN — reply with the reasoning, let the reviewer close.

## Architecture

Load-bearing invariants to know before touching the pipeline:

- **Marker self-import resolution** — the marker package's own tests import `mion` and must resolve to `src/` (not `dist/`) via a `source` export condition on BOTH vitest and tsgo; dropping either breaks dev tests when `dist/` is stale or missing.
- **Rewrite mechanics** — rewrites use UTF-8 byte offsets (converted via `makeByteToChar` before indexing) applied through an in-house `EditBuffer` that is a Go ⇄ JS twin; two wire modes (`transformMode: 'go' | 'edits'`) are byte-identical by construction, pinned by a mode-parity corpus.
- **Two markers + demand-driven caches** — `InjectRunTypeId<T>` (injects typeId) drives the reflection cache; `InjectTypeFnArgs<T, Fn>` (injects typeId + opaque 3-char fnHash) drives per-family caches.
  Those caches hold ONLY the types their own call sites demand: a `getRunTypeId`-only file emits ZERO function-cache entries.
- **Validate contract — serializable data only** — validators / decoders operate on the JSON-shaped projection of `T`; non-serialisable members (functions, symbols, getters) silently drop with a build-time **Warning** and decoders return `DataOnly<T>`.
  Line to remember: **Warning** = expected drop, fine; **Error** = will throw at runtime, build must fail.
- **Decode before validate, so the decoder guards the wire shape** — validation runs on the restored value, so a JSON restore arm converts only the exact wire form (a Date from a string, a bigint from a whole-number string, a Map/Set from an array) and leaves anything else for validate. The kinds that convert are listed in `reflection.MustValidateJson` (`ts-go-runtypes/internal/reflection/must_validate_json.go`); a Go test and the `GC-GUARD` generated-code oracle fail when an arm ships without its guard. Rule details in [ts-go-runtypes/CLAUDE.md](ts-go-runtypes/CLAUDE.md).
- **The mion request pipeline sits on top** — `@mionjs/router` executes typed `route()` / `middleFn()` handlers using the compiled validators/serializers the runtypes caches provide (via `@mionjs/core`'s reflection adapter); the `platform-*` adapters wrap the router per runtime.
  `@mionjs/client` calls routes with the same compiled functions serialized into the client bundle, which is why `emitMode: 'functions'` is rejected by `@mionjs/devtools`.

## Website Documentation (`container/website/content/<NN>.<subsite>/`)

User-facing docs live in ONE content tree (Nuxt + Docus Markdown + MDC), [container/website/content/](container/website/content/), with one dir per subsite: `01.rpc/` (the framework), `02.runtypes/` and `03.benchmarks/` (`01.rpc/` + `02.runtypes/` inside it).

- **Page structure, section titles, tables and tips** follow the *Writing guidelines* in [container/website/CLAUDE.md](container/website/CLAUDE.md): one job per section (how, what, or why), plain Title Case titles that name the job, one table per topic, a tip where something works a particular way.
- **Plain, user-focused language.** Say what a feature does for the reader and why it helps, not how it is built; cut deep internals (hashing, byte offsets, "side-channel", "fixpoint", demand-driven cache mechanics).
  Consumer-facing means CONSUMER-facing: a knob only a RunTypes contributor would set does not belong here at all, however well written.
- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or a spaced single `-` as punctuation; use a comma, a period, or parentheses. Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- **Prefer fenced code blocks** over heavy inline `code`. Keep essential public API / type names, but do not clutter prose with backticks.
- **Short frontmatter `description`:** one simple sentence, aim under ~100 chars; leave already-short ones alone.
- **Never let a formatter or linter near this tree.** Prettier reflows the `::` / `:::` MDC components (`<code-import>`, `::code-group`, `::note`, `::tip`, `::bench-table`, twoslash blocks) and the machine-owned `<!-- code-import-timestamp -->` comments into something Docus no longer parses, which is exactly why `pnpm run format` excludes the content tree (see the Format rule above). Never hand-format it either.
  Authoring components is normal work: add the `::tip` a page needs, fix a wrong `<code-import>` path. What is off-limits is a TOOL rewriting them, and changing a component on a pass that was only supposed to touch prose. After an edit, check the per-file MDC-component and code-fence counts moved only by what you meant to change, and by nothing else.
- **`index.md`** (the home page) gets the SIMPLEST wording on the site, and is exempt from nothing above. Short sentences, second person ("your types"), the concrete benefit first.
- Updating examples when the API changes is REQUIRED, `index.md`'s included. Keep the edit scoped to the example.
- **Prefer `<code-import>`** over hand-written fences for TypeScript examples. Import real files from [packages/examples/src/](packages/examples/src/), they compile under the root `typecheck` script so the type checker flags doc drift.
  Hand-written fences are for bash/CLI, JSON config, output/tree listings, and deliberately partial or invalid fragments only.
- **Broad style pass:** fan out one agent per `N.section/` dir, then verify em/en dashes are gone and the counts still match.

## The `miondevx` CLI

`miondevx` ([scripts/miondevx.mjs](scripts/miondevx.mjs)) is the CLI tool used to run every command in this repo: dev, tests, website, benchmarks, containers, release.
Run `pnpm miondevx <area> <command>`, or `pnpm miondevx --help` to list them. Areas: core, website, bench, container, env, release.

```bash
pnpm miondevx core fuzz <suite>
pnpm miondevx core codegen all --check
pnpm miondevx website dev
pnpm miondevx bench
pnpm miondevx verify
pnpm miondevx fmt
pnpm miondevx release all
```

It's a zero-dep dispatcher over the same `scripts/*.sh`/`*.mjs`/`vitest` the workflows call, never a reimplementation, so it can't drift from CI.
The CI-literal aliases (`check:builds`, `check-format`, `lint`, `test`, `build`) stay as-is, `miondevx` sits above them.

- **Every command builds the engine first.** The entry point builds or verifies `bin/mion` + the marker and devtools dists before any command whose registry row does not say `build: false` (help, `container`, `env`, `fmt`, `clean`, the npm-side release steps). On a warm tree that check is a content stamp (`bin/.mion.stamp`, ~250 ms); a bare `pnpm miondevx core build` is the authoritative build-id compare and never trusts the stamp. The `pretest` / `prelint` / `pretypecheck` hooks run the same trusted check (`check:builds`).
- **Adding a command means adding a registry row** in [scripts/lib/devx-registry.mjs](scripts/lib/devx-registry.mjs): the help (`miondevx --help` lists commands, `miondevx <area> --help` or a bare `miondevx <area>` adds the flags), the usage errors and the build gate all render from that one table, and a dispatcher refuses any word that has no row.
