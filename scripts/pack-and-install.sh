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
#
# minimum-release-age override: test-publish/pnpm-workspace.yaml declares the
# strict 30-day policy as the resting state. We override to 0 here because
# every pack changes tarball hashes, triggering fresh resolution that would
# otherwise fail on whatever transitive happens to be young that day. The
# threat model still doesn't apply (test-publish is private, runs only
# locally/CI, consumes tarballs built from this monorepo).
#
# Lockfile restore: every pack changes tarball integrity hashes, so install
# rewrites the @mionjs/* file: entries in pnpm-lock.yaml. Those diffs are pure
# noise (next pack will produce different hashes again), so we back the
# lockfile up before install and restore it after the script exits — leaving
# the working tree clean. The trap fires on success, error, and Ctrl-C.
LOCKFILE_BACKUP="$(mktemp)"
cp "$TEST_PUBLISH_DIR/pnpm-lock.yaml" "$LOCKFILE_BACKUP"
trap 'cp "$LOCKFILE_BACKUP" "$TEST_PUBLISH_DIR/pnpm-lock.yaml" && rm -f "$LOCKFILE_BACKUP" && echo -e "${GREEN}[restore] test-publish/pnpm-lock.yaml restored to pre-script state${NC}"' EXIT
rm -rf node_modules
pnpm install --no-frozen-lockfile --config.minimum-release-age=0

echo -e "\n${GREEN}Done! You can now run:${NC}"
echo "  cd test-publish && pnpm run test"
echo "  cd test-publish && pnpm run verify"
