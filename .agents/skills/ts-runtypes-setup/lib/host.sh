# lib/host.sh: package-manager detection + podman engine checks. Sourced by setup.sh, never executed.

# Echoes the pm/<name>.sh basename to source; non-zero when no supported PM is present.
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

# macOS needs a running VM; on Linux the daemon should answer directly.
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
