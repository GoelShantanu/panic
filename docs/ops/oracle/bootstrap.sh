#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then
  echo 'Run this bootstrap with sudo.' >&2
  exit 2
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 caddy iptables-persistent age curl
systemctl enable --now docker
install -d -m 700 /etc/stockpanic /var/backups/stockpanic
install -d -m 755 /opt/stockpanic/releases
cat > /etc/ssh/sshd_config.d/00-stockpanic.conf <<'SSH'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
SSH
sshd -t
systemctl reload ssh
echo 'Host packages and SSH baseline installed.'
