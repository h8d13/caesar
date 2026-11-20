#!/bin/sh
# Entrypoint of the previews container (Dockerfile.previews, started by
# record.sh). Boots the dev stack against a throwaway data dir, then hands
# over to run.mjs, which drives the browser and writes the GIFs.
set -e
cd /app

pnpm install --frozen-lockfile --config.confirmModulesPurge=false

# data/ is a tmpfs here (record.sh): every run starts from an empty server.
# The scenarios sign in many times a minute, far past the default limits.
cp /opt/previews/src/config.ini apps/server/data/config.ini

(cd apps/client && exec ./node_modules/.bin/vp dev --host 127.0.0.1) \
	>/tmp/client.log 2>&1 &
CLIENT_PID=$!
(cd apps/server && exec ./node_modules/.bin/tsx ./src/index.ts) \
	>/tmp/server.log 2>&1 &
SERVER_PID=$!

cleanup() {
	trap - INT TERM EXIT
	kill -TERM "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
	wait "$CLIENT_PID" "$SERVER_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

status=0
node /opt/previews/src/run.mjs "$@" || status=$?

if [ "$status" -ne 0 ]; then
	echo "--- server log (tail) ---"
	tail -n 40 /tmp/server.log
	echo "--- client log (tail) ---"
	tail -n 20 /tmp/client.log
fi

exit "$status"
