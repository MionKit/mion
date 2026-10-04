# -----------------------------------------------------------------------------
# pm/apt.sh - apt installers (Debian/Ubuntu). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="apt"

# `apt-get update` refreshes the index for EVERY configured repo (it can't be
# scoped to a single package); the actual package selection happens in the
# `apt-get install <pkg>` step below. A stale third-party PPA baked into a base
# image (e.g. deadsnakes for Python, ondrej/php for PHP) can fail that refresh
# with 403 / "not signed", but the official repo we install from refreshed fine
# - so an unrelated repo failure must NOT block the install. Hence `|| warn`
# instead of `&&`.
_apt_install() {
  $SUDO apt-get update -qq \
    || warn "apt-get update reported errors from unrelated repos - continuing (only the requested packages are installed next)"
  $SUDO apt-get install -y -qq "$@"
}

install_podman() { _apt_install podman; }

install_node()   { _apt_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
