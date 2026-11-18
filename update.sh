#!/usr/bin/env bash

# after every edge build this just updates in place.
git pull && docker compose pull && docker compose up -d --force-recreate
# we also pull git changes for good measure but isn't needed.
