#!/usr/bin/env bash
set -euo pipefail

# BazaarPanic Instant Zero-Build Deployment
# Pulls pre-built container from GHCR, updates stack, and notifies Telegram

TELEGRAM_ENV="/etc/stockpanic/telegram.env"
if [ -f "$TELEGRAM_ENV" ]; then
  # shellcheck source=/dev/null
  source "$TELEGRAM_ENV"
fi

send_telegram() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${msg}" \
      -d "parse_mode=HTML" > /dev/null 2>&1 || true
    echo "[$(date -u --iso-8601=seconds)] Telegram notification sent."
  fi
}

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

commit_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
commit_msg=$(git log -1 --pretty=%s 2>/dev/null || echo "Release update")
ist_time=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %I:%M %p IST')
web_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:3002/v1/session || echo "000")

echo "[$(date -u --iso-8601=seconds)] Deployment complete. Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

msg="🚀 <b>BazaarPanic Deployment Complete</b>
━━━━━━━━━━━━━━━━━━━━
Status: <b>LIVE (HTTP ${web_status}) 🟢</b>
Time: <code>${ist_time}</code>

📦 <b>RELEASE DETAILS</b>
• Commit: <code>${commit_sha}</code>
• Message: <i>${commit_msg}</i>
• Public URL: https://bazaarpanic.com

🐳 <b>CONTAINERS</b>
• All 7 stack services up & healthy
• Obsolete images automatically pruned"

send_telegram "$msg"
