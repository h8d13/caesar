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

# limit log sizes of journald
tee /etc/systemd/journald.conf > /dev/null <<EOF
SystemMaxUse=200M
EOF

# limit similarly docker/podman logs
# ...
