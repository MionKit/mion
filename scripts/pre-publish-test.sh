#!/usr/bin/env bash
set -euo pipefail

# Pre-publish verification script for mion monorepo
# Runs all checks to ensure packages are ready for npm publish

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step=0
total_steps=6

print_step() {
  step=$((step + 1))
  echo ""
  echo -e "${GREEN}[$step/$total_steps] $1${NC}"
  echo "──────────────────────────────────────────"
}

# ── Step 1: Fresh start (clean, reinstall, build devtools) ──
print_step "Fresh start"
pnpm run fresh-start

# ── Step 2: Run all tests ──
print_step "Run all tests"
pnpm run test

# ── Step 3: Lint & format ──
print_step "Lint & check formatting"
pnpm run lint
pnpm run check-format

# ── Step 4: Build all packages ──
print_step "Build all packages"
pnpm run build

# ── Step 5: Pack + test-publish E2E verification ──
print_step "Pack packages and run E2E verification"

# 5a. Pack all publishable mion packages into unversioned tarballs
bash scripts/pack-packages.sh

# 5b. Clean install from tarballs
cd test-publish
# SECURITY: Do NOT delete pnpm-lock.yaml here.
# The committed lockfile pins integrity hashes for every transitive registry dep
# (vitest, vite, typescript, eslint, and ~hundreds of transitives). Deleting it
# re-resolves everything from the registry on each run, defeating pnpm's main
# supply-chain protection — the whole reason we migrated off npm.
# --no-frozen-lockfile keeps registry-dep integrity locked and only rewrites
# the @mionjs/* file: entries whose tarball content legitimately changed.
rm -rf node_modules dist
pnpm install --no-frozen-lockfile

# 5e. Run E2E tests (JSON + binary serialization + pure functions)
pnpm run test

# 5f. Build with AOT caches
pnpm run build

# 5g. Verify AOT caches are inlined in build output
pnpm run test:aot

cd ..

# ── Step 6: List packages to publish ──
print_step "Packages that will be published"
pnpm exec lerna ls --no-private --json

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All pre-publish checks passed!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "Ready to publish. Run:"
echo "  pnpm run npm-publish"
echo ""
echo "This will check npm auth, bump versions, and publish."
