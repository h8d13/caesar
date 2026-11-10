#!/usr/bin/env bash

# after every edge build this just updates in place.
docker compose pull && docker compose up -d --force-recreate
