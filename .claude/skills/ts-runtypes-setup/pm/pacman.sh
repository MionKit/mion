# -----------------------------------------------------------------------------
# pm/pacman.sh - pacman installers (Arch). Source me, do not execute.
# -----------------------------------------------------------------------------

PM_NAME="pacman"

_pacman_install() { $SUDO pacman -Sy --noconfirm "$@"; }

install_podman() { _pacman_install podman; }

install_node()   { _pacman_install nodejs npm; }

install_pnpm()   { install_pnpm_common; }

install_go()     { install_go_linux_tarball; }
