#!/usr/bin/env bash
# 同步本地审计归档到同盘备份目录（防误删）。异地备份需另行配置。
# 建议 crontab：
#   45 2 * * * root /var/www/NIHPLOD-Homepage.CN/scripts/backup-audit-archive.sh >> /var/log/nihplod-audit-backup.log 2>&1
set -euo pipefail

SRC="${AUDIT_ARCHIVE_DIR:-/var/lib/nihplod/audit-archive}"
DST="${AUDIT_ARCHIVE_BACKUP_DIR:-/var/backups/nihplod/audit-archive}"

mkdir -p "${SRC}" "${DST}"
chmod 700 "${SRC}" "${DST}"

rsync -a --chmod=D700,F600 "${SRC}/" "${DST}/"
echo "[backup-audit-archive] $(date -Is) ${SRC} -> ${DST}"
