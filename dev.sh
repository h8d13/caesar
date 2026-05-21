#!/usr/bin/env bash
set -e

# Auto-fetch prebuilt mediasoup-worker if missing. Linux-only; on other
# OSes mediasoup's own native build runs at pnpm install time.
DEST="$PWD/vendor/mediasoup"
if [ ! -x "$DEST/mediasoup-worker" ]; then
	./scripts/fetch-mediasoup-worker.sh "$DEST"
fi
export MEDIASOUP_WORKER_BIN="$DEST/mediasoup-worker"

# Direct binary invocation. Skipping the `pnpm dev` wrapper avoids pnpm's
# ELIFECYCLE message when tsx exits non-zero on Ctrl+C.
(cd apps/client && exec ./node_modules/.bin/vite --host) &
CLIENT_PID=$!
(cd apps/server && exec ./node_modules/.bin/tsx watch ./src/index.ts) &
SERVER_PID=$!

# Clean up children on INT/TERM. Reset the trap immediately inside the
# handler so signals raised by `kill` don't re-trigger it. Matched in http server.
cleanup() {
  trap - INT TERM EXIT
  kill -TERM "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
  wait "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

wait
