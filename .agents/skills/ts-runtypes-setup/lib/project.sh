# lib/project.sh: workspace install, git hooks, Go binary + devtools builds. Sourced by setup.sh, never executed.

install_workspace_deps() {
  command -v pnpm >/dev/null 2>&1 || { warn "pnpm missing - cannot install deps"; return 0; }
  if [ -d "$REPO_DIR/node_modules" ] && [ -f "$REPO_DIR/node_modules/.modules.yaml" ]; then
    ok "workspace node_modules present (skipping install)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "workspace deps not installed - re-run without --check"
    return 0
  fi
  bold "Running pnpm install --frozen-lockfile"
  ( cd "$REPO_DIR" && pnpm install --frozen-lockfile ) \
    || { err "pnpm install failed"; FAILED=1; return 1; }
  ok "workspace deps installed"
}

# Own step: `ignoreScripts: true` blocks husky's `prepare`; non-fatal since CI's commitlint still gates.
wire_husky() {
  command -v pnpm >/dev/null 2>&1 || { warn "pnpm missing - cannot wire husky hooks"; return 0; }
  if [ "$(git -C "$REPO_DIR" config --get core.hooksPath 2>/dev/null || true)" = ".husky/_" ]; then
    ok "husky git hooks already wired"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "husky git hooks not wired - re-run without --check (or run: pnpm exec husky)"
    return 0
  fi
  bold "Wiring husky git hooks (pnpm exec husky)"
  ( cd "$REPO_DIR" && pnpm exec husky ) \
    || { warn "husky wiring failed - commits won't be checked locally (CI still gates)"; return 0; }
  ok "husky git hooks wired (commit-msg -> commitlint, pre-commit -> lint-staged)"
}

build_go_binary() {
  command -v go >/dev/null 2>&1 || { warn "go missing - skipping binary build"; return 0; }
  local bin="$REPO_DIR/mion-bin/mion"
  if [ -x "$bin" ] && [ -z "$(find "$REPO_DIR/ts-go-runtypes/cmd" "$REPO_DIR/ts-go-runtypes/internal" \
    -type f -newer "$bin" -print -quit 2>/dev/null)" ]; then
    ok "Go binary up-to-date (mion-bin/mion)"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "Go binary missing or stale - re-run without --check"
    return 0
  fi
  bold "Building Go binary -> mion-bin/mion"
  ( cd "$REPO_DIR/ts-go-runtypes" && go build -o "$REPO_DIR/mion-bin/mion" ./cmd/mion ) \
    || { err "go build failed"; FAILED=1; return 1; }
  ok "Go binary built"
}

# The marker package's typecheck reads the devtools .d.ts, so tests + smokes need the dist.
build_vite_plugin() {
  command -v pnpm >/dev/null 2>&1 || return 0
  local dist="$REPO_DIR/packages/devtools/dist/index.js"
  if [ -f "$dist" ] && [ -z "$(find "$REPO_DIR/packages/devtools/src" \
    -type f -newer "$dist" -print -quit 2>/dev/null)" ]; then
    ok "@mionjs/devtools dist up-to-date"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "@mionjs/devtools dist missing or stale - re-run without --check"
    return 0
  fi
  bold "Building @mionjs/devtools"
  ( cd "$REPO_DIR" && pnpm --filter @mionjs/devtools run build ) \
    || { err "@mionjs/devtools build failed"; FAILED=1; return 1; }
  ok "@mionjs/devtools dist built"
}
