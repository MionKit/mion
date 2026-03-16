#!/usr/bin/env bash
set -euo pipefail

# Pack all mion packages into tarballs and install them in test-publish
# Simulates what a real consumer gets from npm install

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_PUBLISH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[1/4] Building all packages...${NC}"
cd "$ROOT_DIR"
npm run build

echo -e "\n${GREEN}[2/4] Packing mion packages into tarballs...${NC}"
mkdir -p "$TEST_PUBLISH_DIR/tarballs"
rm -f "$TEST_PUBLISH_DIR/tarballs/"*.tgz 2>/dev/null || true

PACKAGES=(
  "@mionjs/core"
  "@mionjs/run-types"
  "@mionjs/type-formats"
  "@mionjs/router"
  "@mionjs/platform-node"
  "@mionjs/client"
  "@mionjs/devtools"
)
for pkg in "${PACKAGES[@]}"; do
  echo "  Packing $pkg..."
  npm pack -w "$pkg" --pack-destination "$TEST_PUBLISH_DIR/tarballs" --silent
done

echo -e "\n${GREEN}[3/4] Renaming tarballs to unversioned names...${NC}"
cd "$TEST_PUBLISH_DIR"
node scripts/rewrite-deps.js

echo -e "\n${GREEN}[4/4] Installing from tarballs (clean)...${NC}"
rm -rf node_modules package-lock.json
npm install

echo -e "\n${GREEN}Done! You can now run:${NC}"
echo "  cd test-publish && npm run test"
echo "  cd test-publish && npm run verify"
