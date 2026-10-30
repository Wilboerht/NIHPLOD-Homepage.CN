/**
 * CI：检查所有非 GET 管理端 API 是否接入了审计写入。
 *
 * 用法：npm run check:audit-coverage
 * 例外：在 ALLOWLIST 中写明原因。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src", "app", "api", "admin");
const AUDIT_CALL = /createAuditLog|beginAuditLog|createAuditLogStrict|createAuditLogTx/;
const MUTATING_EXPORT = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/;

/** 明确不需要写审计的端点（必须写原因） */
const ALLOWLIST = new Map<string, string>([
  // 审批路由的审计在 src/lib/admin-approval.ts 内统一写入，静态扫描看不到
  ["src/app/api/admin/approvals/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  ["src/app/api/admin/approvals/[id]/approve/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  ["src/app/api/admin/approvals/[id]/cancel/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  ["src/app/api/admin/approvals/[id]/execute/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  ["src/app/api/admin/approvals/[id]/reject/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  ["src/app/api/admin/approvals/[id]/retry/route.ts", "审计在 src/lib/admin-approval.ts 内完成"],
  [
    "src/app/api/admin/spent-adjustments/upload/route.ts",
    "凭证上传仅暂存文件，最终提交由 POST /api/admin/spent-adjustments 写入严格审计",
  ],
]);

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...walk(path));
    else if (entry === "route.ts") result.push(path);
  }
  return result;
}

const failures: string[] = [];
for (const file of walk(ROOT)) {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  const source = readFileSync(file, "utf8");
  if (!MUTATING_EXPORT.test(source)) continue;
  if (AUDIT_CALL.test(source)) {
    if (/createAuditLog\([\s\S]{0,600}?\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(source)) {
      failures.push(`${rel}: createAuditLog(...).catch(() => {}) 会静默丢失审计`);
    }
    continue;
  }
  if (ALLOWLIST.has(rel)) continue;
  failures.push(`${rel}: 非 GET 端点未发现审计写入，且不在 allowlist`);
}

if (failures.length > 0) {
  console.error("审计覆盖率检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("审计覆盖率检查通过");
