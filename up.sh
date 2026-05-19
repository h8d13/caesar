#!/usr/bin/env bash
command -v git >/dev/null || { echo "git not found"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose not found"; exit 1; }
# more preflight - holds current running ids
check_running() {
    ids=$(docker ps -q)
    [ -n "$ids" ]
}

# confirm() {
# read -r -p "Are you sure? [y/N] " response
# if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
# then
#     continue
# else
#     exit 0
# fi
# }

# case "$1" in
    # -l | --logs)
    # docker logs -f caesar
    # ;;
    # -d | --down)
    # docker compose --profile prod down
    # ;;
    # -r | --reset)
    # confirm
    # # MAGIC RESETS VOLUMES LINE (drop volumes) DESTRUCTIVE
    # rm -rf data && docker system prune -a --volumes
    # ;;
# esac

# Prod-dev: hermetic test of the real prod binary on https://localhost:8443
# (self-signed). Skips git pull / system prune / container nuke so it stays
# safe to run alongside the real prod or while iterating on local commits.
# Wipes ./data-prod-dev each invocation so every test starts clean
if [ "${1:-}" = "--prod-dev" ]; then
    docker compose version >/dev/null 2>&1 || { echo "docker compose not found"; exit 1; }
    export CAESAR_BUILD_VERSION="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
    echo "prod-dev: building version $CAESAR_BUILD_VERSION"
    # Separate project name so prod-dev gets its own default network. With
    # the default `name: caesar` from compose.yaml both stacks would share
    # caesar_default, and `down` would fight the other stack's containers
    # over network removal. for easier debug we pass progress plain
    COMPOSE="docker compose -p caesar-prod-dev --profile --progress=plain prod-dev"
    $COMPOSE down
    rm -rf ./data-prod-dev
    # pre-create the bind-mount target so it's owned by the host user
    # (typically uid 1000, matching the `caesar` user inside the image).
    # if docker creates it lazily, it would be root-owned and the in-
    # container caesar would EACCES on mkdir uploads/.
    mkdir -p ./data-prod-dev
    $COMPOSE build && $COMPOSE up
    exit $?
fi

# make sure we are up to date
REMOTE=$(git remote -v)
git pull && echo "pulled latest from $REMOTE" || { echo "failed to pull"; exit 1; }

# careful if you have other containers running
if check_running; then
    docker rm -f $ids
else
    echo "no containers running"
fi

# build version: git short hash of HEAD. up.sh pulls latest above, so the
# tree always matches origin; no dirty marker needed. helpers.ts picks this
# up over package.json.
export CAESAR_BUILD_VERSION=$(git rev-parse --short HEAD)
echo ""
echo "BUILDING CAESAR VERSION HASH: $CAESAR_BUILD_VERSION"
echo ""

# convenience wrapper for prod builds
docker system prune -f && docker compose --profile prod build --no-cache --progress=plain && docker compose --profile prod up -d
