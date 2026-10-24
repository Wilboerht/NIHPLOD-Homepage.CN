/**
 * 生产运行时配置核查。
 *
 * 运行：npm run check:production-env
 * 非生产环境默认 SKIP；加 --force 可强制检查。
 *
 * 覆盖会直接影响线上可用性的配置：
 * - TRUST_PROXY / TRUST_PROXY_HOPS：否则 getClientIP 生产抛错，所有限流接口 500
 * - RATE_LIMIT_STORAGE：否则 rateLimit 生产抛错
 * - ALI_OSS_PRIVATE_BUCKET / ALLOW_LOCAL_RESUME_STORAGE：简历 PII 存储策略
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

const force = process.argv.includes("--force");
const isProduction = process.env.NODE_ENV === "production";

interface CheckResult {
  status: "PASS" | "WARN" | "SKIP";
  name: string;
  message: string;
}

const results: CheckResult[] = [];

function pass(name: string, message: string) {
  results.push({ status: "PASS", name, message });
}
function warn(name: string, message: string) {
  results.push({ status: "WARN", name, message });
}
function skip(name: string, message: string) {
  results.push({ status: "SKIP", name, message });
}

if (!isProduction && !force) {
  skip("ALL", "NODE_ENV 不是 production；使用 --force 可强制检查");
} else {
  if (process.env.TRUST_PROXY === "true") {
    pass("TRUST_PROXY", "已启用可信代理头");
  } else {
    warn(
      "TRUST_PROXY",
      "未设置 true：生产环境 getClientIP 会抛错，所有限流接口将 500（Nginx/ALB 后必须设为 true）"
    );
  }

  const hops = process.env.TRUST_PROXY_HOPS;
  if (hops && /^\d+$/.test(hops)) {
    if (hops === "0") {
      warn("TRUST_PROXY_HOPS", "当前为 0（取 XFF 最后一段）；请确认与反代层数一致");
    } else {
      pass("TRUST_PROXY_HOPS", `反代层数 ${hops}`);
    }
  } else {
    warn("TRUST_PROXY_HOPS", "未设置或非法；建议按实际反代层数配置（Nginx 一层填 1）");
  }

  const storage = process.env.RATE_LIMIT_STORAGE;
  if (storage === "database") {
    pass("RATE_LIMIT_STORAGE", "database（支持多实例）");
  } else if (storage === "memory") {
    warn("RATE_LIMIT_STORAGE", "memory 仅适用于单实例；多实例部署会被绕过");
  } else {
    warn(
      "RATE_LIMIT_STORAGE",
      "未设置 database|memory：生产环境 rateLimit 会抛错，投递/管理端接口将 500"
    );
  }

  if (process.env.ALI_OSS_PRIVATE_BUCKET) {
    const missing = ["ALI_OSS_REGION", "ALI_OSS_ACCESS_KEY_ID", "ALI_OSS_ACCESS_KEY_SECRET"].filter(
      (name) => !process.env[name]
    );
    if (missing.length > 0) {
      warn(
        "ALI_OSS_PRIVATE_BUCKET",
        `已配置私有 bucket，但缺少 ${missing.join(", ")}：私有 OSS 客户端无法初始化，简历上传会 503`
      );
    } else {
      pass("ALI_OSS_PRIVATE_BUCKET", "已配置私有 OSS bucket 与凭证");
    }
  } else if (process.env.ALLOW_LOCAL_RESUME_STORAGE === "true") {
    warn(
      "ALI_OSS_PRIVATE_BUCKET",
      "未配置私有 OSS，但 ALLOW_LOCAL_RESUME_STORAGE=true：简历落本地 private/，请确认持久卷、备份与单实例"
    );
  } else {
    warn(
      "ALI_OSS_PRIVATE_BUCKET",
      "未配置私有 OSS 且未开启本地逃生开关：简历上传将 503（PII 不允许落公开存储）"
    );
  }

  if (process.env.STORAGE_MODE === "local") {
    warn("STORAGE_MODE", "local：其他公开上传也写本地磁盘，请确认持久卷/备份");
  }
}

for (const result of results) {
  const label = result.status.padEnd(4);
  console.log(`[${label}] ${result.name}: ${result.message}`);
}

const hasWarnings = results.some((result) => result.status === "WARN");
if (hasWarnings) {
  console.log("\n存在 WARN 项，请按提示核对生产环境配置。");
}

const hasCritical = results.some(
  (result) =>
    result.status === "WARN" &&
    (result.name === "TRUST_PROXY" || result.name === "RATE_LIMIT_STORAGE")
);
if (hasCritical) process.exitCode = 1;
