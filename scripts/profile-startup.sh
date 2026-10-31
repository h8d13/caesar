#!/bin/bash
# Cold-start time of the prod-dev server: container start -> /healthz OK.
# Covers SEA boot, migrations, mediasoup workers and HTTP listen; the stop
# is excluded. Needs the stack up: podman-compose -f compose.prod-dev.yaml up -d
# Usage: scripts/profile-startup.sh [runs] [container] [url]

runs=${1:-5}
container=${2:-caesar-prod-dev}
url=${3:-https://localhost:8443/healthz}
timeout_ms=60000

now_ms() { date +%s%3N; }

for run in $(seq 1 "$runs"); do
	podman stop -t 10 "$container" > /dev/null || exit 1
	start=$(now_ms)
	podman start "$container" > /dev/null || exit 1

	# -k: Caddy serves a local self-signed cert
	until curl -ksf -o /dev/null "$url"; do
		if (( $(now_ms) - start > timeout_ms )); then
			echo "run $run: no healthz after ${timeout_ms}ms" >&2
			exit 1
		fi
		sleep 0.05
	done

	echo "run $run: $(( $(now_ms) - start ))ms"
done
