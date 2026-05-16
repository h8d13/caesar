#!/usr/bin/env bash

confirm() {
read -r -p "Are you sure? [y/N] " response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
then
    continue
else
    exit 0
fi
}

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

# make sure we are up to date
command -v git >/dev/null || { echo "git not found"; exit 1; }
REMOTE=$(git remote -v)
git pull && echo "pulled latest from $REMOTE" || { echo "failed to pull"; exit 1; }

# more preflight
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose not found"; exit 1; }

check_running() {
    ids=$(docker ps -q)
    [ -n "$ids" ]
}

# careful if you have other containers running
if check_running; then
    docker rm -f $ids
else
    echo "no containers running"
fi

# convenience wrapper for prod builds
docker system prune -f && docker compose --profile prod build --no-cache && docker compose --profile prod up -d
# can add --progress=plain for easier debug