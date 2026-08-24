# -----------------------------------------------------------------------------
# pm/brew.sh - Homebrew installers (macOS). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="Homebrew"

_require_brew() {
  command -v brew >/dev/null 2>&1 || { err "Homebrew required (https://brew.sh)"; return 1; }
}

install_podman() {
  _require_brew || return 1
  brew install podman || return 1
  podman machine list --format '{{.Name}}'    2>/dev/null | grep -q .    || podman machine init
  podman machine list --format '{{.Running}}' 2>/dev/null | grep -qi true || podman machine start
}

install_node() { _require_brew && brew install node; }

install_pnpm() { install_pnpm_common; }

install_go()   { _require_brew && brew install go; }
