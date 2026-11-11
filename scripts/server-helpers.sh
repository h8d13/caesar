#!/bin/bash
[ "$EUID" -ne 0 ] && { echo "this is meant to be run as root" >&2; exit 1; }
# one-time: mediasoup UDP socket buffers
# sets to 16MiB but you can increase this to 32-64MiB
tee /etc/sysctl.d/99-mediasoup.conf > /dev/null <<EOF
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=16777216
net.core.wmem_default=16777216
EOF
sysctl --system

# limit log sizes of journald: drop-in keeps the distro's journald.conf,
# keys outside a [Journal] section are ignored
mkdir -p /etc/systemd/journald.conf.d
tee /etc/systemd/journald.conf.d/99-caesar.conf > /dev/null <<EOF
[Journal]
SystemMaxUse=200M
EOF
systemctl restart systemd-journald

# docker/podman container logs: rotated per container by the `logging:`
# blocks in docker-compose.yaml (json-file, 5 x 10 MB), nothing to do here
