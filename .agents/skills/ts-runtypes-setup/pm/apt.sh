# pm/apt.sh - apt installers (Debian/Ubuntu). Source me, do not execute.

PM_NAME="apt"

# `apt-get update` refreshes every repo: a stale third-party one (403, not signed) must not block the install.
_apt_install() {
  $SUDO apt-get update -qq \
    || warn "apt-get update reported errors from unrelated repos - continuing" \
      "(only the requested packages are installed next)"
  $SUDO apt-get install -y -qq "$@"
}

install_podman() { _apt_install podman; }

install_node()   { _apt_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
