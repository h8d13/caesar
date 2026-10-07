#!/bin/sh
# Entrypoint of the compose.dev.yaml container (baked into Dockerfile.dev,
# the repo itself is bind-mounted at /app). Installs into the node_modules
# volumes, then runs vite + tsx watch so host edits hot-reload.
set -e
cd /app

# no TTY in a container: never prompt before replacing a stale modules dir
pnpm install --frozen-lockfile --config.confirmModulesPurge=false

# Direct binary invocation. Skipping the `pnpm dev` wrapper avoids pnpm's
# ELIFECYCLE message when tsx exits non-zero on stop.
(cd apps/client && exec ./node_modules/.bin/vite --host 0.0.0.0) &
CLIENT_PID=$!
(cd apps/server && exec ./node_modules/.bin/tsx watch ./src/index.ts) &
SERVER_PID=$!

# PID 1 gets compose's stop signal: forward it, then exit cleanly. Reset the
# trap first so signals raised by `kill` don't re-trigger it.
cleanup() {
	trap - INT TERM
	kill -TERM "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
	wait "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
	exit 0
}
trap cleanup INT TERM

wait
