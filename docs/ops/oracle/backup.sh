#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/var/backups/stockpanic
mkdir -p "$backup_dir"
output="$backup_dir/stockpanic-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
temporary="$output.partial"
trap 'rm -f "$temporary"' EXIT
docker exec bazaarnews-db-1 pg_dump -U postgres -d stockpanic -Fc \
  | age -R /etc/stockpanic/backup-recipient -o "$temporary"
test -s "$temporary"
mv "$temporary" "$output"
config_output="${output%.dump.age}.config.tar.gz.age"
config_temporary="$config_output.partial"
trap 'rm -f "$temporary" "$config_temporary"' EXIT
tar -czf - -C / etc/stockpanic/app.env etc/stockpanic/owner.env etc/stockpanic/pg-password etc/caddy/Caddyfile \
  | age -R /etc/stockpanic/backup-recipient -o "$config_temporary"
test -s "$config_temporary"
mv "$config_temporary" "$config_output"
# Bounded retention applies only to this script's encrypted backup filenames.
find "$backup_dir" -maxdepth 1 -type f -name 'stockpanic-*.dump.age' -mtime +7 -delete
find "$backup_dir" -maxdepth 1 -type f -name 'stockpanic-*.config.tar.gz.age' -mtime +7 -delete
printf 'Encrypted backup saved: %s\n' "$output"
