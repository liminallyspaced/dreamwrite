#!/usr/bin/env bash
# Build DreamWrite for macOS (must run on a Mac).
# Usage: bash scripts/pack-mac.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[dreamwrite] installing deps…"
npm install

echo "[dreamwrite] regenerating icons…"
node scripts/build-icons.js

echo "[dreamwrite] bundling renderer…"
npm run build:prod

echo "[dreamwrite] packaging macOS (dmg + zip, arm64 + x64)…"
# Unsigned local build (Gatekeeper may warn; sign with Apple cert for distribution)
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac dmg zip

echo ""
echo "[dreamwrite] done. Install: open the .dmg → drag DreamWrite to Applications."
echo "Artifacts:"
ls -la dist/*.{dmg,zip} 2>/dev/null || ls -la dist/
