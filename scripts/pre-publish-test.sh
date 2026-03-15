#!/usr/bin/env bash
set -euo pipefail

# Pre-publish verification script for mion monorepo
# Runs all checks to ensure packages are ready for npm publish

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step=0
total_steps=7

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

# ── Step 5: Sync test-publish versions ──
print_step "Sync test-publish dependency versions"
node scripts/sync-test-publish-versions.mjs

# ── Step 6: test-publish verification ──
print_step "Run test-publish build verification"
cd test-publish
npm install --ignore-scripts
npm run verify
cd ..

# ── Step 7: List packages to publish ──
print_step "Packages that will be published"
npx lerna ls --no-private --json

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All pre-publish checks passed!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "Ready to publish. Run:"
echo "  npm run npm-publish"
