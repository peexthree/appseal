#!/usr/bin/env bash
# AppSeal local-store backup: tars db/ (scan records + registry.json) into
# backups/db-YYYYMMDD-HHMM.tar.gz and prunes archives older than 14 days.
#
# Cron example (daily 04:10, on the VPS running the Docker deployment):
#   10 4 * * * /path/to/appmot/scripts/backup-db.sh >> /path/to/appmot/backups/backup.log 2>&1

set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
tar -czf "backups/db-$(date +%Y%m%d-%H%M).tar.gz" db
# 14 days retention
find backups -name 'db-*.tar.gz' -type f -mtime +14 -delete
