#!/bin/bash
# one-time setup, as root
tee /etc/sysctl.d/99-mediasoup.conf > /dev/null <<EOF
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=16777216
net.core.wmem_default=16777216
EOF
sysctl --system
