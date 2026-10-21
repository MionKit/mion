# lib/finish.sh: dev .env + next-steps hint, the last two steps. Sourced by setup.sh, never executed.

# Non-fatal: only gives the dev a filled-in .env starting point.
setup_env() {
  if [ "$CHECK_ONLY" = 1 ]; then
    node "$REPO_DIR/scripts/miondevx.mjs" env || true
    return 0
  fi
  if [ -f "$REPO_DIR/.env" ]; then
    ok ".env present"
  else
    ( cd "$REPO_DIR" && node scripts/miondevx.mjs env --create-env )
  fi
  node "$REPO_DIR/scripts/miondevx.mjs" env || true
}

print_next_steps() {
  if [ "$CHECK_ONLY" = 1 ]; then
    echo "  bash .agents/skills/ts-runtypes-setup/setup.sh   # run autonomous setup"
  else
    echo "  pnpm miondevx core smoke         # binary + plugin wiring smoke (~1s)"
    echo "  pnpm miondevx website check    # build image + boot dev server + curl :3000 + stop"
    echo "  pnpm miondevx bench smoke      # build image + vite-build the benchmark in-container"
    echo "  pnpm miondevx website dev      # docs site -> http://localhost:3000"
    echo "  pnpm miondevx bench            # full validation benchmark"
    echo "  pnpm miondevx bench typecost   # type-checking-cost benchmark"
    if [ "$OS" = Darwin ]; then
      echo "  (macOS: MION_WEBSITE_POLL=1 pnpm miondevx website dev  for reliable hot reload)"
    fi
  fi
}
