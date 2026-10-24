#!/usr/bin/env bash
# 每日备份 nihplod_db（本地）。建议 crontab：
#   30 3 * * * root /var/www/NIHPLOD-Homepage.CN/scripts/backup-nihplod-db.sh >> /var/log/nihplod-db-backup.log 2>&1
set -euo pipefail

DB_NAME="${DB_NAME:-nihplod_db}"
BACKUP_DIR="${BACKUP_DIR:-/root/db-backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

sudo -u postgres pg_dump -Fc "${DB_NAME}" -f "${FILE}"
chmod 600 "${FILE}"
sha256sum "${FILE}" > "${FILE}.sha256"
chmod 600 "${FILE}.sha256"

find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump" -mtime +"${KEEP_DAYS}" -delete
find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump.sha256" -mtime +"${KEEP_DAYS}" -delete

echo "[backup-nihplod-db] $(date -Is) ${FILE}"
