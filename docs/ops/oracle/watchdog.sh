#!/usr/bin/env bash
set -euo pipefail

# BazaarPanic Proactive System & Pre-Bell Watchdog
# Location: /opt/stockpanic/current/docs/ops/oracle/watchdog.sh

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

should_debounce() {
  local marker_file="$1"
  local cooldown_seconds="$2"
  if [ -f "$marker_file" ]; then
    local last_sent
    last_sent=$(stat -c %Y "$marker_file" 2>/dev/null || stat -f %m "$marker_file" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local elapsed=$((now - last_sent))
    if [ "$elapsed" -lt "$cooldown_seconds" ]; then
      return 0 # Debounce active, skip
    fi
  fi
  touch "$marker_file"
  return 1 # Send alert
}

mode="${1:-check}"

get_vitals() {
  ist_time=$(TZ='Asia/Kolkata' date '+%Y-%m-%d %I:%M %p IST')
  ram_total=$(free -m | awk '/Mem:/ {print $2}')
  ram_used=$(free -m | awk '/Mem:/ {print $3}')
  ram_avail=$(free -m | awk '/Mem:/ {print $7}')
  ram_pct=$(( ram_used * 100 / (ram_total ? ram_total : 1) ))
  current_ram_str=$(free -h | awk '/Mem:/ {printf "%s / %s (%d%% used, %s avail)", $3, $2, '"$ram_pct"', $7}')
  current_swap_str=$(free -h | awk '/Swap:/ {printf "%s / %s", $3, $2}')
  load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
  disk_pcent=$(df --output=pcent / | tail -1 | tr -dc '0-9')
  disk_str=$(df -h / | awk 'NR==2 {printf "%s / %s (%s used • %s free)", $3, $2, $5, $4}')
}

run_check() {
  get_vitals
  local alerts=()

  # 1. Memory Check (Low available RAM < 80MB or used > 88%)
  if [ "$ram_avail" -lt 80 ] || [ "$ram_pct" -gt 88 ]; then
    if ! should_debounce "/tmp/stockpanic_mem_alert.time" 2700; then # 45 mins cooldown
      top_procs=$(ps -eo pid,%mem,%cpu,cmd --sort=-%mem | head -n 6 | awk 'NR>1 {printf "• PID %s: %s%% MEM - %s\n", $1, $2, $4}')
      alerts+=("⚠️ <b>HIGH MEMORY ALERT</b>
RAM: <b>$current_ram_str</b>
Swap: $current_swap_str
Load: <code>$load_avg</code>

Top Processes by RAM:
<code>$top_procs</code>")
    fi
  fi

  # 2. CPU Load Check (Load average > 2.0 on 1 vCPU)
  load_1m=$(echo "$load_avg" | awk -F',' '{print $1}' | awk '{print $1}')
  load_int=${load_1m%.*}
  if [ "${load_int:-0}" -ge 2 ]; then
    if ! should_debounce "/tmp/stockpanic_cpu_alert.time" 1800; then # 30 mins cooldown
      top_cpu_procs=$(ps -eo pid,%cpu,%mem,cmd --sort=-%cpu | head -n 6 | awk 'NR>1 {printf "• PID %s: %s%% CPU - %s\n", $1, $2, $4}')
      alerts+=("⚠️ <b>HIGH CPU LOAD ALERT</b>
Load Avg: <b>$load_avg</b>
RAM: $current_ram_str

Top Processes by CPU:
<code>$top_cpu_procs</code>")
    fi
  fi

  # 2. Container Health Check
  expected_containers=("bazaarnews-db-1" "bazaarnews-web-1" "bazaarnews-live-1" "bazaarnews-ingest-1" "bazaarnews-alerts-1" "bazaarnews-pipeline-1" "bazaarnews-account-1")
  missing_or_unhealthy=()

  for c in "${expected_containers[@]}"; do
    status=$(docker inspect --format '{{.State.Status}} (health: {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}})' "$c" 2>/dev/null || echo "not_found")
    if [[ "$status" == *"not_found"* ]] || [[ "$status" == *"exited"* ]] || [[ "$status" == *"unhealthy"* ]] || [[ "$status" == *"dead"* ]]; then
      missing_or_unhealthy+=("$c: $status")
    fi
  done

  if [ ${#missing_or_unhealthy[@]} -gt 0 ]; then
    if ! should_debounce "/tmp/stockpanic_down_alert.time" 900; then # 15 mins cooldown
      bad_list=$(printf "• %s\n" "${missing_or_unhealthy[@]}")
      alerts+=("🚨 <b>CONTAINER DOWN / UNHEALTHY</b>
The following containers require attention:
<code>$bad_list</code>")
    fi
  fi

  # 3. Disk Space Check (> 85%)
  if [ "$disk_pcent" -ge 85 ]; then
    if ! should_debounce "/tmp/stockpanic_disk_alert.time" 3600; then # 60 mins cooldown
      alerts+=("⚠️ <b>DISK SPACE WARNING</b>
Root partition usage is <b>${disk_pcent}%</b>: $disk_str")
    fi
  fi

  # Dispatch any alerts
  if [ ${#alerts[@]} -gt 0 ]; then
    for alert in "${alerts[@]}"; do
      full_msg="🚨 <b>BazaarPanic Watchdog Warning</b>
━━━━━━━━━━━━━━━━━━━━
Time: <code>$ist_time</code>

$alert"
      send_telegram "$full_msg"
    done
  fi
}

run_prebell() {
  get_vitals
  
  # Check containers
  running_count=$(docker ps -q | wc -l)
  unhealthy=$(docker ps --format '{{.Names}} ({{.Status}})' | grep -i 'unhealthy' || true)
  if [ -z "$unhealthy" ] && [ "$running_count" -ge 7 ]; then
    containers_status="All 7 Containers Healthy ✅"
    overall_status="ALL SYSTEMS GREEN 🟢"
  else
    containers_status="Issues: ${unhealthy:-running $running_count/7}"
    overall_status="DEGRADED ⚠️"
  fi

  # Verify web & live endpoints
  web_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:3002/v1/session || echo "000")
  live_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 http://127.0.0.1:3003/v1/live || echo "000")
  endpoints_status="Web (3002): HTTP $web_code • Live SSE (3003): HTTP $live_code"

  # DB telemetry
  item_count=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT count(*) FROM item;" 2>/dev/null | tr -d ' ' || echo 'N/A')
  story_count=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT count(*) FROM story;" 2>/dev/null | tr -d ' ' || echo 'N/A')
  latest_item=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -c "SELECT to_char(max(published_at), 'YYYY-MM-DD HH24:MI IST') FROM item;" 2>/dev/null | tr -d ' ' || echo 'N/A')

  # Quality & Retention telemetry
  metrics_raw=$(docker exec bazaarnews-db-1 psql -U postgres -d stockpanic -t -A -F '|' -c "
SELECT 
  (SELECT count(distinct s.id) FROM story s WHERE s.first_seen_at >= now() - interval '24 hours' AND s.merged_into IS NULL) as stories_24h,
  (SELECT count(distinct st.story_id) FROM story s JOIN story_tag st ON st.story_id = s.id WHERE s.first_seen_at >= now() - interval '24 hours' AND s.merged_into IS NULL) as tagged_24h,
  (SELECT count(*) FROM (SELECT headline FROM item WHERE first_seen_at >= now() - interval '24 hours' GROUP BY headline HAVING count(*) > 1) d) as dupes_24h,
  (SELECT count(*) FROM app_user) as total_users,
  (SELECT count(*) FROM app_user WHERE created_at >= now() - interval '7 days') as new_users_7d,
  (SELECT count(*) FROM watchlist_entry) as total_watchlists,
  (SELECT count(*) FROM comment) as total_comments,
  (SELECT count(*) FROM comment WHERE created_at >= now() - interval '24 hours') as comments_24h;
" 2>/dev/null || echo "0|0|0|0|0|0|0|0")

  IFS='|' read -r q_stories q_tagged q_dupes u_total u_new7d u_watchlists u_comments u_comments24h <<< "$metrics_raw"
  tag_pct=0
  if [ "${q_stories:-0}" -gt 0 ]; then
    tag_pct=$(( q_tagged * 100 / q_stories ))
  fi

  msg="🔔 <b>BazaarPanic Pre-Market Opening Bell Report</b>
━━━━━━━━━━━━━━━━━━━━
Session: <b>$overall_status</b>
Time: <code>$ist_time</code>

🖥️ <b>SYSTEM VITALS</b>
• <b>RAM:</b> $current_ram_str
• <b>Swap:</b> $current_swap_str
• <b>Load Avg:</b> <code>$load_avg</code>
• <b>Disk:</b> $disk_str

🐳 <b>SERVICES & CONTAINERS</b>
• <b>Containers:</b> $containers_status
• <b>Endpoints:</b> $endpoints_status

📰 <b>MARKET DATA PIPELINE</b>
• Total Items: <b>$item_count</b>
• Clustered Stories: <b>$story_count</b>
• Latest Ingested Item: <code>$latest_item</code>

📊 <b>NEWS QUALITY & TICKER TAGGING (24h)</b>
• Stories Ingested: <b>${q_stories:-0}</b> (Tagging Rate: <b>${tag_pct}%</b> • ${q_tagged:-0} tagged)
• Duplicate Stories Detected: <b>${q_dupes:-0}</b>

👥 <b>AUDIENCE & RETENTION TELEMETRY</b>
• Registered Members: <b>${u_total:-0}</b> (+${u_new7d:-0} new this week)
• Active Watchlist Entries: <b>${u_watchlists:-0}</b>
• Community Comments: <b>${u_comments:-0}</b> (${u_comments24h:-0} in last 24h)

⚡ Market opens at 09:15 AM IST. Ingestion pipelines and client push channels are standing by."

  send_telegram "$msg"
}

case "$mode" in
  check)
    run_check
    ;;
  prebell)
    run_prebell
    ;;
  status)
    run_prebell
    ;;
  quality)
    run_prebell
    ;;
  *)
    echo "Usage: $0 {check|prebell|status|quality}"
    exit 1
    ;;
esac
