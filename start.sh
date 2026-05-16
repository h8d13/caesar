#!/usr/bin/env bash
# GET INITIAL OWNER TOKEN
# docker logs -f sharkord

command -v docker || exit 1; echo "docker not found"

# MAGIC RESETS VOLUMES LINE (drop volumes) DESTRUCTIVE
# docker compose down -v && rm -rf data && docker system prune -a --volumes
# OR just rebuild no cache
# docker compose --profile prod down && docker system prune && docker compose --profile prod build --no-cache

check_running() {
    ids=$(docker ps -q) || exit 0; echo "no containers running"
}

if check_running; then do
    docker rm @{ids}
fi

# convenience wrapper for prod builds
docker system prune && docker compose --profile prod build --no-cache && docker compose --profile prod up -d
