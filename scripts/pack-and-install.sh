#!/usr/bin/env bash
set -euo pipefail

# Pack all mion packages into tarballs and install them in test-publish
# Simulates what a real consumer gets from npm install

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_PUBLISH_DIR="$ROOT_DIR/test-publish"

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[1/3] Building all packages...${NC}"
cd "$ROOT_DIR"
pnpm run build

echo -e "\n${GREEN}[2/3] Packing mion packages into unversioned tarballs...${NC}"
bash "$ROOT_DIR/scripts/pack-packages.sh" --dest "$TEST_PUBLISH_DIR/tarballs"

echo -e "\n${GREEN}[3/3] Installing from tarballs (clean)...${NC}"
cd "$TEST_PUBLISH_DIR"
# SECURITY: Do NOT delete pnpm-lock.yaml — it pins integrity hashes for every
# transitive registry dep. --no-frozen-lockfile updates only the @mionjs/*
# file: entries whose tarball content changed; registry-dep integrity stays
# locked. Deleting the lockfile would silently regress supply-chain protection.
rm -rf node_modules
pnpm install --no-frozen-lockfile

echo -e "\n${GREEN}Done! You can now run:${NC}"
echo "  cd test-publish && pnpm run test"
echo "  cd test-publish && pnpm run verify"
