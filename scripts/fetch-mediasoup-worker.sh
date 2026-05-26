#!/usr/bin/env bash
# Fetch the prebuilt mediasoup-worker binary for the version pinned in
# apps/server/package.json. Skips mediasoup's local build (python+pip).
#
# Usage:   scripts/fetch-mediasoup-worker.sh [dest-dir]
# Default: ./vendor/mediasoup
#
# Wire into the Node server by exporting:
#   MEDIASOUP_WORKER_BIN=<dest-dir>/mediasoup-worker
# before running. mediasoup-node's npm-scripts.mjs sees the env var and
# skips its build step entirely.
set -euo pipefail

VERSION=$(node -p "require('./apps/server/package.json').dependencies.mediasoup")

# Normalize to mediasoup's release token (x64 / arm64). $ARCH override wins
# (e.g. Docker's TARGETARCH=amd64); otherwise detect the host. Both TARGETARCH
# and uname reflect the target, so cross/emulated builds resolve correctly.
RAW_ARCH=${ARCH:-$(uname -m)}
case "$RAW_ARCH" in
  x86_64 | amd64 | x64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "unsupported arch: $RAW_ARCH (want x64 or arm64)" >&2; exit 1 ;;
esac
KERNEL=${KERNEL:-kernel6} # backwards compatible linux specs = can run on kernel 7.x.x
DEST=${1:-./vendor/mediasoup}

URL="https://github.com/versatica/mediasoup/releases/download/${VERSION}/mediasoup-worker-${VERSION}-linux-${ARCH}-${KERNEL}.tgz"

mkdir -p "$DEST"
curl -fsSL "$URL" | tar xz -C "$DEST"
chmod +x "$DEST/mediasoup-worker"
echo "fetched mediasoup-worker $VERSION -> $DEST/mediasoup-worker"
