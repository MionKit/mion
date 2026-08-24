#!/usr/bin/env bash
# =============================================================================
# SessionStart hook - super-quick RunTypes env check for Claude Code on the web.
#
# READ-ONLY. No installs, no builds, no tests/smokes. It just verifies that the
# dependencies the web setup installs are present, so a session starting on a
# stale/incomplete container is flagged immediately. If anything is missing it
# points at scripts/setup-claude-web.sh (the one-shot installer) - it does not
# try to fix anything itself.
#
# Runs only on Claude Code on the web ($CLAUDE_CODE_REMOTE=true); a no-op
# elsewhere. Always exits 0 (informational - never blocks the session). The
# report is printed to stdout, which Claude Code adds to the session context.
#
# Manual run:  CLAUDE_CODE_REMOTE=true bash .claude/hooks/session-start.sh
# =============================================================================
set -uo pipefail

# Web-only. On a local machine the dev manages their own env, so stay silent.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)}"
NODE_MAJOR_MIN=26
GO_MIN=1.26

fails=0
lines=()
pass() { lines+=("  OK      $1"); }
miss() { lines+=("  MISSING $1"); fails=$((fails + 1)); }
note() { lines+=("  ..      $1"); }
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

# --- host tools --------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  nv="$(node -p 'process.versions.node' 2>/dev/null)"
  [ "${nv%%.*}" -ge "$NODE_MAJOR_MIN" ] 2>/dev/null && pass "node $nv (>= $NODE_MAJOR_MIN)" || miss "node $nv (need >= $NODE_MAJOR_MIN; PATH may point at the image's Node)"
else miss "node (not on PATH)"; fi

command -v pnpm >/dev/null 2>&1 && pass "pnpm $(pnpm --version 2>/dev/null)" || miss "pnpm"
command -v npm  >/dev/null 2>&1 && pass "npm $(npm --version 2>/dev/null)"  || miss "npm"
command -v podman >/dev/null 2>&1 && pass "podman $(podman --version 2>/dev/null | awk '{print $3}')" || miss "podman"

if command -v go >/dev/null 2>&1; then
  gv="$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')"
  version_ge "${gv:-0}" "$GO_MIN" && pass "go $gv (>= $GO_MIN)" || miss "go $gv (need >= $GO_MIN)"
else miss "go (not on PATH)"; fi

# --- third-party required deps: submodules + patches -------------------------
tsgo="$REPO/ts-go-runtypes/third_party/tsgolint/typescript-go"
if [ -f "$REPO/ts-go-runtypes/third_party/tsgolint/go.mod" ] && [ -f "$tsgo/go.mod" ]; then pass "submodules (tsgolint + typescript-go)"
else miss "submodules (ts-go-runtypes/third_party/tsgolint[/typescript-go] not initialized)"; fi

patches_dir="$REPO/ts-go-runtypes/third_party/tsgolint/patches"
if [ -d "$tsgo" ] && [ -d "$patches_dir" ]; then
  total=0; applied=0
  for p in "$patches_dir"/*.patch; do
    [ -e "$p" ] || continue
    total=$((total + 1))
    ( cd "$tsgo" && git apply --reverse --check "$p" >/dev/null 2>&1 ) && applied=$((applied + 1))
  done
  if [ "$total" -eq 0 ]; then pass "tsgolint patches (none to apply)"
  elif [ "$applied" -eq "$total" ]; then pass "tsgolint patches ($applied/$total applied)"
  else miss "tsgolint patches ($applied/$total applied)"; fi
else
  miss "tsgolint patches (typescript-go or patches/ missing)"
fi

# --- build artifacts the setup produces --------------------------------------
[ -x "$REPO/bin/ts-runtypes" ] && pass "bin/ts-runtypes" || miss "bin/ts-runtypes (Go binary not built)"
[ -f "$REPO/node_modules/.modules.yaml" ] && pass "node_modules" || miss "node_modules (pnpm install not run)"
[ -f "$REPO/packages/ts-runtypes-devtools/dist/index.js" ] && pass "ts-runtypes-devtools dist" || miss "ts-runtypes-devtools dist (not built)"

# --- container image (informational; pulling needs egress for ghcr blobs) ----
img_ref="${GHCR_REGISTRY:-ghcr.io}/${GHCR_OWNER:-mionkit}/tsrt-website:latest"
if command -v podman >/dev/null 2>&1 && { podman image exists "$img_ref" 2>/dev/null || podman image exists "${RT_WEBSITE_IMAGE:-tsrt-website:dev}" 2>/dev/null; }; then
  note "container image present locally (website:dev / bench ready)"
else
  note "container image not pulled - website:dev/bench build/pull on demand (needs egress for pkg-containers.githubusercontent.com)"
fi

# --- report ------------------------------------------------------------------
echo "RunTypes env check (Claude Code on the web):"
printf '%s\n' "${lines[@]}"
if [ "$fails" -eq 0 ]; then
  echo "  => all required deps present. Ready to work (run 'pnpm test' to verify)."
else
  echo "  => $fails required dep(s) MISSING. Run: bash scripts/setup-claude-web.sh"
fi

exit 0
