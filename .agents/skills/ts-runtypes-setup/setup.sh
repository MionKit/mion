#!/usr/bin/env bash
# setup.sh: mion host bootstrap (deps, podman engine, submodules + patches, install, hooks, builds, .env).
# Usage: bash .agents/skills/ts-runtypes-setup/setup.sh [--check]   (--check = report only, never install)
# Exit: 0 ok, 1 a required install / bootstrap step failed, 3 unsupported OS or no supported package manager.
# Version minimums mirror SETUP.md#prerequisites; keep both in sync.
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

# shellcheck disable=SC1090
for lib in common host tsgolint project finish; do . "$SCRIPT_DIR/lib/$lib.sh"; done

main() {
  case "$OS" in
    Linux|Darwin) ;;
    *)
      bold "mion setup"
      err "This skill is not ready for '$OS'. Supported platforms: Linux and macOS."
      err "Install podman/Node/pnpm/Go manually, then use pnpm miondevx website & pnpm miondevx bench."
      exit 3
      ;;
  esac

  local pm
  if ! pm="$(detect_pm)"; then
    bold "mion setup - $OS ($ARCH)"
    err "No supported package manager found on this $OS host."
    err "Supported: macOS (Homebrew), Linux (apt, dnf, pacman, zypper)."
    exit 3
  fi

  # shellcheck disable=SC1090
  . "$SCRIPT_DIR/pm/$pm.sh"

  bold "mion setup - $OS ($ARCH) via $PM_NAME$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"

  bold "Required for the docs website + benchmarks"
  check_dep podman "$PODMAN_MIN" "podman --version | awk '{print \$3}'" 1

  bold "Required for the benchmarks (host build via 'pnpm miondevx bench prep')"
  check_dep node "$NODE_MIN" "node --version | tr -d v" 0
  check_dep pnpm "$PNPM_MIN" "pnpm --version" 0
  check_go "$GO_MIN"

  bold "Container engine"
  ensure_podman_engine

  bold "Submodules + tsgolint patches"
  ensure_submodules
  apply_tsgolint_patches
  bold "tsgolint pin"
  check_tsgolint_pin

  bold "Workspace deps + project build"
  install_workspace_deps
  wire_husky
  build_go_binary
  build_vite_plugin

  bold "Local env (.env, dev only)"
  setup_env

  bold "Next steps (from the repo root)"
  print_next_steps

  if [ "$FAILED" = 0 ]; then
    bold "Setup OK."
  else
    bold "Setup incomplete - see ERR above."
    exit 1
  fi
}

main "$@"
