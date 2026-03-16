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
npm run fresh-start

# ── Step 2: Run all tests ──
print_step "Run all tests"
npm run test

# ── Step 3: Lint & format ──
print_step "Lint & check formatting"
npm run lint
npm run check-format

# ── Step 4: Build all packages ──
print_step "Build all packages"
npm run build

# ── Step 5: Pack + test-publish E2E verification ──
print_step "Pack packages and run E2E verification"

# 5a. Create tarballs directory
mkdir -p test-publish/tarballs
rm -f test-publish/tarballs/*.tgz

# 5b. Pack all publishable mion packages into tarballs
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
  npm pack -w "$pkg" --pack-destination test-publish/tarballs
done

# 5c. Rename tarballs to unversioned names (package.json uses stable paths)
cd test-publish
node scripts/rewrite-deps.js

# 5d. Clean install from tarballs
rm -rf node_modules package-lock.json
npm install

# 5e. Run E2E tests (JSON + binary serialization + pure functions)
npm run test

# 5f. Build with AOT caches
npm run build

# 5g. Verify AOT caches are inlined in build output
npm run test:aot

cd ..

# ── Step 6: List packages to publish ──
print_step "Packages that will be published"
npx lerna ls --no-private --json

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All pre-publish checks passed!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "Ready to publish. Run:"
echo "  npm run npm-publish"
echo ""
echo "This will check npm auth, bump versions, and publish."
