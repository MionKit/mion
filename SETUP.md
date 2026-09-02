# Setup

Single setup document for RunTypes. Architecture + workflow rules live in [CLAUDE.md](CLAUDE.md).

> **Automated path:** the `mion-setup` skill ([.claude/skills/ts-runtypes-setup/](.claude/skills/ts-runtypes-setup/)) drives this whole document end-to-end — host deps, submodule bootstrap + patches, `pnpm install`, Go + plugin builds, podman engine, and smoke verification. Run `bash .claude/skills/ts-runtypes-setup/setup.sh` and the rest of this doc is reference material.

The repository contains a **Go binary** at [ts-go-runtypes/cmd/mion/](ts-go-runtypes/cmd/mion/) and a **pnpm workspace** of JS packages under [packages/](packages/). Two **podman-containerized** apps ship alongside: the docs website ([container/website/](container/website/)), one Nuxt install that builds ONE static site, mion.pages.dev, with three subsites (/rpc, /runtypes, /benchmarks), and the validation benchmarks ([container/benchmarks/](container/benchmarks/)).

---

## Prerequisites

| Tool   | Version  | Needed by                                     | Source of truth                      |
| ------ | -------- | --------------------------------------------- | ------------------------------------ |
| Go     | ≥ 1.26   | resolver binary + benchmarks                  | `ts-go-runtypes/go.mod`              |
| Node   | ≥ 26.0.0 | tests, builds, benchmarks host prep           | root `package.json` `engines.node`   |
| pnpm   | ≥ 11.0.0 | the monorepo (workspace policies)             | `packageManager: pnpm@11.1.1`        |
| git    | recent   | submodule + `git apply` are used              | -                                    |
| podman | ≥ 4.0    | docs website + benchmarks containers          | tested 4.9.3 / 5.8.3                 |

> **Container runtime is Node 26.** Both podman images ([`container/website/Containerfile`](container/website/Containerfile) and [`container/pre-publish-e2e/Containerfile`](container/pre-publish-e2e/Containerfile)) build `FROM node:26-bookworm`, which unflags the global `Temporal` API, so benchmark timings and the docs build run on native Temporal (no `temporal-polyfill`), the same runtime the published library targets. The `tsrt-website` image holds two dependency trees in separate dirs: the website at `/app`, the benchmarks at `/bench`; the `tsrt-e2e` image holds verdaccio + the pre-publish e2e builder toolchains at `/e2e` (kept separate so the light lanes never pull the heavy toolchains). Node 26 ships only `npm` (the bundled `corepack` shim was removed), so each image installs the repo-pinned pnpm globally. The **host** also needs Node >= 26 now: with `temporal-polyfill` dropped, the test suite runs on the native `Temporal` global too. Override the base with `MION_WEBSITE_BASE_IMAGE` (mirror / air-gapped / offline-built base).

**macOS Apple Silicon also needs Rosetta 2** — the podman-machine `vfkit` backend requires it and exits 1 without it. Install with `softwareupdate --install-rosetta --agree-to-license` (the skill does this automatically).

---

## Clone & bootstrap

```bash
git clone git@github.com:MionKit/mion.git
cd mion
git submodule update --init --recursive
(cd ts-go-runtypes/third_party/tsgolint/typescript-go && git apply --3way ../patches/*.patch)
pnpm install --frozen-lockfile
pnpm exec husky                   # wire the git commit hooks (separate step — see below)
```

What this does:

1. Pulls `oxc-project/tsgolint` (which nests `microsoft/typescript-go`).
2. Applies the five vendored patches to the `typescript-go` working tree via `git apply --3way` — no commits needed (CI-safe, no git identity required). The patches are upstream tsgolint artifacts; never edit them.
3. Installs workspace deps from the committed lockfile.
4. Wires husky's git hooks — `commit-msg` → commitlint (Conventional Commits, feeding the git-cliff changelog) and `pre-commit` → lint-staged. This is a SEPARATE, explicit step because `ignoreScripts: true` (the pnpm supply-chain policy) blocks husky's `prepare` from auto-running on install, and git hooks are per-clone local state (`core.hooksPath`), never cloned. Skip it and your commits aren't checked locally — CI's `commitlint` job still gates PRs, but you lose the fast local feedback.

The Go module graph resolves against the patched `typescript-go` working tree — `go build` will fail without the patches.

---

## Build

### Go binary

```bash
go -C ts-go-runtypes build -o ../bin/mion ./cmd/mion
```

The Vite plugin spawns this binary at JS test time and at build time. You never build it by hand: every `pnpm miondevx` command that needs it, and the root `pretest` / `prelint` / `pretypecheck` hooks, run [`scripts/core/build.mjs`](scripts/core/build.mjs) first, which rebuilds the Go binary, the marker package dist, and the devtools dist when any of them is stale or partially emitted. On a warm tree that check is a content stamp (`bin/.mion.stamp`) and costs well under a second; `pnpm miondevx core build` is the full build-id compare.

### JS packages

```bash
pnpm run build                                       # all packages, topo-ordered via `pnpm -r`
pnpm --filter @mionjs/run-types run build      # single package
pnpm --filter @mionjs/devtools run build         # the other
```

Outputs land in `packages/*/dist/`. The plugin's dist must be present for marker-package typecheck (no `source` condition in its exports map) — rebuild after every plugin src edit.

### Clean

```bash
pnpm run clean                   # hard clean (see below)
pnpm run clean --keep-deps       # same, but leave node_modules installed
pnpm run clean --dry-run         # list what would go, delete nothing
pnpm run fresh-start             # hard clean + `pnpm install --frozen-lockfile`
```

`pnpm run clean` ([scripts/core/clean.mjs](scripts/core/clean.mjs)) is a **hard** clean: package dists + `.tsbuildinfo` + `.coverage`, `bin/`, the website's `.output` / `.nuxt` / playground bundle, tool caches (vite, vitest, nuxt, playwright, the host-built playground WASM under `.cache/`), run artifacts (`logs/`, `.docdata/`, bench results, `dist-binaries/`, `tarballs/`, the test suites' `__runtypes/` genDirs) and finally **every `node_modules` in the workspace**. Everything it removes is gitignored build output; it never touches `.env`, the vendored [ts-go-runtypes/third_party/](ts-go-runtypes/third_party/) tree, or the global pnpm store (`pnpm store prune` is a separate, deliberate call).

Some of what it drops is expensive to regenerate (the playground WASM needs a container build; `.docdata/` + `public/bench-data/` need a full benchmark run) — use `--dry-run` first if you are unsure, and `pnpm --filter <pkg> run clean` when you only want one package's dist gone.

---

## Test

```bash
go -C ts-go-runtypes test ./internal/...        # Go suite
pnpm test                                       # all JS packages (Vitest projects)
pnpm --filter @mionjs/devtools test         # single package
pnpm --filter @mionjs/run-types test      # the other
```

JS plugin tests in [packages/devtools/test/](packages/devtools/test/) spawn the Go binary — `pretest` rebuilds it. For the edit/see-tests loop, `pnpm run check:builds` then `pnpm exec vitest` (watch mode) keeps the binary fresh; `pnpm test` is the one-shot pass.

---

## Containerized apps (docs website + benchmarks)

The docs website and the validation benchmarks share **one** podman image, so CI can pull it once and build the whole site (which renders benchmark data) end-to-end. They install their heavy node_modules **inside** that image (supply-chain isolation; the host never touches them), in two separate dirs with separate `node_modules`: the **website at `/app`**, the **benchmarks at `/bench`** (`/bench/competitors/<name>` + `/bench/typecost`, each its own isolated pnpm project). The image is **deps-only**: it bakes third-party `node_modules` plus the package-manager manifests and nothing else (no Go binary, no benchmark code, no website source). All first-party files (source + the website's Nuxt/TS/ESLint config) are bind-mounted at run time, so the image is invalidated only when a dependency manifest changes. Drivers: [scripts/container/image.mjs](scripts/container/image.mjs) owns the image (`pnpm miondevx container <cmd>`: build-image/push/pull/ensure/lock/clean; shared podman/GHCR helpers in [scripts/lib/engine.mjs](scripts/lib/engine.mjs)); [scripts/website/site.mjs](scripts/website/site.mjs) (`pnpm miondevx website …`) runs the site and [scripts/website/bench-data/bench.mjs](scripts/website/bench-data/bench.mjs) (`pnpm miondevx bench …`) runs the bench half under `/bench`, both delegating image ops to image.mjs.

The package-manager files (`package.json`, lockfile, `pnpm-workspace.yaml`, `.npmrc`) live in a per-project **`_deps/`** dir: `container/website/_deps/` and `container/benchmarks/_deps/` (the latter mirroring `competitors/<name>/` + `typecost/`). They are deliberately kept **out of the host project roots** so you can't accidentally `pnpm install` at `container/website/` or a competitor dir. The single [`container/website/Containerfile`](container/website/Containerfile) `COPY`s `container/website/_deps/` into `/app`; `scripts/container/image.mjs` stages `container/benchmarks/_deps/` into the build context (as the git-ignored `.bench-deps/`) so the same Containerfile installs each competitor under `/bench`. To bump a **website** dependency, edit `container/website/_deps/package.json`, regenerate the lockfile in-container with `pnpm miondevx container lock`, then `pnpm miondevx container build-image` (+ `pnpm miondevx container push`). To bump a **benchmark** dependency, edit `container/benchmarks/_deps/competitors/<name>/package.json`, then rebuild + push the same way.

The **mion HTTP server benchmarks** are a THIRD image, `mion-bench` ([container/mion-bench/](container/mion-bench/), driven by [scripts/website/bench-data/mion-bench.mjs](scripts/website/bench-data/mion-bench.mjs)). Same pattern (deps-only, one isolated pnpm project per app under `_deps/`, every source file bind-mounted), but its own image so a competitor web-framework bump can never disturb the validation lanes or the docs build, and so the light lanes never pull a load generator. It is also the one image on **`node:26-trixie`**: the uWebSockets.js addon links against `GLIBC_2.38` and bookworm ships 2.36, so the `mion.uws` lane cannot start on the website image's base. Its mion lanes are built in-container by vite + `@mionjs/devtools` against the bind-mounted workspace packages, so the numbers describe the current tree rather than a published release. Bump one of its dependencies the same way: edit `container/mion-bench/_deps/<app>/package.json`, then `pnpm miondevx container build-image mion-bench` + `pnpm miondevx container push mion-bench`.

The **drizzle-e2e lane** is THREE more images, one per dialect ([container/drizzle-e2e/](container/drizzle-e2e/), driven by [scripts/release/drizzle-e2e.mjs](scripts/release/drizzle-e2e.mjs)). Each carries a real database and everything needed to translate drizzle's OWN integration suites onto the slim `@mionjs/drizzle-orm-*` packages and run them against it, which is the only thing in the repo that proves a `toDrizzle()` table works against a database rather than against another type. The database image is the base (`postgres:17-trixie`, `mysql:8.4`, `node:26-trixie` for sqlite) with Node added from the official tarball: drizzle's suites are written against real postgres and real MySQL, and Debian ships MariaDB. Same deps-only pattern otherwise, and the same verdaccio posture as `tsrt-e2e` — every run publishes the packed tarballs and installs them, so the lane exercises what would ship, translator included. Each suite runs THREE times per lane, in three databases: drizzle's own code as the control, the translated builders road, and that tree converted once more onto the pure-type road with `mion convert --to type`. All three must produce the same per-test outcomes and the same type errors. Run it with `pnpm miondevx release drizzle-e2e` (add `--dialect pg` for one, `--skip-types` for the builders road alone), and the translations by themselves, with no container and no database, with `pnpm miondevx core drizzle-translate --to-types`.

| Surface     | pnpm script              | What it does                                                                       |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Website     | `pnpm miondevx website dev`   | Hot-reload dev server on `:3000` (bind-mounted source).                                       |
| Website     | `pnpm miondevx website check` | Build image (if stale) + boot dev server detached + curl `:3000` + tear down.      |
| Website     | `pnpm miondevx website build` | Production build of the site to `container/website/.output` (ends with the render check below). |
| Website     | `pnpm miondevx website check --static` | Serve the built `.output/public` and assert the site is not hollow. |
| Benchmarks  | `pnpm miondevx bench prep`    | Build the resolver binary (host + Linux cross) + JS packages on the host.          |
| Benchmarks  | `pnpm miondevx bench`         | Build + run EVERY competitor in its own isolated container, then aggregate.         |
| Benchmarks  | `pnpm miondevx bench --one <n>` | Build + run a SINGLE competitor + aggregate (fastest verification loop).            |
| Benchmarks  | `pnpm miondevx bench smoke`   | Build every competitor's dist (no run) — minutes shorter.                           |
| Benchmarks  | `pnpm miondevx bench typecheck` | Compile every competitor project in the image — the gate that keeps each `cases.ts` total over the shared case keys. |
| Benchmarks  | `pnpm miondevx bench typecost`| Per-competitor type-instantiation-cost benchmark.                                  |
| Benchmarks  | `pnpm miondevx bench serialization` | mion round-trip serialization bench (+ formats), IN-CONTAINER on Node 26 (native Temporal). |
| drizzle     | `pnpm miondevx core drizzle-suites` | Fetch + sha256-verify drizzle's own integration suites at the pinned tag (`--record` re-pins at a new tag). |
| drizzle     | `pnpm miondevx core drizzle-translate [--to-types]` | Translate those suites onto the slim packages and typecheck the result; `--to-types` converts that tree onto the pure-type road too. No container, no database. |
| drizzle     | `pnpm miondevx release drizzle-e2e` | The full lane: both translations, installed from verdaccio, run against a real postgres, mysql and sqlite. `--dialect <d>` for one, `--skip-types` for the builders road alone. |
| Servers     | `pnpm miondevx bench servers` | Build + run EVERY benchmarked HTTP server across the three suites, then regenerate the mion site's data. |
| Servers     | `pnpm miondevx bench servers one <app>` | A single server (`mion`, `mion.uws`, `mion.bun`, `express`, …) across the suites. |
| Servers     | `pnpm miondevx bench servers sweep` | The payload-size sweep (~1 KB → ~4 MB), mion adapters only — what exercises the uws zero-copy path above 512 KiB. |
| Servers     | `pnpm miondevx bench servers --quick` | Short load windows for a dev loop. The numbers are noisy and must not be published. |
| Benchmarks  | `pnpm miondevx bench --website` | **One command** for ALL website benchmark data, BOTH families: validation + typecost + capture-env + serialization (+ formats) in the website image, then the mion server benchmarks in the `mion-bench` image, then the two host transforms. This is what a website deploy runs, so both families' numbers come from one run. |

The website only needs **podman**; the benchmarks additionally need **Node + pnpm + Go** for the host prep (resolver binary + first-party dists, bind-mounted into the container). On macOS the prep cross-compiles `bin/mion-linux-<arch>` **and** `bin/extract-fn-bodies-linux-<arch>` (the serialization bench's source-body extractor) so the Linux container can execute them without a Go toolchain.

> **Agents:** start the website with `pnpm miondevx website dev --agent` (not plain `dev`). It runs in a separate container (`tsrt-website-agent`) on the reserved port **`:3100`** and self-stops after ~5 min idle, so an agent-driven server never collides with a human's `:3000` and never lingers. Hot-reload polling auto-enables on macOS; force it anywhere with `MION_WEBSITE_POLL=1`.

### Playground (in-browser WASM, POC)

The docs site has an interactive **playground** page (`/playground`) that resolves a TypeScript type **and runs the functions RunTypes generates for it** (validate, JSON/binary encode + decode, RunType graph) entirely in the browser, with no server round-trip. It is a Nuxt Vue component — [`container/website/app/components/content/RuntypesPlayground.vue`](container/website/app/components/content/RuntypesPlayground.vue) wraps the client-only Monaco UI [`container/website/app/components/playground/PlaygroundStage.client.vue`](container/website/app/components/playground/PlaygroundStage.client.vue), driven by the framework-agnostic engine at [`container/website/app/playground/`](container/website/app/playground/). Monaco + prettier are dependencies of the website image ([`container/website/_deps/package.json`](container/website/_deps/package.json)); the component imports the `mion` runtime factories from source (aliased in [`nuxt.config.ts`](container/website/nuxt.config.ts)).

Two inputs are **host-built** (the container is Node-only, with no Go toolchain): the resolver WASM and the mion source overlay the resolver type-checks snippets against. The website driver builds and stages them automatically whenever it serves the site (`pnpm miondevx website dev` / `build` / `preview` / `check`), so `/playground` just works after a normal `pnpm miondevx website dev`. It needs the Go toolchain + bootstrapped submodule on the host (see [Bootstrap](#bootstrap)); when those are absent or the build fails the site still runs and only `/playground` shows an error state. Skip the auto-build with `MION_WEBSITE_SKIP_PLAYGROUND=1`.

You can also build the assets directly:

```
node container/website/scripts/build-playground.mjs
```

It compiles `ts-go-runtypes/cmd/mion-wasm` (`GOOS=js GOARCH=wasm`) and emits the mion source overlay, staging `mion.wasm.gz`, `wasm_exec.js`, and `runtypes-sources.json` into `container/website/public/playground-app/` (git-ignored, reproducible). The build is **staleness-gated**: a fast mtime pre-check plus a `go tool buildid` compare over the Go inputs means it is an instant no-op when nothing changed and only recompiles the wasm on a real input change (gzip runs only when the bytes actually change) — so editing the Vue UI never rebuilds the wasm. Because `public/` is bind-mounted into the container, the staged files ride into both the dev server and the production build. The engine tests live at [`packages/run-types/test/playground/`](packages/run-types/test/playground/) and run under `pnpm test` (project `playground`); they need the host-built assets in `.cache/rt-wasm/` and skip without them.

### Website needs the packages it documents (repo context)

The docs site documents the runtime packages: its `<code-import>` and `::twoslash-code` mechanisms read first-party source + built `.d.ts` from `packages/` at build/dev time. Those packages may live in a separate checkout. The website driver mounts that checkout **read-only** into the container and points the resolvers at it via `MION_REPO_ROOT` — so the website is **merge-agnostic** (works whether the packages sit in a sibling checkout today or get merged into this repo; only the env value changes).

- `MION_WEBSITE_REPO_CONTEXT` — host path to the checkout containing `packages/`. **Default:** sibling `../mion` if present, else this repo. Override to point anywhere.
- Only `packages/` (+ the drizzle-orm `.d.ts` allowlist) is mounted — never the repo root. The resolvers additionally **confine every `path=` read to `packages/`** (`resolveInPackages` in [`server/utils/repo-root.ts`](container/website/server/utils/repo-root.ts)); a path escaping it is rejected.
- `pnpm miondevx website check --docs` boots the dev server and checks code-import + twoslash + the security boundary end-to-end (curl/grep, no browser).
- `pnpm miondevx website check --static` works on the OTHER end — the finished artifact. It serves `container/website/.output/public` through the same clean-URL resolution Cloudflare Pages uses and replays what a browser does on every benchmark page: the page must be prerendered with its `::bench-table` or `:bench-chart`, the `/bench-data/<bench>/index.json` the component fetches must exist, and its numbers must actually paint cells (a dataset that would render every cell `n-a` fails). Those tables render client-side and fall back to a "data not generated yet" notice, so without this a benchmark stage that dies mid-run ships a GREEN build with empty pages. It also asserts every content page prerendered and every picture it references shipped. `pnpm miondevx website build` runs it as its last stage, and [website-deploy.yml](.github/workflows/website-deploy.yml) runs it again as an explicit gate before the Cloudflare upload.

### Docs read benchmark/test results from `.docdata/`

`pnpm miondevx bench` publishes per-competitor result JSON into the canonical **`<repo>/.docdata/container/benchmarks/`** (future test results go in `.docdata/tests/`). The website mounts `.docdata` **read-only** at `/app/.docdata` (`MION_DOCDATA`), so doc-gen and content components consume results from there. (`MION_WEBSITE_DOCDATA` overrides the host dir.)

Every runtime command in [`scripts/website/bench-data/bench.mjs`](scripts/website/bench-data/bench.mjs) self-syncs prereqs by delegating to [`scripts/core/build.mjs`](scripts/core/build.mjs) (also used by `pretest`): it rebuilds the Go binary, the Linux cross-binary, the plugin dist, and the marker dist when any of them is stale or has a partial tsc emit. It then readies the shared image (by delegating to `scripts/container/image.mjs`), which under `*_USE_LOCAL` rebuilds when a **dependency** input changes (`container/website/Containerfile` or anything under `container/website/_deps/` or `container/benchmarks/_deps/`). All first-party source is bind-mounted, so editing it never triggers an image rebuild. Manual `pnpm miondevx bench prep` remains available for explicit refresh.

macOS-specific knobs:

- `MION_WEBSITE_POLL=1 pnpm miondevx website dev` — VM file-watch needs filesystem polling.
- The skill calls `podman machine init` + `podman machine start` automatically; manually it's the same two commands.

Behind a corporate / MITM proxy: pass `MION_WEBSITE_CA_CERT=... MION_WEBSITE_BUILD_NETWORK=host pnpm miondevx container build-image`. See `container/website/CONTAINER.md`.

### Publishing & consuming the image via GHCR

Six deps-only images are published to the GitHub Container Registry so any host can **pull a ready-to-run image** instead of re-running all installs: `tsrt-website` (website at `/app`, benchmarks at `/bench`), `tsrt-e2e` (verdaccio + the pre-publish e2e builder toolchains at `/e2e`), `mion-bench` (the HTTP server benchmarks) and `mion-drizzle-{pg,mysql,sqlite}` (drizzle's own suites against a real database), all under `ghcr.io/mionkit/`. Helpers live in [scripts/lib/engine.mjs](scripts/lib/engine.mjs).

**Credentials (dev machines).** Pulling and pushing needs four vars, exported in your shell or set in the repo's `.env` (see `.env.sample`): `GHCR_PAT`, `GHCR_OWNER`, `GHCR_USER`, `GHCR_REGISTRY`. Only `GHCR_PAT` is a secret; the other three have defaults that already target this repo. Without them a pull of a private image fails and the run falls back to building the image locally, which needs a base image from Docker Hub.

**By default every run command pulls the latest published image first** (`scripts/lib/engine.mjs:ghcrTryPullRetag` — a cheap no-op when your local copy already matches the remote digest), so a `dev` / `build` / `bench` always runs the current published deps. If the registry is unreachable (offline / not logged in / not yet published) it falls back to an existing local image, then to a local build.

| Step | Command | Notes |
| ---- | ------- | ----- |
| Authenticate (once) | `pnpm miondevx container login` | Reads the PAT from `GHCR_PAT`, pipes via `--password-stdin`. Only needed for a **private** package. |
| Run (consume) | `pnpm miondevx website dev` / `pnpm miondevx bench` | Pulls the latest published image, then runs. This is the default. |
| Publish | `pnpm miondevx container push` | Builds the **multi-arch** (`linux/amd64,linux/arm64`) images and pushes them. No target = ALL SEVEN; add `website`, `e2e`, `mion-bench`, `drizzle-pg`, `drizzle-mysql`, `drizzle-sqlite` or `drizzle-cloudflare` to push just one. |
| Build/run locally | `MION_WEBSITE_USE_LOCAL=1 pnpm miondevx website dev` (or `MION_VALIDATION_BENCH_USE_LOCAL=1`) | Skip the pull; build/use a local image. The maintainer/offline loop — also how you test a dep bump before pushing. |
| Pull only | `pnpm miondevx container pull` | Fetch + retag without running. |

Dep-bump loop (host stays pnpm-free): edit `container/website/_deps/package.json` → `pnpm miondevx container lock` (regen the lockfile in-container) → `MION_WEBSITE_USE_LOCAL=1 pnpm miondevx website check` (verify the new local image) → `pnpm miondevx container push`.

GHCR env (see [scripts/lib/engine.mjs](scripts/lib/engine.mjs)): `GHCR_OWNER` (default `mionkit`), `GHCR_USER` (default `M-jerez`), `GHCR_PAT`, `MION_WEBSITE_USE_LOCAL` / `MION_VALIDATION_BENCH_USE_LOCAL` (opt out of the pull), `MION_WEBSITE_REMOTE_IMAGE` / `MION_VALIDATION_BENCH_REMOTE_IMAGE` (both default to `ghcr.io/$GHCR_OWNER/tsrt-website:latest`). The `tsrt-e2e` image's coordinates are fixed (`ghcr.io/$GHCR_OWNER/tsrt-e2e:latest`); it reuses the shared `MION_WEBSITE_*` engine / network / CA knobs.

Notes:

- **PAT scope:** push needs `write:packages` (pull of a private image needs `read:packages`). For pushing to the **org** namespace (`ghcr.io/mionkit/…`) use a **classic** PAT authorized for the MionKit org via SSO — fine-grained tokens need the org to opt in to package writes. If an org push is denied, publish under your personal namespace with `GHCR_OWNER=<you>`.
- **Multi-arch on an arm64 Mac:** the `linux/amd64` half builds under QEMU emulation (slower); a local `build-image` is always pinned to the host arch so it runs native. The image pre-compiles typia's native ttsc plugin at build time and bakes it under `node_modules/.cache/ttsc`, so no benchmark run pays that compile.
- **Visibility:** the GHCR package is **private by default**. Make it public (or grant the repo read access) so CI / other hosts can pull without authenticating. The image carries an `org.opencontainers.image.source` label so the package links to this repo.

---

## Lint & format

```bash
pnpm lint            # oxlint (single root pass) + typecheck
pnpm format          # oxfmt (TS) + prettier (md) + gofmt
pnpm check-format    # the read-only twin (CI-safe)
```

Linting is a single root **oxlint** pass (config in [`.oxlintrc.json`](.oxlintrc.json)): the `correctness` category as errors plus the default `typescript`/`oxc`/`unicorn` plugins, which is a superset of the old `eslint:recommended` + `tseslint:recommended`. The same config hosts the enrichment `runtypes/*` rules via the built devtools lint plugin (`jsPlugins`). Type checking stays a separate `tsc`/tsgo step (`pnpm run typecheck`), which `pnpm run lint` chains after oxlint.

Formatting splits by file type: **oxfmt** formats TypeScript (`packages/**/*.ts`, config in [`.oxfmtrc.json`](.oxfmtrc.json), a 1:1 port of `.prettierrc`), **Prettier** formats markdown (`packages/**/*.md`), and `gofmt` handles Go. Prettier stays for markdown and for the playground's in-browser beautifier.

### Variable naming

Use meaningful names in both Go and JS/TS — avoid one-letter abbreviations like `p`, `c`, `t`. When a struct field has a JSON tag, reuse that name. Loop indices (`i`, `k`, `v`) and `err` are fine.

```go
// Bad
func New(p *program.Program, c *checker.Checker) { ... }

// Good
func New(program *program.Program, checker *checker.Checker) { ... }
```

---

## Pre-commit hooks

Two Husky hooks, both activated automatically by `pnpm install` via the root `prepare` script (run `pnpm exec husky` to force activation):

- [`.husky/pre-commit`](.husky/pre-commit) runs `pnpm exec lint-staged` on staged files. The `lint-staged` config in [package.json](package.json) runs oxlint (`--no-error-on-unmatched-pattern`, so a commit of only ignored files still passes) + oxfmt `--check` on staged `.ts` files (specs are format-checked but not lint-gated, since the general oxlint pass skips `test/**`).
- [`.husky/commit-msg`](.husky/commit-msg) runs `pnpm exec commitlint --edit` to validate the commit message against [Conventional Commits](https://www.conventionalcommits.org) (stock `@commitlint/config-conventional`, see [`commitlint.config.js`](commitlint.config.js)).

---

## Commit conventions & changelog

Commits follow **Conventional Commits** (`type(scope): summary`, e.g. `feat(resolver): …`, `fix(plugin): …`); the `commit-msg` hook rejects non-conforming messages.

```bash
pnpm run commit                # commitizen — interactive prompt for a conforming message
pnpm run changelog             # regenerate CHANGELOG.md from the full history (git-cliff)
pnpm run changelog:unreleased  # prepend just the unreleased section to CHANGELOG.md
```

`pnpm run commit` (commitizen + `cz-conventional-changelog`) is optional — you can write the message by hand. [CHANGELOG.md](CHANGELOG.md) is generated by [git-cliff](https://git-cliff.org) from the history per [`cliff.toml`](cliff.toml).

> **The `changelog` scripts need the `git-cliff` binary on `PATH`** (`cargo install git-cliff`, `brew install git-cliff`, or a prebuilt release). git-cliff is deliberately **not** an npm dependency: the workspace blocks dependency install scripts (`ignoreScripts`), so a postinstall binary downloader could not run. Cutting a release does not require a local binary — CI generates the GitHub Release notes (see [Publishing](#publishing)).

---

## Dev loop — running the Go binary directly

### One-shot (stdio JSON)

```bash
printf '%s\n%s\n' \
  '{"op":"scanFiles","files":["ts-go-runtypes/internal/testfixtures/f17_runtype_id.ts"]}' \
  '{"op":"dump"}' \
  | bin/mion --one-shot --tsconfig ts-go-runtypes/internal/testfixtures/tsconfig.json \
  > cache.json
```

### Daemon (Unix socket — used for HMR scenarios)

```bash
bin/mion --daemon --tsconfig tsconfig.json --socket /tmp/mion.sock
```

### Flags reference

```
--tsconfig PATH               required: path to project tsconfig.json
--cwd PATH                    default: current working directory
--one-shot | --daemon         choose stdio one-shot or socket daemon
--socket PATH                 daemon-only socket path
--out-json PATH               also write cache JSON on dump
--out-modules DIR             also write every per-entry virtual module on dump
--hash-length N               default 7 (all type ids, literals included)
--single-threaded             one pool checker, no concurrency anywhere
--no-parallel-scan            serial marker scan
--no-parallel-render          sequential cache-family renders
```

### Pointing a consumer project at a specific binary (`MION_BIN`)

Outside this repo, `@mionjs/bin`'s `getExePath()` resolves the per-platform `@mionjs/binary-<os>-<arch>` package. **`MION_BIN=<path>` overrides that lookup for every lane** — the bundler plugins (behind their explicit `binary` option, which still wins) *and* the lint plugin, which resolves its binary through the launcher and takes no `binary` option:

```bash
MION_BIN=/abs/path/to/mion pnpm run lint     # in the consumer project
```

Use it to validate an **unpublished** build in a real consumer (packing `RunTypes/{core,devtools,bin}` as `file:` tarballs leaves no platform package to resolve, so the lint lane would otherwise fail), to bisect a resolver regression without editing `node_modules`, or to run a binary delivered out-of-band. A value that is missing, not a file, or not executable throws — a typo never falls through to a different binary.

A lint config can pin the same thing without an env var: **`settings.runtypes.binary`** (alongside `timeoutMs` and `tsconfig`) in `.oxlintrc.json` / `eslint.config.js`. It **wins over `MION_BIN`**, mirroring the bundler lane where an explicit `binary` option beats the launcher, so the full order is `settings.runtypes.binary` → plugin `binary` option → `MION_BIN` → in-repo dev binary → platform package. A configured path that is not there fails the lint run naming the setting. Any OTHER key under `settings.runtypes` (`cwd`, a typo) is ignored, with one warning per run on stderr.

> ⚠️ The resolver's version folds into every typeId, so an override of a different version produces cache entries that diverge from a normal install. Clear `node_modules/.cache/ts-runtypes` when switching back.

---

## pnpm policies (workspace security posture)

All settings live in [pnpm-workspace.yaml](pnpm-workspace.yaml); `.npmrc` is auth/registry only. Putting a pnpm-specific setting in `.npmrc` is silently ignored under pnpm 11.

- `frozenLockfile: true` — install never re-resolves; CI fails loudly on drift.
- `minimumReleaseAge: 43200` (30 days) — refuses to resolve packages younger than 30 days. Enforced on `pnpm add` / `pnpm update` / fresh resolve; locked entries are not re-checked.
- `ignoreScripts: true` — blocks all preinstall/install/postinstall scripts. Per-package allowlist via `allowBuilds: { pkg: true }` (currently `esbuild`).
- `allowNonRegistryProtocols: false` — refuses git/github/file/http specifiers (`workspace:*` is exempt).
- `savePrefix: ''` — `pnpm add` writes exact versions, never `^` or `~`.
- `strictPeerDependencies: true` — peer-dep mismatches fail the install.
- `nodeLinker: hoisted` — flat hoisting (npm-like); security is the lockfile + age policy + ignoreScripts, NOT the linker layout.
- All `dependencies` and `devDependencies` are exact-pinned. Only `@mionjs/devtools` peerDependencies stay as ranges so consumers can dedupe Vite.

Updating deps:

- `pnpm update <pkg> --latest` bumps one package — `minimumReleaseAge` rejects versions <30 days old. Wait, pin to the latest mature version explicitly, or (last resort) add the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
- If pnpm's metadata cache is missing the `time` field and reports `[ERR_PNPM_MISSING_TIME]`, nuke `~/Library/Caches/pnpm/v11/metadata*` and retry.

---

## Bumping the `tsgolint` pin

`tsgolint` (and the `typescript-go` it nests — our TypeScript 7 checker) is a git submodule under [ts-go-runtypes/third_party/tsgolint/](ts-go-runtypes/third_party/tsgolint/). Its revision is declared once in **[ts-go-runtypes/tsgolint.pin.json](ts-go-runtypes/tsgolint.pin.json)** (`{ commit, ref }`) — the single source of truth. The submodule gitlink always encodes the same commit; the two move together. The pin is **not** folded into the package version, so changing it is a normal chore commit, not a release.

**Setup enforces it.** Bootstrap checks the submodule out to `tsgolint.pin.json`'s commit and re-applies the shim patches, so a fresh or drifted clone always lands on the declared revision. To run that on demand (or just verify it):

```bash
pnpm miondevx core ensure-tsgolint            # check the submodule out to the pin + re-apply patches (idempotent)
pnpm miondevx core ensure-tsgolint --check    # verify only; non-zero exit on drift, no mutation
```

**The build warns on drift.** The `bin/mion` freshness check ([scripts/core/build.mjs](scripts/core/build.mjs), run by `pnpm miondevx core build`, `pretest`, and `miondevx verify`) compares the binary to whatever source is checked out — it can't tell a drifted submodule from the pin. So it now also prints a non-fatal warning when the submodule doesn't match `tsgolint.pin.json`, pointing you at `ensure-tsgolint`.

**Bumping moves it.** `bump-tsgolint` advances to a new revision and rewrites the pin + gitlink together:

```bash
pnpm miondevx core bump-tsgolint               # -> latest tsgolint release tag (default)
pnpm miondevx core bump-tsgolint origin/main   # bleeding edge (unreleased main HEAD)
pnpm miondevx core bump-tsgolint v0.24.0       # a specific tag / branch / sha
pnpm miondevx core bump-tsgolint --skip-tests  # build only, skip the go + js suites
```

It fetches, checks out the target, advances the nested `typescript-go`, re-applies the shim patches that ship with that revision, rebuilds `bin/mion`, writes [ts-go-runtypes/tsgolint.pin.json](ts-go-runtypes/tsgolint.pin.json) + the `tsgo` metadata field in [packages/bin/package.json](packages/bin/package.json), and runs the full `go test ./internal/...` + `pnpm test` gate. It **never commits, tags, or pushes** — it prints the `git add … && git commit` line to land it (plus a one-line bump-back to revert). Nothing is committed, so a failed bump is always safe to discard.

The one step that can fail is patch re-application: the patches live inside the tsgolint repo and travel with the pinned rev, so they normally match the `typescript-go` they ship with, but if upstream drifted the command stops with the `git apply --3way --reject` recovery flow (see [Patching](#patching-tsgolints-typescript-go) below).

Doing it by hand? A bump is `git -C …/tsgolint fetch && git checkout <rev>`, then `git -C …/tsgolint submodule update --init typescript-go`, then `git -C …/typescript-go apply --3way ../patches/*.patch`, then update `tsgolint.pin.json`, then `pnpm miondevx core build`, then the two test suites, then commit the moved pointer + pin.

---

## Patching `tsgolint`'s `typescript-go`

The `microsoft/typescript-go` checker does not expose call-site type queries out of the box; our patches in [ts-go-runtypes/third_party/tsgolint/patches/](ts-go-runtypes/third_party/tsgolint/patches/) add the minimal exports we need. **Never edit files under `ts-go-runtypes/third_party/` directly** — only the patch flow is supported.

To add a new patch:

```bash
cd ts-go-runtypes/third_party/tsgolint/typescript-go
# 1. Make changes and commit them in this nested repo.
git commit -m "mion: <description>"

# 2. Produce a portable patch.
git format-patch -1 -o ../patches

# 3. Verify it applies cleanly to a fresh checkout.
git reset --hard HEAD~1
git apply --3way ../patches/*.patch
```

Commit the new `.patch` file under `ts-go-runtypes/third_party/tsgolint/patches/` so other contributors get it on the next `git submodule update`.

---

## Publishing

All three published `RunTypes/*` packages (`@mionjs/run-types`, `@mionjs/devtools`, `@mionjs/bin`) move in lockstep off the single version in [version.json](version.json) (bumped by [scripts/release/bump-version.mjs](scripts/release/bump-version.mjs)).

The `@mionjs/drizzle-orm-{pg,mysql,sqlite}-core` packages ride the SAME release train but a DIFFERENT version line: `<drizzle major>.<drizzle minor>.<own patch>` (`versionLine: "drizzle-orm"` in their package.json marks them; bump-version.mjs never stamps them, and [scripts/release/check-drizzle-versions.mjs](scripts/release/check-drizzle-versions.mjs) guards the version/peer-range/manifest contract in CI). The publish scripts stage them after `@mionjs/run-types`, SKIP any tarball whose exact version is already live (their versions do not bump every release), and stage a tarball older than the live `latest` under a `drizzle-X.Y` dist-tag (a backport never moves `latest` backwards). TWO rules keep that honest, both in [scripts/lib/drizzle-line.mjs](scripts/lib/drizzle-line.mjs): `bump-version.mjs` patch-bumps a dialect package at the release cut ONLY when its own published files (`src/**` minus specs, plus package.json) changed since its last bump — so an untouched package is simply not republished — and the skip-if-live path DOWNLOADS the live tarball and compares the published sources byte-for-byte, so a live version whose bytes no longer match FAILS the release instead of silently shipping nothing. `pnpm miondevx release check-drizzle-versions --changes` lists which dialect packages are due a patch. They take `@mionjs/run-types` as a PEER on the lockstep minor (`>=X.Y.0 <X.(Y+1).0`, re-stamped by the bump), never as a pinned dependency: a pin would hand the consumer a second core copy whose format types are a different brand, AND would change their published manifest on every release. So a lockstep MINOR republishes all three; a patch release leaves an untouched dialect package alone. Their FIRST publish goes through `pnpm miondevx release manual-publish` like any new package name. One post-cutover owner action: `npm deprecate @mionjs/drizzle "Replaced by @mionjs/drizzle-orm-pg-core / -mysql-core / -sqlite-core"` (the old bundled package stays as-is on 0.8.x). `@mionjs/run-types` emits **dual** module output (ESM + CJS: a second `tsc` pass — [tsconfig.cjs.json](packages/run-types/tsconfig.cjs.json) — writes a CommonJS build into `dist/cjs/` with a `type:commonjs` marker, so `require('@mionjs/run-types')` works under the `type:module` root); `@mionjs/devtools` is ESM-only (build-time tooling); `@mionjs/bin` ships hand-written JS + types (no build step).

The native resolver binary is distributed esbuild-style: it is cross-compiled per platform into `@mionjs/binary-<os>-<arch>` packages (each `os`/`cpu`-gated), declared as `optionalDependencies` of `@mionjs/bin`. A consumer installs only the one matching their machine, and `@mionjs/devtools` locates it via `getExePath()`. The publishing host needs the Go toolchain — pure Go (`CGO_ENABLED=0`), so one host cross-compiles every target with no per-platform C toolchain.

> **Versioning:** standard semver on our own release cadence. The pinned tsgo / tsgolint revision is metadata only (the binary's `--version` output + the launcher's `package.json` `tsgo` field), never encoded into the package version.

There are two publish paths, both building the same artifacts in the same dependency-safe order: a **local, interactive** direct publish for a maintainer at a terminal, and the **CI staged** publish that runs on every merge to `prod` (the recommended path — [Releasing through CI](#releasing-through-ci--staged-publishing-npm_token--2fa-approval) below).

### Local (manual) publish

A direct publish from your machine, authenticated with `NPM_TOKEN` (in `.env`) + an interactive OTP:

```bash
pnpm miondevx release preflight   # green-light: fresh install, all tests, lint, build
pnpm miondevx release npm         # interactive: version -> build binaries -> publish
```

[`scripts/release/publish.mjs`](scripts/release/publish.mjs):

1. `npm whoami` check.
2. Working-tree clean check.
3. `node scripts/release/bump-version.mjs <patch|minor|major|X.Y.Z>` (lockstep bump: writes `version.json` + every `package.json`, then commits + tags).
4. [`scripts/release/build-binaries.mjs`](scripts/release/build-binaries.mjs) — cross-compiles the 7-platform matrix and stages `@mionjs/binary-*` + the launcher (its `optionalDependencies` filled, pinned exact-equal) under `dist-binaries/`. (`--host-only` builds just this machine's platform; the drizzle-e2e workflow uses it, a release never does.)
5. Prompts for npm OTP, then publishes the platform packages **first** and the launcher **last** (so the launcher never references a not-yet-published optional dep), then `pnpm publish` for the two FE packages (`@mionjs/bin` is already live by then). `pnpm publish` rewrites their `workspace:*` deps to concrete versions, exactly like the CI pack path.

**Changelog & GitHub Release.** Refresh [CHANGELOG.md](CHANGELOG.md) with `pnpm run changelog` when preparing a release and commit it in the release PR. When the release PR lands on `prod`, [`.github/workflows/publish.yml`](.github/workflows/publish.yml) stages every package to npm (via `NPM_TOKEN` — see below), pushes the `v<version>` tag, then generates that tag's notes with [`orhun/git-cliff-action`](https://github.com/orhun/git-cliff-action) and creates the matching **GitHub Release**. The committed file and the Release notes are produced from the same [`cliff.toml`](cliff.toml).

Unpublish a bad release:

```bash
pnpm miondevx release unpublish <version>
```

### Releasing through CI — staged publishing (`NPM_TOKEN`) + 2FA approval

Merging a release PR into `prod` runs [`publish.yml`](.github/workflows/publish.yml): the full release gate, then it **stages** every package to npm and tags the release. CI holds an automation token that cannot pass a 2FA challenge — CI stages, a human approves. Two pieces compose for this:

- **Token staging** — CI authenticates with `NPM_TOKEN` (an automation/granular token, so the unattended stage isn't 2FA-blocked); the `publish-npm` job writes it to `~/.npmrc`. Provenance is **off by default** — npm refuses provenance from a private source repo, so the job grants `id-token: write` **only** for that optional attestation; once this repo is public, set repo variable `MION_NPM_PROVENANCE=1` to re-enable it (no code change).
- **Staged publishing** — `npm stage publish` uploads to a **stage queue** and needs **no 2FA**, so CI can stage unattended. A maintainer then **approves** each staged version with a **live 2FA challenge** — the one step that cannot be done by a token or any non-interactive path.

The `publish-npm` job only ever runs `npm stage publish` (never a direct `npm publish`), so every CI publish is forced through the stage queue and nothing goes live without a human 2FA approval.

**Approve the staged release (2FA, leaves-first).** `npm stage approve` takes a single `<stage-id>` — there is no atomic/group approval, and approving one publishes **that** package immediately. So order matters: approve **leaves-first** (every `@mionjs/binary-<os>-<arch>` first, then `@mionjs/bin`, then `@mionjs/run-types` + `@mionjs/devtools`), the same order [`publish-tarballs.mjs`](scripts/release/publish-tarballs.mjs) staged in, so a consumer install never resolves a launcher whose platform binary isn't live yet. The helper walks the queue for you: it asks for your 2FA OTP **once** and reuses it while its ~30s window lasts (the registry accepts the same TOTP for rapid consecutive requests), re-prompting only when a code expires — so a 10-package approval typically needs two or three codes, not ten. An empty answer at the prompt falls back to npm prompting per package. After the last approval it waits for npm to actually serve the new version, then auto-dispatches the website deploy (see below):

```bash
pnpm miondevx release stage-approve                # one OTP prompt; approve leaves-first, then auto-deploy the site
pnpm miondevx release stage-approve --dry-run      # print the approval order without approving
pnpm miondevx release stage-approve --no-deploy    # approve only; skip the website-deploy dispatch
pnpm miondevx release stage-approve --deploy-only  # no approvals; wait for npm to serve the version, then dispatch the deploy
```

If the queue can't be read automatically (not logged in, npm too old), the helper prints the exact leaves-first commands to run by hand (`npm stage list`, then `npm stage approve <stage-id>` in order).

**Deploy the docs site.** Staging means "`publish-npm` finished" ≠ "packages live", so the deploy is a separate workflow ([`website-deploy.yml`](.github/workflows/website-deploy.yml), `workflow_dispatch`, `environment: production`) that must run only after the stage-ids are approved. `stage-approve` dispatches it automatically once npm serves the freshly-approved version (a fresh publish lags a little on the registry CDN, so it polls before dispatching; `--no-deploy` skips, `--deploy-only` re-fires a skipped or failed dispatch). The manual path remains as fallback: **Actions → prod · deploy website → Run workflow**, selecting **`prod`** or **`main`** — the deploy pins `--branch=prod` (the Cloudflare Pages production branch), so both refs ship the same live site and the ref decides only which tree gets built. The workflow refuses any other ref. The site builds from the repo (not from an installed npm version), so the optional `version` input is for the run log only. A pre-build guard ([`miondevx release verify-live`](scripts/release/verify-live.mjs)) aborts the deploy unless the checked-out tree matches the **live** npm release (all `RunTypes/*` packages, in lockstep) — so a deploy dispatched from a `main` carrying an unreleased bump, or from `prod` before the stage-ids are approved, fails fast instead of shipping docs for a version nobody can install yet.

**Shipping a docs-only fix between releases.** `main` is a valid deploy ref precisely so a docs or benchmark fix can go live without cutting a version: land it on `main`, leave `version.json` alone, and dispatch the deploy against **`main`**. `verify-live` still passes (the tree's version is the one already live), `publish.yml` never runs (nothing is pushed to `prod`), and no bump or promotion is involved. Do NOT reach for a `main → prod` merge to ship docs — a push to `prod` starts the release train.

Why the `--branch=prod` pin matters: Pages decides production-vs-preview from the branch wrangler reports, and with no flag wrangler reads it from git. Before the pin, a dispatch from anything but `prod` uploaded everything, printed `Deployment complete!`, exited 0 — and served the result at a preview alias, leaving the live site on its previous build. Green, and no deploy.

**First-publish bootstrap (one-time).** npm can't **stage** a package name that has no published version yet, so the very first version of each `RunTypes/*` package must be a plain, live publish before CI's staged path can take over. The initial versions were published manually with `pnpm miondevx release manual-publish` — it builds the ten packages, does an interactive `npm login` (one 2FA challenge for the whole run), then publishes them all **live** and **leaves-first** with `--access public` (`@mionjs/run-types`, `@mionjs/devtools`, `@mionjs/bin`, and the seven `@mionjs/binary-<os>-<arch>`); it's **resumable**, so already-live versions are skipped. Use the same command to bootstrap any new sibling package before its first CI release, and make sure the repo `NPM_TOKEN` secret is set so `publish-npm` can authenticate.

CI runs Node 26; staged publishing needs npm **≥ 11.15.0**. The `publish-npm` job runs `npm install -g npm@latest` to guarantee it.

**Cutting a release (after the bootstrap).** The whole flow is driven end-to-end by the **[release-to-prod skill](.claude/skills/release-to-prod/)** — an agent opens the PRs, watches CI, and fixes failures forward; a maintainer reviews and clicks the merges. The shape:

1. **Bump PR into `main`.** On a branch: `pnpm miondevx release bump <patch|minor|major|X.Y.Z>` ([`bump-version.mjs`](scripts/release/bump-version.mjs) writes `version.json` + every `package.json` and commits `chore(release): v<version>`; delete the local tag it creates — CI tags the `prod` commit itself). Curate `CHANGELOG.md` into the same commit. Lands on `main` via the normal rebase-merge.
2. **Cut `release/vX.Y.Z` from the bumped `main`, then open the release PR from it into `prod`:** `git fetch origin main && git branch release/vX.Y.Z origin/main && git push -u origin release/vX.Y.Z`, then `gh pr create --base prod --head release/vX.Y.Z --title "release: vX.Y.Z"`. The branch is a frozen prefix of `main` (a snapshot, not a live view), so the release scope is fixed at the cut point. [`pre-publish.yml`](.github/workflows/pre-publish.yml) runs the full gate, a `version-fresh` check (red if `version.json` is already live on npm), and `main-ancestor` (red unless the head is an ancestor of `origin/main`). To pull in a fix, land it on `main` first, then re-cut the branch forward: `git branch -f release/vX.Y.Z origin/main && git push --force-with-lease origin release/vX.Y.Z`. Never author a commit on the release branch, and never cherry-pick onto it.
3. **Merge with "Create a merge commit" — never rebase, never squash.** `prod` must advance only by true merge commits of `main`; a rebase/squash breaks the shared ancestry and the next release PR stops being mergeable. [`publish.yml`](.github/workflows/publish.yml)'s first job (`merge-shape`) fails fast on a wrong-method merge and prints the recovery (an empty `main → prod` re-merge PR).
4. `publish.yml` runs the gate again, then **stages** every package to npm (with `NPM_TOKEN`) and tags the release on `prod`. Delete the frozen branch once the tag exists: `git push origin --delete release/vX.Y.Z`.
5. Approve the staged packages with 2FA, leaves-first: `pnpm miondevx release stage-approve` (one OTP prompt, reused while its window lasts). Once npm serves the new version, it **auto-dispatches the website deploy**.
6. Docs deploy fallback — only if step 5 reported `DEPLOY NOT TRIGGERED`: `pnpm miondevx release stage-approve --deploy-only`, or **Actions → prod · deploy website → Run workflow** against the **`prod`** ref (or **`main`**, which deploys the same live site; the `verify-live` guard aborts if the version isn't live on npm yet).

> **One-time (prod ruleset).** The `prod` branch ruleset must require the pre-publish checks as status checks — including **`release head is an ancestor of main`** (the `main-ancestor` job) alongside the gate and `version-fresh` — so a release branch that drifted off `main` cannot merge. Configure it under **Settings → Rules → prod**.

### Pre-publish e2e — `pnpm miondevx release e2e`

Smoke a release the way a consumer would install it — the **published** `RunTypes/*` packages, resolved from a throwaway [verdaccio](https://verdaccio.org) registry, then built + tested through **every** shipped bundler adapter. One script drives it locally and on every CI lane, so they cannot drift:

```bash
pnpm miondevx release e2e            # container backend (default; needs podman)
pnpm miondevx release e2e --pack     # rebuild tarballs/ first (else it reuses them)
```

It packs the tarballs (if `tarballs/` is missing), then runs two axes:

- **Feature matrix, in the container (Linux).** The `tsrt-e2e` image starts **verdaccio inside a rootless container**, publishes the mounted tarballs to its own `:4873`, and a multi-bundler feature library (`container/pre-publish-e2e/apps/`) is built through each adapter's RunTypes plugin — the heavy `build-vite` (Vite-on-Rolldown + oxlint) runs all 13 feature families; `smoke-esbuild` (+ eslint), `smoke-rollup`, `smoke-rolldown`, `smoke-webpack`, `smoke-rspack` each prove their adapter loads, transforms, and its output runs. Tests assert runtime behavior, rewrite evidence, and lint transport over the build output.
- **Per-OS binary smoke, host-native.** A lean vitest fixture (`host-smoke/`) installs the published packages from the port-published `:4873` and runs on **this** OS/arch, so the plugin resolves + spawns the real host-platform binary via `@mionjs/bin`'s optional-dependency model (the one thing no container can substitute).

**Supply-chain point (why the container):** verdaccio and its whole dependency tree run **inside** the rootless container (read-only tarballs mount + a loopback port, nothing else) — **never** installed into your host's node/npm environment. On a dev machine the flow is **container-or-error**: if podman is down it fails with a pointer to the [mion-setup skill](.claude/skills/ts-runtypes-setup/) and never falls back to a host verdaccio. The `host-npx` fallback (on-runner `npx verdaccio`) exists **only** for CI's macOS/Windows runners (which can't run a Linux container) and is guarded by `CI` — it refuses to run locally.

**The receipt — "e2e passed" is a checkable precondition, not a convention.** A PASS writes `tarballs/.e2e-receipt.json`: the version, which backend and halves ran, and a **sha256 per tarball**. [`publish-tarballs.mjs`](scripts/release/publish-tarballs.mjs) (`pnpm miondevx release tarballs`, the CI stage-publish) then REFUSES to publish unless a receipt covers exactly those bytes at this version, so repacking after the gate, or publishing an older `tarballs/`, fails loudly instead of shipping unverified bytes. In CI the receipt rides from the gate's e2e job to the publish job as its own artifact (the tarballs themselves are one artifact packed once, so the bytes are identical end to end). Escape hatch for the first-publish bootstrap and emergencies: `--no-receipt`, or `MION_ALLOW_UNVERIFIED_PUBLISH=1`, which prints a conspicuous warning. Two paths are deliberately NOT gated: `--registry <verdaccio>` (that publish IS part of running the e2e, so requiring its own receipt would be circular) and `miondevx release manual-publish` (the bootstrap rebuilds tarballs by default, invalidating any receipt by construction — it prints whether one is valid and lets you decide).

The e2e is gated in CI by [`release-gate.yml`](.github/workflows/release-gate.yml) (the ubuntu lane uses the container backend; the macOS/Windows lanes use host-npx). The builder toolchains are baked into the `tsrt-e2e` image (`container/pre-publish-e2e/_deps`), so each run installs only the changing `RunTypes/*` — a **republish** of that image (`pnpm miondevx container push e2e`) is required after any change to `container/pre-publish-e2e/{_deps,registry}/` or its Containerfile.

### Post-publish e2e — `pnpm miondevx release e2e --backend npm`

The same suite, but against the **real** registry once a version is **live**. Where the pre-publish backends build + pack + publish tarballs to a throwaway verdaccio, the `npm` backend skips all of that and installs the already-published `RunTypes/*` straight from `registry.npmjs.org` — so it verifies the bytes actually on npm, most importantly the per-OS platform-binary optional-dep chain (`@mionjs/bin` → `@mionjs/binary-<os>-<arch>`) resolving from the real registry.

```bash
pnpm miondevx release e2e --backend npm                 # version.json, matrix + host smoke (matrix needs podman)
pnpm miondevx release e2e --backend npm --no-matrix     # host smoke only (no container)
pnpm miondevx release e2e --backend npm --version 0.9.0 --registry https://registry.npmjs.org
```

It waits for the version to be resolvable (a fresh publish can lag across the registry's CDN), then runs the same two axes — the multi-bundler matrix in the toolchain container (pointed at the real registry, no verdaccio) and the host-native per-OS binary smoke. CI drives it from [`post-publish.yml`](.github/workflows/post-publish.yml), a **manual** `workflow_dispatch` (ubuntu = matrix + smoke, macOS/Windows = host smoke, plus the `linux-arm64`/`linux-arm` binaries exec'd under QEMU). It's manual by design: the release path stage-publishes to npm and a maintainer promotes each package to live with 2FA (`pnpm miondevx release stage-approve`), and there is no CI signal for "stage approved → live" — so run this **after** the stage-ids are approved.

---

## Troubleshooting

| Symptom                                                        | Likely cause                                                                | Fix                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `git apply` fails with "patch does not apply"                  | tsgolint upstream moved                                                     | Resolve manually with `git apply --3way --reject`, then resolve `.rej` files and refresh via `git format-patch`.               |
| `pnpm install` rejects a dependency with "minimum release age" | `pnpm-workspace.yaml` blocks packages <30 days old                          | Wait or add a targeted entry under `minimumReleaseAgeExclude`.                                                                 |
| `pnpm install` fails on a peer dep                             | `strictPeerDependencies: true`                                              | Add the peer to the package's `peerDependencies` or `devDependencies`.                                                         |
| JS plugin tests error spawning the resolver                    | `bin/mion` not built                                             | `pnpm run check:builds` or `go -C ts-go-runtypes build -o ../bin/mion ./cmd/mion`.                       |
| A consumer project's lint lane fails `Unable to resolve @mionjs/binary-<os>-<arch>` | No platform package installed (an unpublished build consumed as `file:` tarballs, a `--no-optional` install, or an air-gapped mirror) | Point the launcher at a binary: `MION_BIN=/abs/path/to/mion` (see [Dev loop](#pointing-a-consumer-project-at-a-specific-binary-rt_bin)). |
| `pnpm run typecheck` errors "cannot find project" / missing reference | New package missing from root `tsconfig.json` `references`            | Add the package path to the root `tsconfig.json`.                                                                              |
| oxlint fails to load with `Plugin 'runtypes' not found`        | Stale/missing `@mionjs/devtools` dist (the `jsPlugins` entry)              | Rebuild it: `pnpm --filter @mionjs/devtools run build` (or `pnpm run check:builds`).                                          |
| Husky hook not firing                                          | `prepare` script did not run                                                | `pnpm install` again, or `pnpm exec husky` to force activation.                                                                |
| `pnpm run changelog` fails: `git-cliff: command not found`     | git-cliff binary not installed (deliberately not an npm dep)                | `cargo install git-cliff` (or `brew install git-cliff` / a prebuilt release). Not needed to cut a release — CI uses `orhun/git-cliff-action`. |
| Commit rejected by `commit-msg` hook                           | Message is not a valid Conventional Commit                                  | Re-commit with `type(scope): summary`, or run `pnpm run commit` for an interactive prompt.                                     |
| `podman machine start` fails with `vfkit exited unexpectedly`  | Rosetta 2 missing on Apple Silicon                                          | `softwareupdate --install-rosetta --agree-to-license`, then re-run `podman machine start`.                                     |
| `@mionjs/devtools` container build fails with garbled errors | Host-arch Go binary mounted into a Linux container                        | The bench script auto-cross-compiles `bin/mion-linux-<arch>`; force a refresh with `pnpm miondevx bench prep`.           |
| Marker package `tsc --build` fails with `Cannot find namespace 'Temporal'` | Missing `esnext.temporal` in the marker `tsconfig.json` `lib`           | Restore the `esnext.temporal` entry — its absence makes tsc skip declaration emit on the offending file, leaving `markers.d.ts` / `createRTFunctions.d.ts` missing and breaking call-site resolution. |
| Bench errors `createValidateFn(): no id injected`                | Stale or partial marker/plugin `dist/` (`.d.ts.map` without `.d.ts`)        | `pnpm run check:builds` — wipes `tsconfig.tsbuildinfo` and rebuilds the affected dist clean. CI never hits this; only fresh-checkout-then-interrupt scenarios do. |

---

## The `miondevx` CLI (internal)

Day-to-day dev, website, benchmark, and publish tasks run through one internal
dispatcher, `pnpm miondevx <command>` ([scripts/miondevx.mjs](scripts/miondevx.mjs)). It is a thin
front door over the same `scripts/*.sh` / `*.mjs` / `vitest` the workflows call —
never a reimplementation. Its entry point builds or verifies the resolver + the dev
dists before every command that needs them (a content stamp keeps that under a
second on a warm tree), so no command ever runs against a stale engine. Run
`pnpm miondevx --help` for the command list and `pnpm miondevx <area> --help` for
the flags.

```bash
pnpm test                        # build if stale, then the whole JS suite
pnpm miondevx core build              # build the resolver + dev dists if stale
pnpm miondevx core fuzz <lane…> [--quick|--soak]   # unit|value|types|nondata|roundtrip|size|cloning|enrich|i18n|typemod|race|sidecar|patterngen|convert|convertcli|all
pnpm miondevx core fuzz-lanes         # the soak lane list as JSON (the soak workflows' matrix source)
pnpm miondevx core smoke              # resolver + devtools end-to-end smoke
pnpm miondevx website dev [--agent]   # hot-reload docs server (:3000, or :3100 --agent)
pnpm miondevx website build [--no-bench] [--quick]   # build the docs site
pnpm miondevx website check --static  # serve the built site + assert the benchmark pages render
pnpm miondevx bench [--one <name>|--full|--website] [--quick]   # benchmarks
pnpm miondevx verify                  # lint + typecheck + format check
pnpm miondevx fmt [--check]           # format (oxfmt + prettier + gofmt)
pnpm miondevx clean [--keep-deps|--dry-run|--deep]   # hard clean; --deep reinstalls after
pnpm miondevx codegen all --check     # regenerate Go→TS mirrors, fail on drift
pnpm miondevx publish [--dry-run]     # preflight -> npm -> website (interactive)
```

## Workspace command cheatsheet

```bash
pnpm ls -r --depth -1                        # list workspace packages
pnpm --filter @mionjs/run-types run <script>       # run a script in one package
pnpm --filter @mionjs/run-types <cmd>              # equivalent
pnpm -r run <script>                         # run in every workspace package (topo order)
```
