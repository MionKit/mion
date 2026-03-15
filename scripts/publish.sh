#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  mion publish${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"

# ── Check npm auth ──
echo ""
echo -e "${GREEN}[1/4] Checking npm authentication...${NC}"
echo "──────────────────────────────────────────"
NPM_USER=$(npm whoami 2>&1) || {
  echo -e "${RED}Not logged in to npm. Run 'npm login' first.${NC}"
  exit 1
}
echo -e "Logged in as: ${GREEN}${NPM_USER}${NC}"

# ── Check clean working tree ──
echo ""
echo -e "${GREEN}[2/4] Checking working tree...${NC}"
echo "──────────────────────────────────────────"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Working tree is dirty. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo -e "${GREEN}Working tree is clean${NC}"

# ── Version bump (interactive) ──
echo ""
echo -e "${GREEN}[3/4] Version bump${NC}"
echo "──────────────────────────────────────────"
echo -e "${YELLOW}Select version bump (lerna version):${NC}"
npx lerna version --no-private

# ── Publish to npm ──
echo ""
echo -e "${GREEN}[4/4] Publishing to npm...${NC}"
echo "──────────────────────────────────────────"
npx lerna publish from-package --no-private --ignore-scripts

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Published successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
