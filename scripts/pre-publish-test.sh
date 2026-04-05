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

# 5a. Pack all publishable mion packages into unversioned tarballs
bash scripts/pack-packages.sh

# 5b. Clean install from tarballs
cd test-publish
rm -rf node_modules dist
# Strip stale integrity hashes for file: tarball deps so npm ci doesn't reject them.
# These are local trusted tarballs we just packed; external deps keep their locked integrity.
node -e "
const fs = require('fs');
const lf = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
for (const [, v] of Object.entries(lf.packages || {})) {
  if (v.resolved && v.resolved.startsWith('file:') && v.resolved.endsWith('.tgz')) {
    delete v.integrity;
  }
}
fs.writeFileSync('package-lock.json', JSON.stringify(lf, null, 2) + '\n');
"
npm ci

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
