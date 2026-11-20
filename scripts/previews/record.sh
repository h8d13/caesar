#!/usr/bin/env bash
# Regenerates the readme previews in .github/previews/ by driving the real
# app in a container (podman or docker, nothing else needed on the host).
#
#   scripts/previews/record.sh              all scenarios
#   scripts/previews/record.sh signup       only scenarios/signup.mjs
#   PREVIEWS_DEBUG=1 scripts/previews/record.sh settings
#                                           also keep the raw videos and a
#                                           screenshot of any failure in
#                                           .github/previews/debug/
#
# A scenario that no longer matches the UI fails with the step it stopped
# on: fix the selector in scripts/previews/scenarios/ and run it again.
set -euo pipefail
cd "$(dirname "$0")/../.."

if command -v podman >/dev/null 2>&1; then
	engine=(podman)
elif command -v docker >/dev/null 2>&1; then
	engine=(docker)
else
	echo "record.sh needs podman or docker" >&2
	exit 1
fi

"${engine[@]}" build -f Dockerfile.previews -t caesar-previews .

mkdir -p .github/previews

# node_modules volumes as in compose.dev.yaml, under their own names so a
# running dev container is left alone. Nothing is published on the host.
exec "${engine[@]}" run --rm --init --ipc=host \
	-e "PREVIEWS_DEBUG=${PREVIEWS_DEBUG:-}" \
	-v "$PWD:/app" \
	-v "$PWD/scripts/previews:/opt/previews/src:ro" \
	-v caesar-previews_node_modules:/app/node_modules \
	-v caesar-previews_client_node_modules:/app/apps/client/node_modules \
	-v caesar-previews_server_node_modules:/app/apps/server/node_modules \
	-v caesar-previews_shared_node_modules:/app/packages/shared/node_modules \
	-v caesar-previews_ui_node_modules:/app/packages/ui/node_modules \
	-v caesar-previews_pnpm:/pnpm \
	--tmpfs /app/apps/server/data \
	caesar-previews previews-entry "$@"
