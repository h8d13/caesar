#!/usr/bin/env bash
docker compose --profile prod down
# make sure we are up to date
REMOTE=$(git remote -v)
git pull && echo "pulled latest from $REMOTE" || { echo "failed to pull"; exit 1; }