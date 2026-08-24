# -----------------------------------------------------------------------------
# pm/dnf.sh - dnf installers (Fedora/RHEL/CentOS Stream). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="dnf"

_dnf_install() { $SUDO dnf install -y "$@"; }

install_podman() { _dnf_install podman; }

install_node()   { _dnf_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
