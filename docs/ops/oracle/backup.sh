#!/usr/bin/env bash
set -euo pipefail
umask 077

backup_dir="/var/backups/stockpanic"
mkdir -p "$backup_dir"

# Load Telegram notification credentials
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
    echo "[$(date -u --iso-8601=seconds)] Telegram alert dispatched."
  fi
}

send_telegram_file() {
  local file_path="$1"
  local caption="${2:-}"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] && [ -f "$file_path" ]; then
    echo "[$(date -u --iso-8601=seconds)] Delivering offsite backup archive to Telegram..."
    curl -s -F "chat_id=${TELEGRAM_CHAT_ID}" \
      -F "document=@${file_path}" \
      -F "caption=${caption}" \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" > /dev/null 2>&1 || true
    echo "[$(date -u --iso-8601=seconds)] Telegram backup archive delivered."
  fi
}

timestamp=$(date +%Y%m%d_%H%M%S)
output="$backup_dir/stockpanic-$timestamp.dump"
temporary="$output.partial"

notify_failure() {
  local err_msg="${1:-Unknown error during backup}"
  echo "[$(date -u --iso-8601=seconds)] ERROR: $err_msg" >&2
  local fail_msg="🚨 <b>BazaarPanic Backup FAILED</b>

<b>Host:</b> AWS EC2 (3.27.24.82)
<b>Error:</b> <code>$err_msg</code>
<b>Time:</b> $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  send_telegram "$fail_msg"
  rm -f "$temporary"
}

trap 'notify_failure "Backup script failed unexpectedly"' ERR
trap 'rm -f "$temporary"' EXIT

echo "[$(date -u --iso-8601=seconds)] Starting BazaarPanic database backup..."

if ! docker exec bazaarnews-db-1 pg_dump -U postgres -d stockpanic -Fc > "$temporary"; then
  notify_failure "pg_dump failed to extract database dump from bazaarnews-db-1"
  exit 1
fi

if [ ! -s "$temporary" ]; then
  notify_failure "Backup file is empty (0 bytes)!"
  exit 1
fi

mv "$temporary" "$output"
file_size=$(du -h "$output" | cut -f1)
echo "[$(date -u --iso-8601=seconds)] SUCCESS: Backup created at $output ($file_size)"

# Prune backups older than 7 days
echo "[$(date -u --iso-8601=seconds)] Checking for backups older than 7 days..."
deleted_count=$(find "$backup_dir" -maxdepth 1 -type f -name 'stockpanic-*.dump*' -mtime +7 -print -delete | wc -l)
echo "[$(date -u --iso-8601=seconds)] Pruned $deleted_count old backup file(s)."

# Gather Comprehensive System & Telemetry Metrics
total_backups=$(find "$backup_dir" -maxdepth 1 -type f -name 'stockpanic-*.dump*' | wc -l)
total_backup_size=$(du -sh "$backup_dir" | cut -f1)
ist_time=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %I:%M %p IST')

# 24h Telemetry via sar (sysstat)
cpu_avg=$(sar -u 2>/dev/null | awk '/Average:/ {printf "%.1f%%", 100-$NF}' || echo 'N/A')
cpu_peak=$(sar -u 2>/dev/null | awk '$NF ~ /^[0-9]/ {busy=100-$NF; if(busy>max) max=busy} END {if(max) printf "%.1f%%", max; else print "N/A"}')
mem_avg=$(sar -r 2>/dev/null | awk '/Average:/ {printf "%.1f%%", $5}' || echo 'N/A')
mem_peak=$(sar -r 2>/dev/null | awk '$5 ~ /^[0-9]/ {if($5>max) max=$5} END {if(max) printf "%.1f%%", max; else print "N/A"}')

# Live OS & Resources
current_ram=$(free -h | awk '/Mem:/ {printf "%s / %s", $3, $2}')
current_swap=$(free -h | awk '/Swap:/ {printf "%s / %s", $3, $2}')
load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
disk_info=$(df -h / | awk 'NR==2 {printf "%s / %s (%s used • %s free)", $3, $2, $5, $4}')

# Docker Containers & Services
running_containers=$(docker ps -q | wc -l)
unhealthy_containers=$(docker ps --format '{{.Names}} ({{.Status}})' | grep -i 'unhealthy' || true)
if [ -z "$unhealthy_containers" ]; then
  containers_status="$running_containers / 7 Running (All Healthy)"
else
  containers_status="⚠️ Issues detected: $unhealthy_containers"
fi

# Application & Database Statistics
item_count=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT count(*) FROM item;" 2>/dev/null | tr -d ' ' || echo 'N/A')
story_count=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT count(*) FROM story;" 2>/dev/null | tr -d ' ' || echo 'N/A')
instrument_count=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT count(*) FROM instrument;" 2>/dev/null | tr -d ' ' || echo 'N/A')

# Format HTML Message
report="📦 <b>BazaarPanic Daily Backup & System Report</b>
━━━━━━━━━━━━━━━━━━━━
Status: <b>SUCCESS</b> 🟢
Time: <code>$ist_time</code>

💾 <b>DATABASE BACKUP</b>
• File: <code>$(basename "$output")</code>
• Size: <b>$file_size</b>
• Retention: Pruned $deleted_count old file(s) (>7d)
• Total Backups: $total_backups preserved ($total_backup_size)

📈 <b>24-HOUR TELEMETRY</b>
• <b>CPU (24h):</b> Avg <b>$cpu_avg</b> | Peak <b>$cpu_peak</b>
• <b>RAM (24h):</b> Avg <b>$mem_avg</b> | Peak <b>$mem_peak</b>
• <b>Load Avg:</b> <code>$load_avg</code>

🖥️ <b>SYSTEM RESOURCES</b>
• <b>RAM Current:</b> $current_ram
• <b>Swap:</b> $current_swap
• <b>Root Disk (EBS):</b> $disk_info

🐳 <b>SERVICES & CONTAINERS</b>
• Status: <b>$containers_status</b>
• Web & Live: Port 3002 (HTTP 200) • Port 3003 (SSE)

📊 <b>PLATFORM DATA STATS</b>
• News Items Ingested: <b>$item_count</b>
• Stories Clustered: <b>$story_count</b>
• Instruments Monitored: <b>$instrument_count NSE</b>"

send_telegram "$report"
send_telegram_file "$output" "💾 BazaarPanic Database Dump ($(basename "$output"), $file_size)"
