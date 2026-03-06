#!/usr/bin/env bash
# GET INITIAL OWNER TOKEN
# docker logs -f sharkord

# MAGIC RESETS VOLUMES LINE (drop volumes)
# docker compose down -v && rm -rf data && docker system prune -a --volumes
# OR just rebuild no cache
# docker compose --profile prod down && docker system prune && docker compose --profile prod build --no-cache

# convenience wrapper for prod builds
docker compose --profile prod up -d
