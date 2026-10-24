# 简历存储与候选人数据运维手册

本文覆盖候选人简历（`JobApplication`）的存储、迁移、缓存、孤儿清理和保留期操作。

## 1. 存储模型

新代码的 `resumePath` 显式携带存储后端：

| Key 前缀 | 存储位置 | 何时产生 |
| --- | --- | --- |
| `private-oss:resumes/<uuid>.pdf` | 阿里云私有 OSS bucket | 配置了 `ALI_OSS_PRIVATE_BUCKET`（优先） |
| `private-local:resumes/<uuid>.pdf` | 服务器 `private/resumes/` | 非生产环境，或显式 `ALLOW_LOCAL_RESUME_STORAGE=true` |
| `private:resumes/<uuid>.pdf` | 历史 key，后端不确定 | 旧版本；读取时先查本地，再回退私有 OSS |

相关代码：

- `src/lib/resume-files.ts`
- `src/lib/ali-oss.ts`
- `src/app/api/admin/applications/[id]/resume/route.ts`

### 生产环境要求

生产环境默认 **fail-closed**：未配置私有 OSS 且未显式开启本地逃生开关时，简历上传返回 503。

```dotenv
ALI_OSS_REGION=oss-cn-hangzhou
ALI_OSS_BUCKET=your-public-bucket
ALI_OSS_ACCESS_KEY_ID=...
ALI_OSS_ACCESS_KEY_SECRET=...
ALI_OSS_PRIVATE_BUCKET=your-private-bucket

# 仅单实例 + 持久卷 + 已备份时才能开启
ALLOW_LOCAL_RESUME_STORAGE=false
```

同时确认：

```dotenv
TRUST_PROXY=true
TRUST_PROXY_HOPS=1
RATE_LIMIT_STORAGE=database
```

可用 `npm run check:production-env` 做发布前核查（非生产环境默认 SKIP，`--force` 强制检查）。

## 2. 迁移存量数据

### 2.1 先盘点

```sql
SELECT count(*) FROM "JobApplication" WHERE "resumePath" NOT LIKE 'private%';
```

### 2.2 Dry-run

```bash
npm run migrate:resumes
```

脚本会输出：

- 公开 → 私有（本地 `/uploads/resumes` 或公开 OSS URL）
- 本地私有 → 私有 OSS（配置私有 bucket 后）
- 无法识别的路径（需人工处理）

### 2.3 实际执行

```bash
npm run migrate:resumes -- --apply
```

迁移成功后脚本会更新 `resumePath` 并尝试删除旧公开文件。若删除失败，日志会提示需要人工清理。

### 2.4 清理公网缓存

历史文件位于 `/uploads/resumes/*`，`next.config.mjs` 曾为 `/uploads` 设置一年 `immutable` 缓存。

代码层面已通过 `src/middleware.ts` 对该路径统一返回 **410 Gone**，但 CDN/浏览器里**已经缓存**的副本仍需主动处理：

1. 在 CDN/反代上 purge `/uploads/resumes/*`；
2. 确认旧文件已从服务器/OSS 删除；
3. 抽查旧 URL 返回 410 或 404，而不是 200。

## 3. 孤儿文件清理

删除申请时如果 OSS/磁盘短暂不可用，可能出现“DB 记录已删、文件仍在”。删除接口会写审计 `PARTIAL` 并记录日志，便于发现。

定期清理：

```bash
npm run resumes:cleanup-orphans          # dry-run
npm run resumes:cleanup-orphans -- --apply
```

建议低峰期执行，避免与“刚上传、尚未写库”的请求竞争。

## 4. 保留期清理

候选人简历属于 PII，建议明确保留期（例如 6/12/24 个月），并由外部 cron 定期执行：

```bash
npm run applications:purge -- --older-than-days=365          # dry-run
npm run applications:purge -- --older-than-days=365 --apply
```

脚本会删除 `JobApplication` 记录及对应简历文件。**默认 dry-run，必须显式 `--apply`**。

也可通过环境变量提供天数：

```dotenv
APPLICATION_RETENTION_DAYS=365
```

## 5. 部署形态注意事项

- **Vercel/Serverless**：请求体有平台上限（Vercel 约 4.5MB），文件系统只读；必须使用私有 OSS，否则 10MB 简历无法上传/持久化。
- **多实例**：不要用 `ALLOW_LOCAL_RESUME_STORAGE=true`；本地文件不共享。
- **单实例 + 本地卷**：必须确保 `private/` 在持久卷上、纳入备份，并设置文件权限（目录 0700 / 文件 0600）。
- **OSS 私有桶**：确认 bucket ACL 为 private，开启必要的服务端加密与生命周期策略。

## 6. 访问与审计

- 列表接口只返回脱敏字段；详情单独请求，并写 `application_detail_view` 审计。
- 下载写 `resume_download` 审计；私有 OSS 使用 5 分钟签名 URL，并强制 `Content-Disposition: attachment`。
- 删除申请需要 `applications:delete` + TOTP step-up；文件删除失败时审计 outcome 为 `PARTIAL`。
