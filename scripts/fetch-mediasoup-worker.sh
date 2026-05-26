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
ARCH=${ARCH:-x64} # TODO: Add knob doc for ARM build
KERNEL=${KERNEL:-kernel6} # backwards compatible linux specs = can run on kernel 7.x.x 
DEST=${1:-./vendor/mediasoup}

URL="https://github.com/versatica/mediasoup/releases/download/${VERSION}/mediasoup-worker-${VERSION}-linux-${ARCH}-${KERNEL}.tgz"

mkdir -p "$DEST"
curl -fsSL "$URL" | tar xz -C "$DEST"
chmod +x "$DEST/mediasoup-worker"
echo "fetched mediasoup-worker $VERSION -> $DEST/mediasoup-worker"
