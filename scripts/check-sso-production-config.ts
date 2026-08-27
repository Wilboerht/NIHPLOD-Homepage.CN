/**
 * SSO 生产配置核查脚本
 *
 * 逐项核对 docs/sso-deployment.md 第 2 节的强制环境变量，输出 PASS / FAIL / SKIP 清单，
 * 任一项 FAIL 时以退出码 1 结束（可用于 CI / 发布前检查）。
 *
 * 运行方式：npm run check:sso-config
 * 加载 .env / .env.local / .env.production（覆盖服务器只使用 .env 的部署方式）；
 * 生产环境也可直接以系统环境变量运行（dotenv 不覆盖已设置的变量，先加载的优先生效）。
 */
import dotenv from "dotenv";

// 加载环境变量：dotenv 不覆盖已设置的变量，按 Next.js 优先级的逆序加载
// （先 .env，再 .env.production，最后 .env.local），使优先级与 Next.js 运行时一致
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env.local" });

// 与 src/lib/jwt.ts 的 MIN_SECRET_LENGTH 保持一致
const MIN_SECRET_LENGTH = 32;

interface CheckResult {
  status: "PASS" | "FAIL" | "SKIP";
  /** 检查项名称 */
  name: string;
  /** 检查结论说明 */
  message: string;
  /** FAIL 时的修复建议 */
  fix?: string;
}

const results: CheckResult[] = [];

function check(result: CheckResult): void {
  results.push(result);
}

// ============================================
// 1. 7 个 JWT Secret：必须存在且不少于 32 字符
//    （清单以 src/lib/jwt.ts 启动时校验为准，缺失时应用无法启动）
// ============================================

const JWT_SECRETS = [
  "JWT_ADMIN_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_WECHAT_BIND_SECRET",
  "JWT_WECHAT_EXCHANGE_SECRET",
  "JWT_ID_TOKEN_SECRET",
  "JWT_LOGOUT_SECRET",
] as const;

for (const name of JWT_SECRETS) {
  const value = process.env[name];
  if (!value) {
    check({
      status: "FAIL",
      name,
      message: "未配置，应用启动时会直接报错",
      fix: "生成强随机密钥：openssl rand -hex 32，写入环境变量后重启",
    });
  } else if (value.length < MIN_SECRET_LENGTH) {
    check({
      status: "FAIL",
      name,
      message: `长度不足（当前 ${value.length} 字符，要求 ≥ ${MIN_SECRET_LENGTH}）`,
      fix: "替换为不少于 32 字符的强随机串：openssl rand -hex 32",
    });
  } else {
    check({ status: "PASS", name, message: "已配置且长度达标" });
  }
}

// ============================================
// 2. RS256 密钥对：生产环境必须配置私钥（SDK 拒绝 HS256 token）
//    对应的 *_PREV_PUBLIC_KEY 轮换变量为可选，不配置不算 FAIL（标 SKIP）
// ============================================

const RS256_PRIVATE_KEYS = [
  { name: "JWT_ACCESS_PRIVATE_KEY", usage: "OAuth access_token RS256 签名" },
  { name: "JWT_ID_TOKEN_PRIVATE_KEY", usage: "OIDC id_token RS256 签名" },
  { name: "JWT_LOGOUT_TOKEN_PRIVATE_KEY", usage: "Backchannel logout token RS256 签名" },
] as const;

for (const { name, usage } of RS256_PRIVATE_KEYS) {
  if (process.env[name]) {
    check({ status: "PASS", name, message: `已配置（${usage}）` });
  } else {
    check({
      status: "FAIL",
      name,
      message: `未配置（${usage}）`,
      fix: "生成密钥对：npx tsx scripts/generate-oauth-rs256-keys.ts，将输出的单行 .env 值写入环境变量",
    });
  }
}

const RS256_PREV_PUBLIC_KEYS = [
  "JWT_OAUTH_ACCESS_PREV_PUBLIC_KEY",
  "JWT_OAUTH_ID_TOKEN_PREV_PUBLIC_KEY",
  "JWT_LOGOUT_TOKEN_PREV_PUBLIC_KEY",
] as const;

for (const name of RS256_PREV_PUBLIC_KEYS) {
  if (process.env[name]) {
    check({ status: "PASS", name, message: "已配置（密钥轮换过渡期上一代公钥）" });
  } else {
    check({
      status: "SKIP",
      name,
      message: "未配置（可选项，仅在密钥轮换过渡期需要）",
    });
  }
}

// ============================================
// 3. ALLOW_HS256_FALLBACK：生产环境禁止为 true
//    （长期开启会让 HS256 secret 泄露即可伪造 access/id/logout token）
// ============================================

const hs256Fallback = process.env.ALLOW_HS256_FALLBACK;
if (hs256Fallback === "true") {
  check({
    status: "FAIL",
    name: "ALLOW_HS256_FALLBACK",
    message: "当前为 true，RS256 验证失败会回退 HS256，仅限密钥迁移过渡期临时启用",
    fix: "过渡期结束后改为 false（或删除该变量），并确认上方三套 RS256 私钥均已配置",
  });
} else {
  check({
    status: "PASS",
    name: "ALLOW_HS256_FALLBACK",
    message: "未启用 HS256 回退（未设置或非 true）",
  });
}

// ============================================
// 4. TOKEN_BLACKLIST_STORAGE：多实例部署必须为 database
// ============================================

const blacklistStorage = process.env.TOKEN_BLACKLIST_STORAGE;
if (blacklistStorage === "database") {
  check({
    status: "PASS",
    name: "TOKEN_BLACKLIST_STORAGE",
    message: "已为 database，多实例共享撤销状态",
  });
} else {
  check({
    status: "FAIL",
    name: "TOKEN_BLACKLIST_STORAGE",
    message: `当前为 ${blacklistStorage ?? "未设置（默认 memory）"}，多实例时各实例黑名单不互通，撤销无法即时生效`,
    fix: "设置为 TOKEN_BLACKLIST_STORAGE=database",
  });
}

// ============================================
// 5. RATE_LIMIT_STORAGE：必须显式配置（防止限流被多实例绕过）
// ============================================

const rateLimitStorage = process.env.RATE_LIMIT_STORAGE;
if (rateLimitStorage) {
  check({
    status: "PASS",
    name: "RATE_LIMIT_STORAGE",
    message: `已显式配置为 ${rateLimitStorage}${rateLimitStorage !== "database" ? "（注意：多实例部署建议使用 database）" : ""}`,
  });
} else {
  check({
    status: "FAIL",
    name: "RATE_LIMIT_STORAGE",
    message: "未显式配置，将回退默认实现，多实例部署时限流可能被绕过",
    fix: "设置为 RATE_LIMIT_STORAGE=database（生产多实例）或 memory（仅单实例）",
  });
}

// ============================================
// 6. LOGIN_ATTEMPT_HMAC_KEY：登录尝试标识符 HMAC 密钥
//    （无盐 SHA-256 可被彩虹表还原手机号，见 src/lib/auth-security.ts）
// ============================================

const loginAttemptKey = process.env.LOGIN_ATTEMPT_HMAC_KEY;
if (!loginAttemptKey) {
  check({
    status: "FAIL",
    name: "LOGIN_ATTEMPT_HMAC_KEY",
    message: "未配置，应用启动时会直接报错",
    fix: "生成强随机密钥：openssl rand -hex 32，写入环境变量后重启",
  });
} else if (loginAttemptKey.length < MIN_SECRET_LENGTH) {
  check({
    status: "FAIL",
    name: "LOGIN_ATTEMPT_HMAC_KEY",
    message: `长度不足（当前 ${loginAttemptKey.length} 字符，要求 ≥ ${MIN_SECRET_LENGTH}）`,
    fix: "替换为不少于 32 字符的强随机串：openssl rand -hex 32",
  });
} else {
  check({
    status: "PASS",
    name: "LOGIN_ATTEMPT_HMAC_KEY",
    message: "已配置且长度达标",
  });
}

// ============================================
// 输出清单与退出码
// ============================================

console.log("==========================================");
console.log(" SSO 生产配置核查");
console.log("==========================================");

const STATUS_ICON: Record<CheckResult["status"], string> = {
  PASS: "✅ PASS",
  FAIL: "❌ FAIL",
  SKIP: "⚠️  SKIP",
};

for (const result of results) {
  console.log(`${STATUS_ICON[result.status]}  ${result.name}`);
  console.log(`         ${result.message}`);
  if (result.status === "FAIL" && result.fix) {
    console.log(`         修复建议：${result.fix}`);
  }
}

const failCount = results.filter((r) => r.status === "FAIL").length;
const skipCount = results.filter((r) => r.status === "SKIP").length;

console.log("------------------------------------------");
console.log(
  `共 ${results.length} 项检查：${results.length - failCount - skipCount} 项 PASS，${failCount} 项 FAIL，${skipCount} 项 SKIP`
);

if (failCount > 0) {
  console.error(`❌ 存在 ${failCount} 项未通过的生产配置检查，请按上方修复建议处理后重试`);
  process.exit(1);
}

console.log("✅ 生产配置核查全部通过");
