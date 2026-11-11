#!/usr/bin/env bash
# Update a deployment in place: run from anywhere, as the user that owns it.
#   1. git pull --ff-only, when this directory is a git checkout:
#      docker-compose.yaml pins the Caddy image by digest, so a new Caddy
#      (and any compose change) only arrives with the repo. Local changes
#      are never overwritten: if the pull cannot fast-forward it is skipped
#      with a message and the update goes on with the files as they are.
#   2. pull the images named by docker-compose.yaml (caesar tag + Caddy pin)
#   3. recreate the containers (podman-compose keeps a running container on
#      its old image without --force-recreate). Data volumes are kept.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
self="$PWD/$(basename "${BASH_SOURCE[0]}")"

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v podman-compose >/dev/null 2>&1; then
  compose=(podman-compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "update: no 'docker compose', 'podman-compose' or 'docker-compose' found" >&2
  exit 1
fi

if [ ! -f docker-compose.yaml ]; then
  echo "update: no docker-compose.yaml next to this script ($PWD)" >&2
  exit 1
fi

if [ -e .git ] && command -v git >/dev/null 2>&1; then
  before=$(git rev-parse HEAD 2>/dev/null || true)
  if git pull --ff-only; then
    if [ "$(git rev-parse HEAD)" != "$before" ]; then
      # bash reads a script while it runs: start over on the new version
      # (the second pass finds nothing to pull and goes straight on)
      echo "update: repo updated, restarting update.sh"
      exec bash "$self" "$@"
    fi
  else
    echo "update: 'git pull --ff-only' failed (local commits, edited tracked files, or no network)." >&2
    echo "update: continuing with the current docker-compose.yaml, its Caddy pin is NOT updated. Check 'git status', then rerun." >&2
  fi
else
  echo "update: not a git checkout (or no git), docker-compose.yaml and its Caddy pin stay as they are." >&2
  echo "update: download the current docker-compose.yaml and update.sh from the repo to move Caddy." >&2
fi

"${compose[@]}" pull
"${compose[@]}" up -d --force-recreate
