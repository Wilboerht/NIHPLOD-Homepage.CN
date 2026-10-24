# 审计日志 v2

## 目标

- **广**：管理端所有写操作、敏感读、导出、认证/权限/SSO 事件都有记录。
- **全**：哈希链、每日锚点、本地归档、校验、保留期、法律保留、告警。
- **细**：操作者快照、会话 JTI、请求 ID、目标快照、风险等级、原因、before/after。

## 写入模型

- `createAuditLog`：best-effort，用于普通读/日志类事件。
- `beginAuditLog` + `finishAuditLog`：写前意图 + 终态，失败返回 null，调用方必须拒绝高风险操作。
- `createAuditLogTx`：与业务事务同库写入。
- `createAuditLogStrict`：写入失败直接抛错。

新增操作必须：

1. 在 `src/lib/audit.ts` 的 `AUDIT_ACTIONS` 中登记；
2. 在 `src/lib/audit-labels.ts` 中提供中文标签；
3. 在 `src/lib/audit-registry.ts` 中补充分类/风险/写入模式（未显式配置时使用默认规则）；
4. 高风险操作填写 `reason`；
5. 使用 `adminAuditContext(admin, request)` 自动注入操作者快照、`sessionJti`、来源。

## 完整性

- 每条 `AuditLog` 有 `chainSeq/prevHash/entryHash`。
- `entryHash` 覆盖不可变信封；`outcome/detail/targetId/finalizedAt` 由每日锚点覆盖。
- 每日按 UTC+8 分别对 `AuditLog` 和 `SsoAuditEvent` 生成 v2 锚点；锚点通过 `prevAnchorHash` 串联。
- v1 锚点保留，不删除；新锚点 `signatureVersion=2`。
- `AuditLog` 触发器：
  - 禁止 DELETE（除 `audit_retention` 角色）；
  - 只允许 `PENDING → 终态`。
- `SsoAuditEvent` 禁止 UPDATE/DELETE（DELETE 仅 `audit_retention`）。
- `AuditLogAnchor` 禁止 DELETE；只允许更新归档/校验字段。

## 本地归档

```
/var/lib/nihplod/audit-archive/<stream>/YYYY-MM-DD/events.jsonl.gz
/var/lib/nihplod/audit-archive/<stream>/YYYY-MM-DD/manifest.json
```

- 私有目录，必须在 `public/` 之外。
- 排他创建、0600 文件、0700 目录。
- manifest 包含条数、digest、signature、prevAnchorHash、sha256。
- `AUDIT_ARCHIVE_BACKUP_DIR` 是同盘副本，只防误删，不是异地备份。
- 校验：

```bash
npx tsx scripts/audit-verify.ts --day 2026-10-23
npx tsx scripts/audit-verify.ts --from 2026-10-01 --to 2026-10-24
```

## 到期清理

默认**不自动删除**。流程：

1. 后台「审计保留」页预览；
2. owner 点击「执行到期清理」；
3. 输入原因、确认短语、TOTP，并确认本地归档是唯一副本；
4. 创建 `AuditRetentionJob`（PENDING，15 分钟有效）；
5. 系统 cron 运行 `scripts/audit-retention-worker.ts`；
6. worker 使用 `/etc/nihplod/audit-retention.env` 中的 `AUDIT_RETENTION_DATABASE_URL`（`audit_retention` 角色）执行；
7. 删除前重新校验 previewHash、归档、备份、法律保留；
8. 删除结果写入 `AuditRetentionJob` 和 `audit_retention_execute` 审计记录。

### 角色

```bash
sudo -u postgres psql -d nihplod_db -f scripts/create-audit-retention-role.sql
```

把密码写入 `/etc/nihplod/audit-retention.env`（root 0600），不要放进 Web `.env`：

```env
AUDIT_RETENTION_ENABLED=true
AUDIT_RETENTION_ALLOW_LOCAL_ONLY=true
AUDIT_RETENTION_DATABASE_URL=postgresql://audit_retention:...@localhost:5432/nihplod_db
AUDIT_RETENTION_APPROVAL_KEY=...
AUDIT_INTEGRITY_HMAC_KEY=...
```

> 该文件只放 retention/审计密钥，**不要放 DATABASE_URL**；worker 的应用库连接来自项目 `.env`。

### cron

```cron
* * * * * root cd /var/www/NIHPLOD-Homepage.CN && /usr/local/bin/node node_modules/.bin/tsx scripts/audit-retention-worker.ts >> /var/log/nihplod-audit-retention.log 2>&1
```

## 备份

- 每日 `pg_dump`：

```cron
30 3 * * * root /var/www/NIHPLOD-Homepage.CN/scripts/backup-nihplod-db.sh >> /var/log/nihplod-db-backup.log 2>&1
```

- 归档同盘副本：

```cron
45 2 * * * root /var/www/NIHPLOD-Homepage.CN/scripts/backup-audit-archive.sh >> /var/log/nihplod-audit-backup.log 2>&1
```

- 没有异地备份时，不要开启 `AUDIT_RETENTION_ENABLED`；本地盘损坏会同时丢失数据库和归档。

## 告警

- 管理员登录/TOTP 连续失败；
- 高危/严重操作；
- PENDING 堆积；
- 锚点缺失；
- 每日 09:00 审计日报。

通知使用 `WECOM_BOT_WEBHOOK`；未配置时只写日志。

## 生产部署（本地归档）

```bash
# 1. 目录（app 以 root 运行 PM2）
sudo install -d -m 700 /var/lib/nihplod/audit-archive
sudo install -d -m 700 /var/backups/nihplod/audit-archive
sudo install -d -m 700 /var/lib/nihplod/audit-exports

# 2. 应用 .env 追加
AUDIT_ARCHIVE_DIR=/var/lib/nihplod/audit-archive
AUDIT_ARCHIVE_BACKUP_DIR=/var/backups/nihplod/audit-archive
AUDIT_EXPORT_DIR=/var/lib/nihplod/audit-exports
AUDIT_RETENTION_ENABLED=true
AUDIT_RETENTION_ALLOW_LOCAL_ONLY=true
AUDIT_RETENTION_APPROVAL_KEY=$(openssl rand -hex 32)

# 3. 创建 retention 角色（先改脚本里的 CHANGE_ME，或创建后 ALTER ROLE）
sudo -u postgres psql -d nihplod_db -f scripts/create-audit-retention-role.sql
sudo -u postgres psql -d nihplod_db -c "ALTER ROLE audit_retention PASSWORD '<强随机密码>';"

# 4. 迁移 + 回填 + 校验（先停 Web，避免旧代码在新 schema 上继续写）
pm2 stop nihplod-app
npx prisma migrate deploy
npx tsx scripts/audit-backfill-v2.ts
npx tsx scripts/audit-verify.ts --from 2026-05-08 --to 2026-10-24
pm2 start nihplod-app

# 5. root-only worker 环境（不要把 DATABASE_URL 放进去）
sudo install -d -m 700 /etc/nihplod
sudo tee /etc/nihplod/audit-retention.env >/dev/null <<'EOF'
AUDIT_RETENTION_ENABLED=true
AUDIT_RETENTION_ALLOW_LOCAL_ONLY=true
AUDIT_RETENTION_DATABASE_URL=postgresql://audit_retention:<强随机密码>@localhost:5432/nihplod_db
AUDIT_RETENTION_APPROVAL_KEY=<与 app .env 同值>
AUDIT_INTEGRITY_HMAC_KEY=<与 app .env 同值>
EOF
sudo chmod 600 /etc/nihplod/audit-retention.env
```

## 常用命令

```bash
# CI：检查非 GET 管理端端点是否接入审计
npm run check:audit-coverage

# 回填 v2（可在 prisma migrate deploy 之后执行；
# 触发器允许 entryHash 为空的历史行回填，回填完成后自动收紧）
npx tsx scripts/audit-backfill-v2.ts

# 校验
npx tsx scripts/audit-verify.ts --from 2026-05-08 --to 2026-10-24

# 查询已归档日志
npx tsx scripts/audit-archive-search.ts --day 2026-10-23 --action delete_admin

# 备份
./scripts/backup-nihplod-db.sh
./scripts/backup-audit-archive.sh
```
