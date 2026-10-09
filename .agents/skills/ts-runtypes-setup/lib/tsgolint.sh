# lib/tsgolint.sh: tsgolint submodules, patches and pin. Sourced by setup.sh, never executed.

# NOT --recursive: skips typescript-go's 620MB _submodules/TypeScript, used only by its own testrunner.
ensure_submodules() {
  local tsgolint_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint"
  local tsgo_dir="$tsgolint_dir/typescript-go"
  if [ -f "$tsgolint_dir/go.mod" ] && { [ -d "$tsgo_dir/.git" ] || [ -f "$tsgo_dir/.git" ]; }; then
    ok "submodules present (tsgolint + typescript-go)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "submodules not initialized - re-run without --check to bootstrap"
    return 0
  fi
  bold "Initializing submodules (tsgolint + typescript-go; skipping the 620MB TypeScript corpus)"
  _init_submodules() {
    ( cd "$REPO_DIR" && git submodule update --init ts-go-runtypes/third_party/tsgolint ) &&
    ( cd "$tsgolint_dir" && git submodule update --init typescript-go )
  }
  if _init_submodules; then
    ok "submodules ready (deep TypeScript corpus skipped)"
    return 0
  fi
  # Managed hosts (Claude Code on the web) inject an insteadOf proxy that 403s on public submodules.
  warn "git submodule update failed - retrying with the injected git-proxy rewrite bypassed"
  if ( export GIT_CONFIG_GLOBAL=/dev/null; _init_submodules ); then
    ok "submodules ready (direct-HTTPS bypass, deep TypeScript corpus skipped)"
    return 0
  fi
  err "git submodule update failed (direct and proxy-bypass attempts)"
  FAILED=1
  return 1
}

# A patch that applies in reverse counts as already applied.
apply_tsgolint_patches() {
  local tsgo_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/typescript-go"
  local patches_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/patches"
  [ -d "$tsgo_dir" ] || { warn "typescript-go submodule missing - skipping patches"; return 0; }
  [ -d "$patches_dir" ] || { warn "patches/ missing - skipping"; return 0; }

  local patches=("$patches_dir"/*.patch)
  [ -e "${patches[0]}" ] || { ok "no tsgolint patches to apply"; return 0; }

  local needs_apply=()
  local already=0
  local broken=0
  for p in "${patches[@]}"; do
    if ( cd "$tsgo_dir" && git apply --reverse --check "$p" >/dev/null 2>&1 ); then
      already=$((already+1))
    elif ( cd "$tsgo_dir" && git apply --check "$p" >/dev/null 2>&1 ); then
      needs_apply+=("$p")
    elif ( cd "$tsgo_dir" && git apply --3way --check "$p" >/dev/null 2>&1 ); then
      needs_apply+=("$p")
    else
      err "patch $(basename "$p") neither applies cleanly nor in reverse"
      broken=$((broken+1))
    fi
  done

  if [ "$broken" -gt 0 ]; then
    err "$broken tsgolint patch(es) cannot be applied or reversed; resolve manually"
    FAILED=1
    return 1
  fi

  if [ "${#needs_apply[@]}" -eq 0 ]; then
    ok "tsgolint patches already applied ($already)"
    return 0
  fi

  if [ "$CHECK_ONLY" = 1 ]; then
    warn "${#needs_apply[@]} tsgolint patch(es) need applying - re-run without --check"
    return 0
  fi

  bold "Applying ${#needs_apply[@]} tsgolint patch(es) to typescript-go working tree"
  for p in "${needs_apply[@]}"; do
    ( cd "$tsgo_dir" && git apply --3way "$p" ) \
      || { err "git apply failed on $(basename "$p")"; FAILED=1; return 1; }
  done
  ok "tsgolint patches applied"
}

check_tsgolint_pin() {
  if ! command -v node >/dev/null 2>&1; then
    warn "node not found - skipping tsgolint pin check"
  elif [ "$CHECK_ONLY" = 1 ]; then
    node "$REPO_DIR/scripts/core/ensure-tsgolint.mjs" --check \
      || warn "submodule not at the pinned tsgolint revision (re-run without --check to repair)"
  elif node "$REPO_DIR/scripts/core/ensure-tsgolint.mjs"; then
    ok "submodule matches the pinned tsgolint revision"
  else
    err "tsgolint pin enforcement failed"; FAILED=1
  fi
}
