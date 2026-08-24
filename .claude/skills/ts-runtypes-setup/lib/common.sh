# -----------------------------------------------------------------------------
# lib/common.sh - shared helpers for setup.sh and pm/*.sh.
# Source me, do not execute.
#
# Expected to be sourced by setup.sh AFTER it has set:
#   CHECK_ONLY, OS, ARCH, SUDO, FAILED, GO_INSTALL_VERSION
# -----------------------------------------------------------------------------

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m   %s\n' "$*"; }
err()  { printf '  \033[31mERR\033[0m %s\n' "$*" >&2; }

# true if $1 >= $2 (dotted versions)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

# check_dep <name> <min> <version-cmd> <required:0|1>
# Looks up install_<name> defined by the sourced pm/<pm>.sh module.
check_dep() {
  local name="$1" min="$2" vcmd="$3" required="$4" cur
  if command -v "$name" >/dev/null 2>&1; then
    cur="$(eval "$vcmd" 2>/dev/null)"
    if [ -z "$cur" ]; then ok "$name present (version unknown)"; return 0; fi
    if version_ge "$cur" "$min"; then
      ok "$name $cur (>= $min)"
    else
      warn "$name $cur present but repo targets >= $min - upgrade recommended"
    fi
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    if [ "$required" = 1 ]; then
      err "$name missing (required); re-run without --check to install"
      FAILED=1
    else
      warn "$name missing (needed for benchmarks); re-run without --check to install"
    fi
    return 0
  fi
  bold "Installing $name..."
  if "install_$name" && command -v "$name" >/dev/null 2>&1; then
    cur="$(eval "$vcmd" 2>/dev/null)"
    ok "$name installed (${cur:-ok})"
    version_ge "${cur:-0}" "$min" || warn "$name ${cur:-?} is below the supported >= $min"
  else
    if [ "$required" = 1 ]; then
      err "failed to install $name (required)"
      FAILED=1
    else
      warn "failed to install $name (needed only for benchmarks)"
    fi
  fi
}

# Go gets its own check: a present-but-too-old Go is an ERROR, never an
# auto-upgrade. We can't know how Go was installed here (brew/apt/asdf/gvm/manual),
# so clobbering /usr/local/go or running brew would be unsafe and often useless
# (the active `go` may live elsewhere on PATH, so we wouldn't even fix it). Absent
# Go still installs - nothing to clobber - via check_dep's normal path. (Go >= 1.21
# with GOTOOLCHAIN=auto + network auto-fetches the go.mod-required toolchain at
# build time, but we do not rely on that: we require an active Go >= min and tell
# the user to upgrade.)
check_go() {
  local min="$1" cur
  if command -v go >/dev/null 2>&1; then
    cur="$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')"
    if [ -z "$cur" ]; then ok "go present (version unknown)"; return 0; fi
    if version_ge "$cur" "$min"; then ok "go $cur (>= $min)"; return 0; fi
    err "go $cur present but this repo needs >= $min. Upgrade Go (macOS: brew upgrade go; Linux/other: https://go.dev/dl/ or your version manager) and re-run."
    FAILED=1
    return 0
  fi
  check_dep go "$min" "go version | awk '{print \$3}' | sed 's/^go//'" 0
}

# PM-agnostic pnpm install: corepack first, npm global fallback.
# Every pm/*.sh module defines install_pnpm = install_pnpm_common (no PM-specific path).
install_pnpm_common() {
  if command -v corepack >/dev/null 2>&1; then
    corepack enable && corepack prepare pnpm@latest --activate
  elif command -v npm >/dev/null 2>&1; then
    $SUDO npm install -g pnpm
  else
    err "neither corepack nor npm available - install Node first"
    return 1
  fi
}

# Linux Go tarball install. Distro packages typically lag the repo's required
# version (1.26+), so every Linux pm/*.sh module uses this path for Go.
install_go_linux_tarball() {
  local goarch
  case "$ARCH" in
    x86_64)        goarch=amd64 ;;
    aarch64|arm64) goarch=arm64 ;;
    *)             goarch="" ;;
  esac
  [ -z "$goarch" ] && { err "unsupported arch $ARCH for Go auto-install"; return 1; }
  local tgz="go${GO_INSTALL_VERSION}.linux-${goarch}.tar.gz"
  curl -fsSL "https://go.dev/dl/${tgz}" -o "/tmp/${tgz}" || return 1
  $SUDO rm -rf /usr/local/go && $SUDO tar -C /usr/local -xzf "/tmp/${tgz}"
  export PATH="/usr/local/go/bin:$PATH"
  warn "Go installed to /usr/local/go - add /usr/local/go/bin to your PATH."
}
