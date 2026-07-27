#!/usr/bin/env bash
command -v git >/dev/null || { echo "git not found"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose not found"; exit 1; }

export CAESAR_BUILD_VERSION=$(git rev-parse --short HEAD)

# Prod-dev: hermetic test of the real prod binary on https://localhost:8443
# (self-signed). Skips git pull / system prune / container nuke so it stays
# safe to run alongside the real prod or while iterating on local commits.
# Wipes ./data-prod-dev each invocation so every test starts clean
if [ "${1:-}" = "--prod-dev" ]; then
    echo ""
    echo "BUILDING CAESAR-PROD-DEV VERSION HASH: $CAESAR_BUILD_VERSION"
    echo ""
    # Separate project name so prod-dev gets its own default network. With
    # the default `name: caesar` from compose.yaml both stacks would share
    # caesar_default, and `down` would fight the other stack's containers
    # over network removal. --progress=plain keeps full build output.
    COMPOSE="docker compose -p caesar-prod-dev --profile prod-dev --progress=plain"
    $COMPOSE down
    rm -rf ./data-prod-dev && mkdir -p ./data-prod-dev
    $COMPOSE build && $COMPOSE up
    exit $?
fi

# reject typos instead of silently falling through to a default warm build
case "${1:-}" in
    ""|--clean) ;;
    *)
        echo "unknown option: $1"
        echo "usage: $0 [--prod-dev|--clean]"
        exit 1
        ;;
esac

# build version: git short hash of HEAD. run updown.sh first if you want the
# tree to match origin; no dirty marker needed. helpers.ts picks this up over
# package.json.
echo ""
echo "BUILDING CAESAR-PROD VERSION HASH: $CAESAR_BUILD_VERSION"
echo ""

# convenience wrapper for prod builds. default reuses Docker's layer cache (the
# Dockerfile only rebuilds changed layers). pass --clean for a cold reproducible
# build: system-wide prune + --no-cache (releases, or to clear a bad cache).
COMPOSE="docker compose --profile prod --progress=plain"

if [ "${1:-}" = "--clean" ]; then
    echo "cold build: docker system prune + --no-cache"
    docker system prune -f && $COMPOSE build --no-cache
else
    echo "warm build: reusing docker layer cache (--clean for a cold build)"
    $COMPOSE build
fi || exit 1

$COMPOSE up -d
