# 大表索引与审计分区运维

## 手工并发索引

Prisma schema 无法表达 GIN/trgm 与部分索引，因此以 `prisma/index-manifest.ts` 为准。

```powershell
npm run db:indexes:apply
npm run db:indexes:check
```

- `db:indexes:apply` 逐条执行 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`，不包事务。
- 已存在但 `indisvalid=false` 的索引会先 `DROP INDEX CONCURRENTLY` 再重建。
- `pg_trgm` 不可用时 GIN 索引会被跳过并告警。
- 生产建议在低峰期执行，会话已设置 `lock_timeout=5s`。

## AuditLog 分区

`20261114030000_audit_log_partitioned` 会把 `AuditLog` 重建为按月 RANGE 分区：

- 主键：`(id, createdAt)`
- 链唯一：`(chainSeq, createdAt)`，全局 `chainSeq` 由 `AuditChainCursor` 分配
- 旧表保留为 `AuditLog_legacy`，验证 7 天后手工删除
- 分区父表不支持 `CREATE INDEX CONCURRENTLY`，因此 AuditLog 索引在迁移离线阶段创建

每月维护（可放入 cron）：

```powershell
npx tsx scripts/audit-partition-maintenance.ts --plan --create-ahead=3
npx tsx scripts/audit-partition-maintenance.ts --create-ahead=3
```

## 生产顺序

1. 备份数据库与审计归档。
2. `npx prisma migrate deploy`（维护窗口，暂停审计写入）。
3. `npm run db:indexes:apply`
4. `npm run db:indexes:check`
5. `npm run db:partitions:maintain -- --create-ahead=3`
6. 部署应用并验证审计/对账/导入撤销。

禁止在生产使用 `prisma db push`。
