#!/usr/bin/env bash
set -euo pipefail
docker exec -i bazaarnews-db-1 psql -U postgres -d stockpanic -v ON_ERROR_STOP=1 \
  < /opt/stockpanic/current/docs/ops/oracle/repair-live-partitions.sql
docker run --rm --network bazaarnews_default \
  --env-file /etc/stockpanic/owner.env \
  --cap-drop ALL --security-opt no-new-privileges:true \
  bazaarnews-app:current node src/apps/worker/src/cli/maintenance.ts
