#!/usr/bin/env bash
# this expects you to have mediasoup binary installed in correct location
set -e
(cd apps/client && pnpm dev) &
CLIENT_PID=$!
(cd apps/server && pnpm dev) &
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
