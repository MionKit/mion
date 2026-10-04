# -----------------------------------------------------------------------------
# pm/zypper.sh - zypper installers (openSUSE). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="zypper"

_zypper_install() { $SUDO zypper install -y "$@"; }

install_podman() { _zypper_install podman; }

install_node()   { _zypper_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
