#!/usr/bin/env bash
set -euo pipefail

# Pre-publish verification script for mion monorepo
# Runs all checks to ensure packages are ready for npm publish

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step=0
total_steps=8

print_step() {
  step=$((step + 1))
  echo ""
  echo -e "${GREEN}[$step/$total_steps] $1${NC}"
  echo "──────────────────────────────────────────"
}

# ── Step 1: Fresh install ──
print_step "Clean everything and fresh install"
rm -rf node_modules package-lock.json .nx
find packages -name .dist -type d -exec rm -rf {} + 2>/dev/null || true
rm -rf packages/devtools/build
npm install

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

# ── Step 5: test-publish verification ──
print_step "Run test-publish build verification"
cd test-publish
npm install --ignore-scripts
npm run verify
cd ..

# ── Step 6: Dry-run npm pack for key packages ──
print_step "Verify package contents (npm pack --dry-run)"
packages=(core run-types type-formats router client devtools platform-node platform-aws platform-gcloud platform-vercel platform-bun platform-cloudflare drizze)
for pkg in "${packages[@]}"; do
  echo ""
  echo -e "${YELLOW}@mionjs/$pkg${NC}"
  cd "packages/$pkg"
  npm pack --dry-run 2>&1
  cd ../..
done

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
