#!/usr/bin/env bash
# 归档文件加固：chmod 0400，可选 chattr +i（需要 root 且文件系统支持）。
# 建议在 backup-audit-archive.sh 成功之后运行。
set -euo pipefail

ROOT="${AUDIT_ARCHIVE_DIR:-/var/lib/nihplod/audit-archive}"
HARDEN_IMMUTABLE="${AUDIT_ARCHIVE_HARDEN_IMMUTABLE:-false}"

find "${ROOT}" -type f -name 'events.jsonl.gz' -exec chmod 0400 {} \;
find "${ROOT}" -type f -name 'manifest.json' -exec chmod 0400 {} \;

if [ "${HARDEN_IMMUTABLE}" = "true" ]; then
  if command -v chattr >/dev/null 2>&1; then
    find "${ROOT}" -type f \( -name 'events.jsonl.gz' -o -name 'manifest.json' \) \
      -exec chattr +i {} \; 2>/dev/null || true
  else
    echo "[audit-archive-harden] chattr 不可用，跳过 immutable 设置" >&2
  fi
fi

echo "[audit-archive-harden] $(date -Is) hardened ${ROOT}"
