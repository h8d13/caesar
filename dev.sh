#!/usr/bin/env bash
# this expects you to have mediasoup binary installed in correct location
set -e
trap 'kill 0' EXIT INT TERM
(cd apps/client && pnpm dev) &
(cd apps/server && pnpm dev) &
wait
