#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Check npm auth ──
if ! NPM_USER=$(npm whoami --no-interactive 2>/dev/null); then
  echo -e "${RED}Not logged in to npm. Run 'npm login' first.${NC}"
  exit 1
fi
echo -e "Logged in as: ${GREEN}${NPM_USER}${NC}"

# ── Get version ──
if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  read -rp "Version to unpublish: " VERSION
fi

if [ -z "$VERSION" ]; then
  echo -e "${RED}No version provided.${NC}"
  exit 1
fi

# ── Get packages in reverse topological order (dependents first, dependencies last) ──
PACKAGES=$(pnpm exec lerna ls --no-private --toposort --json 2>/dev/null | node -e "
  const pkgs = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  pkgs.reverse().forEach(p => console.log(p.name));
")

# ── Preview ──
echo ""
echo -e "${YELLOW}Will unpublish in reverse dependency order:${NC}"
i=1
for PKG in $PACKAGES; do
  echo "  ${i}. ${PKG}@${VERSION}"
  i=$((i + 1))
done

echo ""
read -rp "Are you sure? (y/N) " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ── Get OTP once for all packages ──
echo ""
read -rp "Enter npm OTP code: " OTP

# ── Unpublish ──
FAILED=()
for PKG in $PACKAGES; do
  echo -n "Unpublishing ${PKG}@${VERSION}... "
  if npm unpublish "${PKG}@${VERSION}" --otp="${OTP}" 2>&1; then
    echo -e "${GREEN}done${NC}"
  else
    echo -e "${RED}failed${NC}"
    FAILED+=("$PKG")
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo -e "${GREEN}All packages unpublished successfully.${NC}"
else
  echo -e "${RED}Failed to unpublish:${NC}"
  for PKG in "${FAILED[@]}"; do
    echo "  ${PKG}@${VERSION}"
  done
fi
