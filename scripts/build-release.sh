#!/usr/bin/env bash
# Build a Bolt release: dist/<name>-v<version>.tar.zst + dist/meta.json
#
# Reads name/version from bolt.json. The tarball holds the plugin files at its
# root (the layout Bolt expects); meta.json stays OUTSIDE the tarball because it
# carries the tarball's own sha256.
#
# Usage:
#   scripts/build-release.sh                 # url left as a placeholder
#   REPO=you/bolt-pvme-rotation-overlay scripts/build-release.sh   # fills the url
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="pvme-rotation-overlay"
VER=$(python3 -c "import json;print(json.load(open('bolt.json'))['version'])")
ARCHIVE="dist/${NAME}-v${VER}.tar.zst"

mkdir -p dist
rm -f "$ARCHIVE"

# Explicit file list keeps dev cruft (.claude/, dist/, scripts/) out of the release.
tar --zstd -cf "$ARCHIVE" bolt.json README.md plugin modules webpage

SHA=$(sha256sum "$ARCHIVE" | cut -d' ' -f1)
REPO="${REPO:-<you>/bolt-${NAME}}"
URL="https://github.com/${REPO}/releases/download/v${VER}/${NAME}-v${VER}.tar.zst"

python3 - "$VER" "$SHA" "$URL" <<'PY'
import json, sys
ver, sha, url = sys.argv[1], sys.argv[2], sys.argv[3]
with open("dist/meta.json", "w") as f:
    json.dump({"version": ver, "sha256": sha, "url": url}, f, indent=2)
    f.write("\n")
PY

echo "Built $ARCHIVE"
echo "  sha256: $SHA"
echo "  meta:   dist/meta.json (url: $URL)"
