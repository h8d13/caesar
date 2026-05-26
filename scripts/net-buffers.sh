#!/bin/bash
[ "$EUID" -ne 0 ]; echo "this is meant to be run as root" && exit 1
# one-time setup, as root
# sets to 16MiB but you can insrease this to 32-64
tee /etc/sysctl.d/99-mediasoup.conf > /dev/null <<EOF
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=16777216
net.core.wmem_default=16777216
EOF
sysctl --system
