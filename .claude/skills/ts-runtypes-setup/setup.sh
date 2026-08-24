#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup.sh - ts-runtypes autonomous setup for the containerized apps (docs
# website + benchmarks).
#
# This script lands the repo in a runnable state without user intervention:
#   1. Checks the OS + package manager.
#   2. Installs missing host deps (podman, Node, pnpm, Go).
#   3. macOS: ensures the podman VM exists and is started.
#   4. Bootstraps the tsgolint + typescript-go submodules.
#   5. Applies the tsgolint patches to the working tree (idempotent).
#   6. Runs `pnpm install --frozen-lockfile` if node_modules is stale.
#   7. Wires husky's git commit hooks (ignoreScripts blocks the auto-install).
#   8. Builds the Go resolver binary at bin/ts-runtypes.
#   9. Builds the ts-runtypes-devtools dist (consumers depend on it).
#
# After this, the smoke checks (`pnpm rtx dev smoke`,
# `pnpm rtx website check`, `pnpm rtx bench smoke`) verify the binary +
# plugin wiring AND the containers actually build + run end-to-end.
#
# Architecture:
#   setup.sh             <- this file: orchestrates everything end-to-end.
#   lib/common.sh        <- shared helpers (bold/ok/warn/err, version_ge,
#                           check_dep, PM-agnostic pnpm + Go-tarball fallbacks).
#   pm/<pm>.sh           <- per-package-manager installers. Each defines
#                           install_podman / install_node / install_pnpm /
#                           install_go and sets PM_NAME.
#
# Supported:
#   macOS  -> pm/brew.sh
#   Linux  -> pm/apt.sh | pm/dnf.sh | pm/pacman.sh | pm/zypper.sh (first match)
#
# Supported tool versions (kept in sync with CLAUDE.md -> "Containerized apps"):
#   podman >= 4.0    both apps (container runtime)
#   Node   >= 26     benchmarks host build (root package.json engines)
#   pnpm   >= 11     monorepo workspace policies (packageManager pnpm@11.1.1)
#   Go     >= 1.26   benchmarks resolver binary (go.mod)
#
# Usage:
#   bash .claude/skills/ts-runtypes-setup/setup.sh           # autonomous setup
#   bash .claude/skills/ts-runtypes-setup/setup.sh --check    # report only
#
# Exit codes:
#   0  ok
#   1  a required install / bootstrap step failed
#   3  unsupported OS or no supported package manager
# -----------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PODMAN_MIN=4.0
NODE_MIN=26
PNPM_MIN=11
GO_MIN=1.26
GO_INSTALL_VERSION=1.26.0 # used only when Go is absent on Linux and tarball is fetched

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

OS="$(uname -s)"
ARCH="$(uname -m)"
SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
FAILED=0

# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/common.sh"

# Pick the package-manager module to source. Echoes the basename (no .sh).
# Returns non-zero if no supported PM is present.
detect_pm() {
  case "$OS" in
    Darwin) echo "brew"; return 0 ;;
    Linux)
      if   command -v apt-get >/dev/null 2>&1; then echo "apt"
      elif command -v dnf     >/dev/null 2>&1; then echo "dnf"
      elif command -v pacman  >/dev/null 2>&1; then echo "pacman"
      elif command -v zypper  >/dev/null 2>&1; then echo "zypper"
      else return 1; fi
      ;;
    *) return 1 ;;
  esac
}

# Apple Silicon's vfkit (the macOS podman-machine backend) requires Rosetta 2.
# No-op on Intel Macs and on Linux. Idempotent.
ensure_rosetta_macos() {
  [ "$OS" = Darwin ] || return 0
  [ "$ARCH" = arm64 ] || return 0
  if arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
    ok "Rosetta 2 present"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "Rosetta 2 missing - re-run without --check to install (needed by vfkit)"
    return 0
  fi
  bold "Installing Rosetta 2 (required by the podman-machine vfkit backend)"
  if softwareupdate --install-rosetta --agree-to-license >/dev/null 2>&1; then
    ok "Rosetta 2 installed"
  else
    err "softwareupdate --install-rosetta failed"
    FAILED=1
    return 1
  fi
}

# Ensure the podman engine is reachable. On macOS that means a VM exists and is
# running; on Linux the daemon should respond directly.
ensure_podman_engine() {
  command -v podman >/dev/null 2>&1 || return 0  # podman missing - check_dep handled it
  if podman info >/dev/null 2>&1; then ok "podman engine reachable"; return 0; fi
  if [ "$OS" != Darwin ]; then
    warn "podman engine not reachable - check that the podman service is up"
    return 0
  fi
  ensure_rosetta_macos || return 1
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "podman engine not reachable - re-run without --check to init/start the VM"
    return 0
  fi
  if ! podman machine list --format '{{.Name}}' 2>/dev/null | grep -q .; then
    bold "Initializing podman machine (one-time, ~1 min)"
    podman machine init || { err "podman machine init failed"; FAILED=1; return 1; }
  fi
  if ! podman machine list --format '{{.Running}}' 2>/dev/null | grep -qi true; then
    bold "Starting podman machine"
    podman machine start || { err "podman machine start failed"; FAILED=1; return 1; }
  fi
  if podman info >/dev/null 2>&1; then ok "podman engine reachable"
  else err "podman engine still unreachable after machine start"; FAILED=1; fi
}

# Initialize the tsgolint submodule (which itself nests typescript-go).
#
# NOT --recursive on purpose: typescript-go nests a third submodule,
# _submodules/TypeScript (the 620MB original microsoft/TypeScript). That corpus
# feeds only typescript-go's OWN conformance test runner (internal/testrunner) -
# never our `go build ./cmd/ts-runtypes`, whose checker + lib .d.ts files are
# committed in typescript-go/internal/bundled/libs and baked in via go:embed.
# Skipping it saves the bulk of the clone (verified: the binary builds and the
# full `go test ./internal/...` suite passes with the corpus absent).
ensure_submodules() {
  local tsgolint_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint"
  local tsgo_dir="$tsgolint_dir/typescript-go"
  if [ -f "$tsgolint_dir/go.mod" ] && { [ -d "$tsgo_dir/.git" ] || [ -f "$tsgo_dir/.git" ]; }; then
    ok "submodules present (tsgolint + typescript-go)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "submodules not initialized - re-run without --check to bootstrap"
    return 0
  fi
  bold "Initializing submodules (tsgolint + typescript-go; skipping the 620MB TypeScript corpus)"
  # Non-recursive, two steps: tsgolint, then typescript-go INSIDE it. No
  # --recursive, so the nested _submodules/TypeScript is never fetched.
  _init_submodules() {
    ( cd "$REPO_DIR" && git submodule update --init ts-go-runtypes/third_party/tsgolint ) &&
    ( cd "$tsgolint_dir" && git submodule update --init typescript-go )
  }
  if _init_submodules; then
    ok "submodules ready (deep TypeScript corpus skipped)"
    return 0
  fi
  # Some managed environments (e.g. Claude Code on the web) inject a git
  # http.insteadOf that reroutes github.com through a credential proxy scoped to
  # THIS repo, which 403s on the PUBLIC tsgolint submodule. The egress proxy
  # itself allows github.com, so retry with the injected global gitconfig
  # disabled: the submodule then clones over direct HTTPS. The CA bundle and the
  # HTTPS proxy still come from env vars (GIT_SSL_CAINFO / HTTPS_PROXY), so TLS
  # keeps working. A normal host never reaches this branch (the first attempt
  # succeeds with its global gitconfig intact).
  warn "git submodule update failed - retrying with the injected git-proxy rewrite bypassed"
  if ( export GIT_CONFIG_GLOBAL=/dev/null; _init_submodules ); then
    ok "submodules ready (direct-HTTPS bypass, deep TypeScript corpus skipped)"
    return 0
  fi
  err "git submodule update failed (direct and proxy-bypass attempts)"
  FAILED=1
  return 1
}

# Apply the tsgolint patches to the typescript-go working tree. Idempotent: if a
# patch already applies in reverse it is considered applied and skipped.
apply_tsgolint_patches() {
  local tsgo_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/typescript-go"
  local patches_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/patches"
  [ -d "$tsgo_dir" ] || { warn "typescript-go submodule missing - skipping patches"; return 0; }
  [ -d "$patches_dir" ] || { warn "patches/ missing - skipping"; return 0; }

  local patches=("$patches_dir"/*.patch)
  [ -e "${patches[0]}" ] || { ok "no tsgolint patches to apply"; return 0; }

  local needs_apply=()
  local already=0
  local broken=0
  for p in "${patches[@]}"; do
    if ( cd "$tsgo_dir" && git apply --reverse --check "$p" >/dev/null 2>&1 ); then
      already=$((already+1))
    elif ( cd "$tsgo_dir" && git apply --check "$p" >/dev/null 2>&1 ); then
      needs_apply+=("$p")
    elif ( cd "$tsgo_dir" && git apply --3way --check "$p" >/dev/null 2>&1 ); then
      needs_apply+=("$p")
    else
      err "patch $(basename "$p") neither applies cleanly nor in reverse"
      broken=$((broken+1))
    fi
  done

  if [ "$broken" -gt 0 ]; then
    err "$broken tsgolint patch(es) cannot be applied or reversed; resolve manually"
    FAILED=1
    return 1
  fi

  if [ "${#needs_apply[@]}" -eq 0 ]; then
    ok "tsgolint patches already applied ($already)"
    return 0
  fi

  if [ "$CHECK_ONLY" = 1 ]; then
    warn "${#needs_apply[@]} tsgolint patch(es) need applying - re-run without --check"
    return 0
  fi

  bold "Applying ${#needs_apply[@]} tsgolint patch(es) to typescript-go working tree"
  for p in "${needs_apply[@]}"; do
    ( cd "$tsgo_dir" && git apply --3way "$p" ) \
      || { err "git apply failed on $(basename "$p")"; FAILED=1; return 1; }
  done
  ok "tsgolint patches applied"
}

# Install workspace deps if node_modules is missing or pnpm-lock changed.
install_workspace_deps() {
  command -v pnpm >/dev/null 2>&1 || { warn "pnpm missing - cannot install deps"; return 0; }
  if [ -d "$REPO_DIR/node_modules" ] && [ -f "$REPO_DIR/node_modules/.modules.yaml" ]; then
    ok "workspace node_modules present (skipping install)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "workspace deps not installed - re-run without --check"
    return 0
  fi
  bold "Running pnpm install --frozen-lockfile"
  ( cd "$REPO_DIR" && pnpm install --frozen-lockfile ) \
    || { err "pnpm install failed"; FAILED=1; return 1; }
  ok "workspace deps installed"
}

# Wire husky's git hooks so commits are checked locally (commit-msg -> commitlint,
# pre-commit -> lint-staged). Separate from install: `ignoreScripts: true` blocks
# husky's `prepare` from auto-running, and core.hooksPath is per-clone local state
# that is never cloned. Idempotent (skips when already wired) and non-fatal: CI's
# commitlint job still gates PRs even if local wiring fails.
wire_husky() {
  command -v pnpm >/dev/null 2>&1 || { warn "pnpm missing - cannot wire husky hooks"; return 0; }
  if [ "$(git -C "$REPO_DIR" config --get core.hooksPath 2>/dev/null || true)" = ".husky/_" ]; then
    ok "husky git hooks already wired"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "husky git hooks not wired - re-run without --check (or run: pnpm exec husky)"
    return 0
  fi
  bold "Wiring husky git hooks (pnpm exec husky)"
  ( cd "$REPO_DIR" && pnpm exec husky ) \
    || { warn "husky wiring failed - commits won't be checked locally (CI still gates)"; return 0; }
  ok "husky git hooks wired (commit-msg -> commitlint, pre-commit -> lint-staged)"
}

# Build the Go resolver binary at bin/ts-runtypes. Skips when up-to-date
# relative to the Go sources.
build_go_binary() {
  command -v go >/dev/null 2>&1 || { warn "go missing - skipping binary build"; return 0; }
  local bin="$REPO_DIR/bin/ts-runtypes"
  if [ -x "$bin" ] && [ -z "$(find "$REPO_DIR/ts-go-runtypes/cmd" "$REPO_DIR/ts-go-runtypes/internal" -type f -newer "$bin" -print -quit 2>/dev/null)" ]; then
    ok "Go binary up-to-date (bin/ts-runtypes)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "Go binary missing or stale - re-run without --check"
    return 0
  fi
  bold "Building Go binary -> bin/ts-runtypes"
  ( cd "$REPO_DIR/ts-go-runtypes" && go build -o "$REPO_DIR/bin/ts-runtypes" ./cmd/ts-runtypes ) \
    || { err "go build failed"; FAILED=1; return 1; }
  ok "Go binary built"
}

# Build ts-runtypes-devtools dist. The marker package's typecheck consumes the
# plugin's published .d.ts so the dist must exist for tests + smokes to pass.
build_vite_plugin() {
  command -v pnpm >/dev/null 2>&1 || return 0
  local dist="$REPO_DIR/packages/ts-runtypes-devtools/dist/index.js"
  if [ -f "$dist" ] && [ -z "$(find "$REPO_DIR/packages/ts-runtypes-devtools/src" -type f -newer "$dist" -print -quit 2>/dev/null)" ]; then
    ok "ts-runtypes-devtools dist up-to-date"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "ts-runtypes-devtools dist missing or stale - re-run without --check"
    return 0
  fi
  bold "Building ts-runtypes-devtools"
  ( cd "$REPO_DIR" && pnpm --filter @ts-runtypes/devtools run build ) \
    || { err "ts-runtypes-devtools build failed"; FAILED=1; return 1; }
  ok "ts-runtypes-devtools dist built"
}

# Create the dev .env (from .env.sample) if missing, then report env-var status.
# .env is DEV-ONLY (git-ignored, never in CI); CI secrets (NPM_TOKEN, CLOUDFLARE_*)
# are set in GitHub. Basic dev needs no env vars; GHCR_PAT is only for pushing the
# shared image. Non-fatal - this just gives the dev a filled-in starting point.
setup_env() {
  if [ "$CHECK_ONLY" = 1 ]; then
    node "$REPO_DIR/scripts/rt.mjs" env || true
    return 0
  fi
  if [ -f "$REPO_DIR/.env" ]; then
    ok ".env present"
  else
    ( cd "$REPO_DIR" && node scripts/rt.mjs env --create-env )
  fi
  node "$REPO_DIR/scripts/rt.mjs" env || true
}

main() {
  case "$OS" in
    Linux|Darwin) ;;
    *)
      bold "ts-runtypes setup"
      err "This skill is not ready for '$OS'. Supported platforms: Linux and macOS."
      err "Install podman/Node/pnpm/Go manually, then use pnpm rtx website & pnpm rtx bench."
      exit 3
      ;;
  esac

  local pm
  if ! pm="$(detect_pm)"; then
    bold "ts-runtypes setup - $OS ($ARCH)"
    err "No supported package manager found on this $OS host."
    err "Supported: macOS (Homebrew), Linux (apt, dnf, pacman, zypper)."
    exit 3
  fi

  # shellcheck disable=SC1090
  . "$SCRIPT_DIR/pm/$pm.sh"

  bold "ts-runtypes setup - $OS ($ARCH) via $PM_NAME$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"

  bold "Required for the docs website + benchmarks"
  check_dep podman "$PODMAN_MIN" "podman --version | awk '{print \$3}'" 1

  bold "Required for the benchmarks (host build via 'pnpm rtx bench prep')"
  check_dep node "$NODE_MIN" "node --version | tr -d v" 0
  check_dep pnpm "$PNPM_MIN" "pnpm --version" 0
  check_go "$GO_MIN"

  bold "Container engine"
  ensure_podman_engine

  bold "Submodules + tsgolint patches"
  ensure_submodules
  apply_tsgolint_patches
  bold "tsgolint pin"
  if ! command -v node >/dev/null 2>&1; then
    warn "node not found - skipping tsgolint pin check"
  elif [ "$CHECK_ONLY" = 1 ]; then
    node "$REPO_DIR/scripts/core/ensure-tsgolint.mjs" --check || warn "submodule not at the pinned tsgolint revision (re-run without --check to repair)"
  elif node "$REPO_DIR/scripts/core/ensure-tsgolint.mjs"; then
    ok "submodule matches the pinned tsgolint revision"
  else
    err "tsgolint pin enforcement failed"; FAILED=1
  fi

  bold "Workspace deps + project build"
  install_workspace_deps
  wire_husky
  build_go_binary
  build_vite_plugin

  bold "Local env (.env, dev only)"
  setup_env

  bold "Next steps (from the repo root)"
  if [ "$CHECK_ONLY" = 1 ]; then
    echo "  bash .claude/skills/ts-runtypes-setup/setup.sh   # run autonomous setup"
  else
    echo "  pnpm rtx dev smoke         # binary + plugin wiring smoke (~1s)"
    echo "  pnpm rtx website check    # build image + boot dev server + curl :3000 + stop"
    echo "  pnpm rtx bench smoke      # build image + vite-build the benchmark in-container"
    echo "  pnpm rtx website dev      # docs site -> http://localhost:3000"
    echo "  pnpm rtx bench            # full validation benchmark"
    echo "  pnpm rtx bench typecost   # type-checking-cost benchmark"
    if [ "$OS" = Darwin ]; then
      echo "  (macOS: RT_WEBSITE_POLL=1 pnpm rtx website dev  for reliable hot reload)"
    fi
  fi

  if [ "$FAILED" = 0 ]; then
    bold "Setup OK."
  else
    bold "Setup incomplete - see ERR above."
    exit 1
  fi
}

main "$@"
