#!/usr/bin/env bash
set -euo pipefail

# BazaarPanic Instant Zero-Build Deployment
# Pulls pre-built container from GHCR and reloads compose stack

IMAGE="ghcr.io/goelshantanu/panic:latest"

echo "[$(date -u --iso-8601=seconds)] Pulling latest pre-built container..."
if sudo docker pull "$IMAGE"; then
  sudo docker tag "$IMAGE" bazaarnews-app:current
  echo "[$(date -u --iso-8601=seconds)] Successfully pulled $IMAGE from GHCR."
else
  echo "[$(date -u --iso-8601=seconds)] Note: GHCR image pull failed or requires auth. Using current local release."
fi

cd /opt/stockpanic/current
sudo docker compose -f docs/ops/oracle/compose.yaml up -d
sudo docker image prune -f

echo "[$(date -u --iso-8601=seconds)] Deployment complete. Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
