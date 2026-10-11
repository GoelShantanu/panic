#!/usr/bin/env bash
set -euo pipefail
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3002/v1/session >/dev/null
live_status=$(curl --silent --max-time 2 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3003/v1/live || true)
test "$live_status" = 200
docker exec bazaarnews-db-1 pg_isready -U postgres -d stockpanic >/dev/null
disk_usage=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$disk_usage" -ge 85 ]; then
  printf 'Root disk usage is %s%%\n' "$disk_usage" >&2
  exit 1
fi
printf 'Web, live and PostgreSQL healthy; disk usage %s%%\n' "$disk_usage"
