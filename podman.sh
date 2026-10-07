#!/usr/bin/env bash
CAESAR_BUILD_VERSION=$(git rev-parse --short HEAD) podman-compose -p caesar-prod-dev --profile prod-dev build
