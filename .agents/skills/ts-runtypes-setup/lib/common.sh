# lib/common.sh: shared helpers for setup.sh and pm/*.sh. Sourced, never executed.
# Needs from setup.sh: CHECK_ONLY, OS, ARCH, SUDO, FAILED, GO_INSTALL_VERSION.

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m   %s\n' "$*"; }
err()  { printf '  \033[31mERR\033[0m %s\n' "$*" >&2; }

# true if $1 >= $2 (dotted versions)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

# check_dep <name> <min> <version-cmd> <required:0|1>; installs via install_<name> from pm/<pm>.sh.
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

# Too-old Go is an error, never an auto-upgrade: its install source is unknown, so clobbering is unsafe.
check_go() {
  local min="$1" cur
  if command -v go >/dev/null 2>&1; then
    cur="$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')"
    if [ -z "$cur" ]; then ok "go present (version unknown)"; return 0; fi
    if version_ge "$cur" "$min"; then ok "go $cur (>= $min)"; return 0; fi
    err "go $cur present but this repo needs >= $min." \
      "Upgrade Go (macOS: brew upgrade go; Linux/other: https://go.dev/dl/ or your version manager) and re-run."
    FAILED=1
    return 0
  fi
  check_dep go "$min" "go version | awk '{print \$3}' | sed 's/^go//'" 0
}

# Every pm/*.sh uses this as install_pnpm: corepack first, npm global fallback.
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

# Every Linux pm/*.sh installs Go this way: distro packages lag the required version.
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
