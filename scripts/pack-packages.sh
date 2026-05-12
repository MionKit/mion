#!/usr/bin/env bash
set -euo pipefail

# Packs all public @mionjs packages into tarballs with consistent unversioned names.
# Tarballs are placed in test-publish/tarballs/ by default.
#
# Usage: bash scripts/pack-packages.sh [--dest <dir>]
#   --dest <dir>  Override the output directory (default: <repo-root>/test-publish/tarballs)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Parse args ──
DEST_DIR="$ROOT_DIR/test-publish/tarballs"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Public packages to pack ──
PACKAGES=(
  "@mionjs/core"
  "@mionjs/run-types"
  "@mionjs/type-formats"
  "@mionjs/router"
  "@mionjs/platform-node"
  "@mionjs/client"
  "@mionjs/devtools"
  "@mionjs/drizzle"
  "@mionjs/platform-aws"
  "@mionjs/platform-bun"
  "@mionjs/platform-cloudflare"
  "@mionjs/platform-gcloud"
  "@mionjs/platform-vercel"
)

# ── Pack ──
mkdir -p "$DEST_DIR"
rm -f "$DEST_DIR/"*.tgz 2>/dev/null || true

cd "$ROOT_DIR"
for pkg in "${PACKAGES[@]}"; do
  echo "  Packing $pkg..."
  # `pnpm pack` rewrites workspace:* deps to concrete versions in the tarball.
  pnpm --filter "$pkg" pack --pack-destination "$DEST_DIR" --silent
done

# ── Rename to unversioned names ──
# e.g. mionjs-core-0.8.3-alpha.0.tgz -> mionjs-core.tgz
renamed=0
for tb in "$DEST_DIR"/mionjs-*.tgz; do
  filename="$(basename "$tb")"
  # Strip version: keep everything before the first digit-led segment
  unversioned="$(echo "$filename" | sed -E 's/-[0-9]+\.[0-9]+\.[0-9]+.*\.tgz$/.tgz/')"
  if [[ "$filename" != "$unversioned" ]]; then
    mv "$tb" "$DEST_DIR/$unversioned"
    echo "  📦 $filename → $unversioned"
    renamed=$((renamed + 1))
  fi
done

echo ""
echo "Packed $renamed tarballs into $DEST_DIR"
