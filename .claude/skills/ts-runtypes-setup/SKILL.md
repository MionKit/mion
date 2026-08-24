---
name: ts-runtypes-setup
description: End-to-end autonomous setup for **RunTypes**. Installs host deps (podman, Node, pnpm, Go), starts the podman engine, bootstraps the tsgolint + typescript-go submodules + patches, installs workspace deps, builds the Go resolver binary + ts-runtypes-devtools, then smoke-tests the docs website container (curl :3000) and the benchmarks container (vite build inside). Use when setting up / bootstrapping RunTypes, installing podman for it, or verifying the containerized apps are runnable. Supports Linux and macOS; prints a not-ready message on other OSes. Specific to RunTypes - NOT a generic project setup (the rest of the monorepo needs only pnpm).
---

# RunTypes setup (docs website + benchmarks containers)

This skill is the automated path through the project's setup document. The full
human-readable reference lives in [SETUP.md](../../../SETUP.md) - prereqs,
bootstrap, build, test, lint, dev loop, containerized apps, publishing,
troubleshooting. This skill drives the install + bootstrap + verification
steps end-to-end so the user does not have to follow SETUP.md by hand.

## How the skill runs (autonomous flow)

Run these four commands from the repo root, in order. Stop and surface errors
to the user the first time any step exits non-zero.

```bash
bash .claude/skills/ts-runtypes-setup/setup.sh   # 1. host deps + project bootstrap
pnpm rtx dev smoke                                # 2. Go binary + vite plugin wiring smoke
pnpm rtx website check                            # 3. docs website smoke
pnpm rtx bench smoke                              # 4. benchmarks smoke
```

After all four pass, the repo is ready: `pnpm rtx website dev`,
`pnpm rtx bench`, and `pnpm test` will all work.

### What each step does

**1. `setup.sh`** ([setup.sh](setup.sh)) - the heavy lifter. Each sub-step is
idempotent and skips when already satisfied:

- Checks + installs missing host deps (podman, Node, pnpm, Go) via the detected
  package manager (Homebrew on macOS; apt/dnf/pacman/zypper on Linux). Version
  minimums are defined in [SETUP.md](../../../SETUP.md#prerequisites).
- **macOS Apple Silicon only:** installs Rosetta 2 via `softwareupdate
  --install-rosetta --agree-to-license` when missing - the podman-machine
  `vfkit` backend needs it and silently exits 1 without it.
- **macOS only:** if the podman engine is unreachable, runs `podman machine
  init` (when no machine exists) + `podman machine start`.
- Initializes the `ts-go-runtypes/third_party/tsgolint` submodule + its nested
  `typescript-go` submodule with a **non-recursive** two-step init (tsgolint,
  then `typescript-go` inside it) — deliberately NOT `--recursive`, so the
  620MB corpus nested one level deeper (`typescript-go/_submodules/TypeScript`,
  the original microsoft/TypeScript) is never fetched. That corpus feeds only
  `typescript-go`'s own conformance test runner (`internal/testrunner`), never
  our `go build ./cmd/ts-runtypes` — the checker's lib `.d.ts` files are
  committed in `typescript-go/internal/bundled/libs` and baked into the binary
  via `go:embed`. Skipping it is verified safe (the binary builds and the full
  `go test ./internal/...` suite passes without it) and saves the bulk of the
  clone. If the clone is rejected, it retries with `GIT_CONFIG_GLOBAL=/dev/null`:
  some managed environments (e.g. Claude Code on the web) inject a git
  `insteadOf` that routes `github.com` through a credential proxy scoped to THIS
  repo, which 403s on the PUBLIC tsgolint submodule. Disabling the injected
  global gitconfig clones the public submodule over direct HTTPS (the CA bundle
  + HTTPS proxy still come from env vars, so TLS keeps working); a normal host
  succeeds on the first attempt and never reaches the retry.
- Applies the `ts-go-runtypes/third_party/tsgolint/patches/*.patch` set to the
  `typescript-go` working tree with `git apply --3way`. For each patch it
  first tries `git apply --reverse --check` to detect "already applied" and
  skip - the step is safe to re-run.
- Runs `pnpm install --frozen-lockfile` if workspace `node_modules` is missing.
- Builds the Go resolver binary at `bin/ts-runtypes` (skips if newer than
  every file under `cmd/` + `internal/`).
- Builds `packages/ts-runtypes-devtools/dist` (the marker package's typecheck
  consumes it; required for `pnpm test` and both smokes).
- Creates the dev `.env` from `.env.sample` if missing, then runs
  `pnpm run check:env` to report env-var status. `.env` is DEV-ONLY (git-ignored,
  never loaded in CI); basic dev needs no env vars, `GHCR_PAT` is only for pushing
  the shared image, and CI secrets (`NPM_TOKEN`, `CLOUDFLARE_*`) are set in GitHub.

Pass `--check` to report status only, never install or build anything.

Exit codes: `0` ok / `1` a required install or bootstrap step failed / `3`
unsupported OS or no supported package manager.

**2. `pnpm rtx dev smoke`** - end-to-end smoke for the Go resolver
binary + vite plugin wiring ([scripts/core/smoke.mjs](../../../scripts/core/smoke.mjs)).
Spawns `bin/ts-runtypes` in `--inline-server` mode, installs three tiny
in-memory fixtures (`getRunTypeId<T>()` static, `getRunTypeId(v)` reflect,
`createValidateFn<T>()` to exercise the `InjectTypeFnArgs` createX path), runs
the plugin's `rewrite()` over each, then calls `scanFiles` with
`includeEntryModules: true` and asserts the resolver returned a Site per
fixture and at least one rendered entry module. `rt dev smoke` first runs
`check:builds`, which auto-rebuilds the Go binary, the marker dist, and the
vite plugin dist when any is stale or partially emitted, so the smoke is
usable standalone.
Runs in ~1s when healthy. Exits 0/1.

**3. `pnpm rtx website check`** - readies the website podman image then runs the
dev server. The images are **deps-only** and published to GHCR, so by default
`scripts/container/image.mjs:ensure_image` PULLS the latest `ghcr.io/mionkit/tsrt-website:latest`
(`ghcr_try_pull_retag`; cheap no-op when already current), falling back to a
local image / local build when the registry is unreachable. It then runs the dev
server detached in a `tsrt-website-smoke` container, polls `http://localhost:3000`
for HTTP 200 + a `<title>...</title>` response (90s timeout, override with
`RT_WEBSITE_SMOKE_TIMEOUT`), then stops + removes the container. Exits 0/1.
(`RT_WEBSITE_USE_LOCAL=1` builds/uses a local image instead of pulling - for offline
or maintainer runs.)

**4. `pnpm rtx bench smoke`** - via `scripts/website/bench-data/bench.mjs:ensure_prereqs`,
self-syncs the host Go binary, the Linux cross-binary (`bin/ts-runtypes-linux-<arch>`),
the marker dist and the plugin dist (rebuilds whichever is stale), and readies
the shared image (PULLS `ghcr.io/mionkit/tsrt-website:latest` by default;
`RT_BENCH_USE_LOCAL=1` to build locally). The benchmark source is bind-mounted at
run time, so the container build (`pnpm run build`) exercises both the resolver
binary (via the vite plugin) and the benchmark sources end-to-end. Exits 0/1.
Skips the full bench loop (which takes minutes); for that, run `pnpm rtx bench`
afterwards.

## Layout

```
.claude/skills/ts-runtypes-setup/
  setup.sh             # orchestrates deps + bootstrap + build
  lib/common.sh        # bold/ok/warn/err, version_ge, check_dep, fallbacks
  pm/brew.sh           # macOS Homebrew installers
  pm/apt.sh            # Debian/Ubuntu installers
  pm/dnf.sh            # Fedora/RHEL/CentOS Stream installers
  pm/pacman.sh         # Arch installers
  pm/zypper.sh         # openSUSE installers
```

Each `pm/<pm>.sh` defines `install_podman` / `install_node` / `install_pnpm` /
`install_go` and sets `PM_NAME`. Version minimums for each tool are defined in
[SETUP.md](../../../SETUP.md#prerequisites) - keep `setup.sh`'s
version constants in sync.

## Platform support

- **Linux** - verified (podman 4.9.3 via apt; other distros use dnf/pacman/zypper).
- **macOS** - supported: installs via Homebrew, manages the `podman machine` VM
  (`init` if missing, `start` if down). For long dev sessions use
  `RT_WEBSITE_POLL=1 pnpm rtx website dev` (VM file-watch needs polling).
- **Any other OS** - the script prints a not-ready message and exits `3`.

## Notes

- Behind a corporate / MITM proxy: pass the proxy CA + host network as documented
  in [SETUP.md](../../../SETUP.md#containerized-apps-docs-website--benchmarks).
- Go auto-install on Linux drops Go in `/usr/local/go`; add `/usr/local/go/bin`
  to PATH if it wasn't already.
- macOS first-time `podman machine init` downloads a Linux VM image (~1 min);
  the skill prints "Initializing podman machine" so the wait is explicit.
- Submodule re-bootstrap is safe: the patch step detects already-applied
  patches via `git apply --reverse --check` and skips them.
- Troubleshooting table (Rosetta, podman machine, patch failures, marker
  Temporal typecheck) lives in [SETUP.md](../../../SETUP.md#troubleshooting).
