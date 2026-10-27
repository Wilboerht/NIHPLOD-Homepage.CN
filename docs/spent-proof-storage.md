# 消费补录凭证存储与运维

## 1. 存储模型

当前生产未启用私有 OSS，消费补录凭证使用本地私有存储：

```text
private/spent-adjustments/<userId>/<uuid>.webp
```

- key：`private-local:spent-adjustments/<userId>/<uuid>.webp`
- 目录权限：`0700`
- 文件权限：`0600`
- 必须部署在**单实例 + 持久盘**服务器；多实例 / Serverless / 无持久卷不适用。
- `private/` 与数据库必须成对备份、成对恢复。

## 2. 环境变量

```env
# 允许本地私有凭证存储（生产必须显式开启）
ALLOW_LOCAL_SPENT_PROOF_STORAGE=true

# 历史公开存储已下线，生产必须为 false
ALLOW_PUBLIC_SPENT_PROOF_STORAGE=false

# 不配置私有 OSS 时保持为空
ALI_OSS_PRIVATE_BUCKET=
```

修改 `.env` 后需要 `pm2 restart nihplod-app --update-env`。Next.js 会重新加载 `.env`。

## 3. 访问方式

凭证不再通过 Nginx `/uploads/` 静态目录暴露，必须经鉴权 API：

- 用户端：`GET /api/user/spent-adjustments/image?key=...`
- OAuth：`GET /api/oauth/spent-adjustments/image?key=...`（需要 `membership` scope）
- 管理端：`GET /api/admin/spent-adjustments/image?key=...`（需要 `spent:read`，写 `spent_receipt_view` 审计）

本地文件以流式响应返回，统一：

```text
Cache-Control: no-store, private
Pragma: no-cache
Content-Type: image/webp
X-Content-Type-Options: nosniff
Content-Disposition: inline; filename="receipt.webp"
```

## 4. 启动/部署

```bash
cd /var/www/NIHPLOD-Homepage.CN
mkdir -p private/spent-adjustments
chmod 700 private private/spent-adjustments
```

确认：

```bash
find private/spent-adjustments -type f -printf '%m %s %p\n'
```

## 5. 备份

现有 `backup-nihplod-resumes.sh` 使用：

```bash
tar -czf "$DEST/resumes-$(date +%F).tar.gz" -C "$SRC" private
```

会包含 `private/spent-adjustments/`。恢复时先恢复数据库，再恢复 `private/`，最后重启应用。

## 6. 历史公开凭证清理

历史 `/uploads/spent-adjustments/...` 必须删除，不迁移：

```bash
# 1) 先阻断公网访问
# Nginx 在 /uploads/ alias 前增加：
# location ^~ /uploads/spent-adjustments/ { return 410; add_header Cache-Control "no-store" always; }
sudo nginx -t && sudo systemctl reload nginx

# 2) Cloudflare purge 对应的完整 URL

# 3) dry-run，确认清单
npx tsx scripts/purge-public-spent-proofs.ts

# 4) 删除文件并从 SpentAdjustmentApplication.images 移除引用
npx tsx scripts/purge-public-spent-proofs.ts --apply
```

脚本只处理 `/uploads/spent-adjustments/` 前缀，路径必须落在 `public/uploads/spent-adjustments/` 内；不会删除其他 `/uploads/` 文件或申请记录本身。

清理后验证：

```bash
curl -sI 'https://nihplod.cn/uploads/spent-adjustments/<旧文件>' | head -5   # 410
sudo -u postgres psql -d nihplod_db -c \
  "SELECT id, images FROM \"SpentAdjustmentApplication\" WHERE EXISTS (SELECT 1 FROM unnest(images) img WHERE img LIKE '/uploads/%');"
```

## 7. 账号注销

注销执行器只删除当前用户前缀的 `private-local:spent-adjustments/<userId>/...`：

- 任意 `/uploads/...` 不会通过凭证清理路径删除；
- 单个文件删除失败不阻断注销，会在审计详情中标记 `proofPurgeFailed`；
- 申请记录的 `images` 会在注销事务中清空。

## 8. 限制

- 本地私有存储不支持多实例共享；水平扩展时必须改用私有 OSS。
- 目录必须位于持久盘并纳入备份；不要放在 `public/` 或 CDN 可直读目录。
