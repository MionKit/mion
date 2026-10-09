# Setup steps

What each [SKILL.md](SKILL.md) step does. Read when a step fails or before editing `setup.sh`.

## 1. setup.sh

Order of `main`. Each step skips when already satisfied.

1. Host deps: missing podman / Node / pnpm / Go → install via detected package manager.
   - macOS → Homebrew. Linux → first found of apt, dnf, pacman, zypper.
   - Minimums: [SETUP.md](../../../SETUP.md#prerequisites).
   - Go present but below min → ERROR, never auto-upgrade.
     Install source unknown, and the active `go` may sit elsewhere on PATH.
   - Not relied on: Go `GOTOOLCHAIN=auto` fetching the `go.mod` toolchain. Active Go must be ≥ min.
2. Podman engine unreachable:
   - Linux → warning only (check the podman service).
   - macOS Apple Silicon → Rosetta 2 first: `softwareupdate --install-rosetta --agree-to-license` when missing.
     `vfkit` (podman-machine backend) needs it, silently exits 1 without.
   - macOS → `podman machine init` (no machine yet) + `podman machine start`.
3. Submodules: see [Submodules](#submodules).
4. Patches: `ts-go-runtypes/third_party/tsgolint/patches/*.patch` → `typescript-go` tree via `git apply --3way`.
   - Per patch `git apply --reverse --check` first: passes = already applied → skip. Safe re-run.
5. tsgolint pin: `scripts/core/ensure-tsgolint.mjs` (`--check` in check mode).
6. `pnpm install --frozen-lockfile` if workspace `node_modules` missing.
7. husky hooks: `pnpm exec husky` (`ignoreScripts: true` blocks auto-wiring). Failure non-fatal: CI still gates.
8. Go resolver binary → `mion-bin/mion`. Skips if newer than every file under `cmd/` + `internal/`.
9. `packages/devtools/dist`: marker package typecheck consumes it. Needed for `pnpm test` + both smokes.
10. `.env` from `.env.sample` if missing, then `pnpm run check:env` prints env-var status.
    - `.env` DEV-ONLY: git-ignored, never loaded in CI. CI secrets (`NPM_TOKEN`, `CLOUDFLARE_*`) live in GitHub.
    - Basic dev needs no env vars. `GHCR_PAT`: pushing the shared images, pulling private ones (`tsrt-e2e`).

## Submodules

- Two-step non-recursive init: `ts-go-runtypes/third_party/tsgolint`, then `typescript-go` inside it.
- ⚠️ NEVER `--recursive`: fetches the 620MB `typescript-go/_submodules/TypeScript` (original microsoft/TypeScript).
- That corpus feeds only `typescript-go`'s conformance runner (`internal/testrunner`), never `go build ./cmd/mion`.
- Checker lib `.d.ts` files are committed in `typescript-go/internal/bundled/libs`, baked in via `go:embed`.
- Verified safe: binary builds + full `go test ./internal/...` passes without the corpus.
- Clone rejected → retry with `GIT_CONFIG_GLOBAL=/dev/null`.
  - Why: managed hosts (e.g. Claude Code on the web) inject a git `insteadOf` routing `github.com` through a
    credential proxy scoped to THIS repo → 403 on the PUBLIC tsgolint submodule.
  - Egress proxy itself allows `github.com` → bypass clones over direct HTTPS.
  - CA bundle + HTTPS proxy still come from env (`GIT_SSL_CAINFO` / `HTTPS_PROXY`).
  - Normal host succeeds on the first try, never reaches the retry.

## 2. `pnpm miondevx core smoke`

Go resolver binary + vite plugin wiring ([scripts/core/smoke.mjs](../../../scripts/core/smoke.mjs)).

- Spawns `mion-bin/mion` in `--inline-server` mode.
- Three in-memory fixtures: `getRunTypeId<T>()` static, `getRunTypeId(v)` reflect,
  `createValidateFn<T>()` (`InjectTypeFnArgs` createX path).
- Per fixture: resolver `transform()` (what the plugin's transform hook drives) must return a Site.
- Then `scanFiles` with `includeEntryModules: true`: a Site per fixture + at least one rendered entry module.
- `miondevx` runs `check:builds` first: rebuilds Go binary, marker dist, plugin dist when stale or partly emitted.
  So the smoke works standalone.
- ~1s when healthy. Exits 0/1.

## 3. `pnpm miondevx website check`

- Readies the website podman image, then runs the dev server.
- Images are deps-only, published to GHCR.
- `ensureImage` ([image.mjs](../../../scripts/container/image.mjs)) PULLS `ghcr.io/mionkit/tsrt-website:latest`
  by default (`ghcrTryPullRetag`, no-op when current).
- Registry unreachable → local image / local build.
- `MION_WEBSITE_USE_LOCAL=1` → build / use a local image instead (offline or maintainer runs).
- Dev server runs detached in a `tsrt-website-smoke` container.
- Probes `/` inside the container for HTTP 200 + `<title>...</title>`.
  90s timeout, override with `MION_WEBSITE_SMOKE_TIMEOUT`.
- Then stops + removes the container. Exits 0/1.

## 4. `pnpm miondevx bench smoke`

- `ensurePrereqs` ([bench.mjs](../../../scripts/website/bench-data/bench.mjs)) rebuilds what is stale:
  host Go binary, Linux cross-binary `mion-bin/mion-linux-<arch>`, marker dist, plugin dist.
- Readies the shared image: PULLS `ghcr.io/mionkit/tsrt-website:latest` by default.
  `MION_VALIDATION_BENCH_USE_LOCAL=1` → local build.
- Bench source bind-mounted at run time.
- Container build (`pnpm run build`) exercises resolver binary (via vite plugin) and bench sources end to end.
- Exits 0/1. Skips the full bench loop (minutes): run `pnpm miondevx bench` after.
