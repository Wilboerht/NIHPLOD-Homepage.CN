/**
 * SSO 生产配置核查脚本
 *
 * 逐项核对 docs/sso-deployment.md 第 2 节的强制环境变量，输出 PASS / FAIL / SKIP 清单，
 * 任一项 FAIL 时以退出码 1 结束（可用于 CI / 发布前检查）。
 *
 * 运行方式：npm run check:sso-config
 * 加载 .env / .env.local / .env.production / .env.production.local（覆盖服务器只使用 .env 的部署方式）；
 * 生产环境也可直接以系统环境变量运行（dotenv 不覆盖已设置的变量，先加载的优先生效）。
 */
import dotenv from "dotenv";

// 加载环境变量：dotenv 不覆盖已设置的变量，先加载的优先；
// 按 Next.js 优先级从高到低依次加载（.env.production.local → .env.local → .env.production → .env），
// 使最终生效值与 Next.js 运行时一致
dotenv.config({ path: ".env.production.local" });
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

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
// 7. 其他启动/运行必需项
// ============================================

// NEXT_PUBLIC_APP_URL：ISSuer / OIDC Discovery 依赖的公网地址（src/lib/jwt.ts 启动校验）
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
  check({
    status: "FAIL",
    name: "NEXT_PUBLIC_APP_URL",
    message: "未配置，应用启动时会直接报错，且 OIDC Discovery/issuer 失效",
    fix: "设置为公网地址，如 https://nihplod.cn",
  });
} else {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:") {
      check({
        status: "FAIL",
        name: "NEXT_PUBLIC_APP_URL",
        message: `必须为 https 公网地址（当前 ${parsed.protocol}//${parsed.host}）`,
        fix: "改为 https:// 开头的公网地址，如 https://nihplod.cn",
      });
    } else if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      check({
        status: "FAIL",
        name: "NEXT_PUBLIC_APP_URL",
        message: "不能为 localhost（子项目 Discovery 会拿到不可达地址）",
        fix: "改为公网域名，如 https://nihplod.cn",
      });
    } else {
      check({ status: "PASS", name: "NEXT_PUBLIC_APP_URL", message: `已配置：${parsed.origin}` });
    }
  } catch {
    check({
      status: "FAIL",
      name: "NEXT_PUBLIC_APP_URL",
      message: "不是合法 URL",
      fix: "改为 https:// 开头的公网地址，如 https://nihplod.cn",
    });
  }
}

// SMS_CODE_HMAC_KEY：src/lib/server-init.ts 启动强校验
const smsCodeKey = process.env.SMS_CODE_HMAC_KEY;
if (!smsCodeKey) {
  check({
    status: "FAIL",
    name: "SMS_CODE_HMAC_KEY",
    message: "未配置，应用启动时会直接报错（验证码 HMAC 密钥）",
    fix: "生成强随机密钥：openssl rand -hex 32",
  });
} else if (smsCodeKey.length < MIN_SECRET_LENGTH) {
  check({
    status: "FAIL",
    name: "SMS_CODE_HMAC_KEY",
    message: `长度不足（当前 ${smsCodeKey.length} 字符，要求 ≥ ${MIN_SECRET_LENGTH}）`,
    fix: "替换为不少于 32 字符的强随机串：openssl rand -hex 32",
  });
} else {
  check({ status: "PASS", name: "SMS_CODE_HMAC_KEY", message: "已配置且长度达标" });
}

// TRUST_PROXY：生产环境缺失时 src/lib/client-ip.ts 会在请求时抛错（限流全部失效）
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy === "true") {
  const hops = process.env.TRUST_PROXY_HOPS;
  const hopsNum = hops ? parseInt(hops, 10) : 0;
  check({
    status: "PASS",
    name: "TRUST_PROXY",
    message:
      `已启用（TRUST_PROXY_HOPS=${hops ?? "0"}：取 XFF 从右往左第 ${hopsNum > 0 ? hopsNum : "1（最近端）"} 个条目）` +
      "。请按实际反向代理层数核对，配置错误会导致限流 key 取到代理 IP 或被伪造。",
  });
} else {
  check({
    status: "FAIL",
    name: "TRUST_PROXY",
    message: "未设置或非 true，生产环境请求时会抛错，IP 限流不可用",
    fix: "设置为 TRUST_PROXY=true，并按实际反向代理层数配置 TRUST_PROXY_HOPS",
  });
}

// ============================================
// 8. 其余启动/运行强依赖项
// ============================================

// RS256 公钥：jwt.ts / server-init.ts 生产强校验（只配私钥会启动失败）
for (const name of ["JWT_ACCESS_PUBLIC_KEY", "JWT_ID_TOKEN_PUBLIC_KEY"] as const) {
  if (process.env[name]) {
    check({ status: "PASS", name, message: "已配置（RS256 验签公钥）" });
  } else {
    check({
      status: "FAIL",
      name,
      message: "未配置，生产启动会直接报错（RS256 密钥对必须同时配置私钥与公钥）",
      fix: "运行 npx tsx scripts/generate-oauth-rs256-keys.ts 生成完整密钥对",
    });
  }
}

// TOTP_ENCRYPTION_KEY：admin TOTP setup/verify/资金操作运行期强依赖
if (!process.env.TOTP_ENCRYPTION_KEY) {
  check({
    status: "FAIL",
    name: "TOTP_ENCRYPTION_KEY",
    message: "未配置，TOTP 二次验证与资金类操作会运行期抛错",
    fix: "生成强随机密钥：openssl rand -hex 32",
  });
} else {
  check({ status: "PASS", name: "TOTP_ENCRYPTION_KEY", message: "已配置" });
}

// DATABASE_SSL_CA：生产直连非本地库时 prisma.ts 启动强校验
const dbUrl = process.env.DATABASE_URL || "";
const dbIsLocal =
  dbUrl.includes("//localhost") ||
  dbUrl.includes("//127.0.0.1") ||
  dbUrl.includes("@localhost") ||
  dbUrl.includes("@127.0.0.1");
if (dbIsLocal) {
  check({ status: "PASS", name: "DATABASE_SSL_CA", message: "本地数据库，无需 CA（跳过）" });
} else if (process.env.DATABASE_SSL_CA) {
  check({ status: "PASS", name: "DATABASE_SSL_CA", message: "已配置 CA 证书路径" });
} else {
  check({
    status: "FAIL",
    name: "DATABASE_SSL_CA",
    message: "生产环境非本地数据库缺少 CA 证书路径，Prisma 启动会直接报错",
    fix: "配置 DATABASE_SSL_CA 指向 CA 证书文件绝对路径",
  });
}

// 补录凭证存储：未配置私有 bucket 时生产上传 fail-closed（凭证含 PII）
const privateBucket = process.env.ALI_OSS_PRIVATE_BUCKET;
const allowPublicProof = process.env.ALLOW_PUBLIC_SPENT_PROOF_STORAGE === "true";
if (privateBucket) {
  check({ status: "PASS", name: "ALI_OSS_PRIVATE_BUCKET", message: "已配置私有凭证 bucket" });
} else if (allowPublicProof) {
  check({
    status: "FAIL",
    name: "ALI_OSS_PRIVATE_BUCKET",
    message:
      "未配置私有 bucket 且显式开启 ALLOW_PUBLIC_SPENT_PROOF_STORAGE=true：消费凭证（含个人信息）会写入公开存储",
    fix: "配置 ALI_OSS_PRIVATE_BUCKET 并移除 ALLOW_PUBLIC_SPENT_PROOF_STORAGE",
  });
} else {
  check({
    status: "FAIL",
    name: "ALI_OSS_PRIVATE_BUCKET",
    message: "未配置：生产环境消费补录凭证上传将返回 503（fail-closed）",
    fix: "配置私有读权限的 OSS bucket，或确认业务不需要凭证上传",
  });
}

// CRON 调度：外部调度模式必须配置 CRON_SECRET
if (process.env.ENABLE_LOCAL_CRON === "true") {
  check({
    status: "PASS",
    name: "CRON_SECRET",
    message: "本机 cron 模式（ENABLE_LOCAL_CRON=true）；多实例部署请改用外部调度并配置 CRON_SECRET",
  });
} else if (process.env.CRON_SECRET && process.env.CRON_SECRET.length >= MIN_SECRET_LENGTH) {
  check({ status: "PASS", name: "CRON_SECRET", message: "已配置（外部调度模式）" });
} else {
  check({
    status: "FAIL",
    name: "CRON_SECRET",
    message: "未启用本机 cron 且未配置 CRON_SECRET：定时清理/重投任务将无法执行",
    fix: "设置 ENABLE_LOCAL_CRON=true（仅单实例）或配置不少于 32 字符的 CRON_SECRET",
  });
}

// 状态变更 webhook 签名密钥：生产未配置时拒绝发送（fail-closed）
if (process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS && !process.env.SSO_WEBHOOK_SECRET) {
  check({
    status: "FAIL",
    name: "SSO_WEBHOOK_SECRET",
    message: "配置了 SSO_STATUS_CHANGE_WEBHOOK_URLS 但缺少签名密钥，生产将拒绝发送 webhook",
    fix: "配置强随机 SSO_WEBHOOK_SECRET（openssl rand -hex 32）",
  });
} else {
  check({ status: "PASS", name: "SSO_WEBHOOK_SECRET", message: "已配置或未启用状态 webhook" });
}

// 微信 exchange token 传输与 TTL
const transport = process.env.WECHAT_EXCHANGE_TOKEN_TRANSPORT;
if (transport && transport !== "query" && transport !== "fragment") {
  check({
    status: "FAIL",
    name: "WECHAT_EXCHANGE_TOKEN_TRANSPORT",
    message: `取值必须为 query 或 fragment（当前 ${transport}）`,
    fix: "改为 query（兼容存量）或 fragment（推荐，需子站改造）",
  });
} else {
  check({
    status: "PASS",
    name: "WECHAT_EXCHANGE_TOKEN_TRANSPORT",
    message: `当前为 ${transport ?? "query（默认）"}`,
  });
}

const exchangeTtl = process.env.WECHAT_EXCHANGE_SUCCESS_TTL;
if (exchangeTtl) {
  const match = /^(\d+)(s|m)$/.exec(exchangeTtl.trim());
  const seconds = match ? (match[2] === "m" ? Number(match[1]) * 60 : Number(match[1])) : NaN;
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 600) {
    check({
      status: "FAIL",
      name: "WECHAT_EXCHANGE_SUCCESS_TTL",
      message: `非法或超范围（${exchangeTtl}），运行时回退 2m；请使用 30s–600s（如 2m/120s）`,
      fix: "改为 30s–600s 范围内的值，或删除该变量使用默认 2m",
    });
  } else {
    check({ status: "PASS", name: "WECHAT_EXCHANGE_SUCCESS_TTL", message: `已配置 ${exchangeTtl}` });
  }
} else {
  check({ status: "PASS", name: "WECHAT_EXCHANGE_SUCCESS_TTL", message: "未配置（默认 2m）" });
}

// ============================================
// 9. 其他运行期关键配置（嵌入白名单/2FA/内部 API 密钥/渠道凭证/审计保留期）
// ============================================

// 嵌入白名单：middleware CSP（EMBED_ALLOWED_ORIGINS）与 embed 页面 postMessage 校验
// （NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS）必须一致，否则 iframe 嵌入静默失效
const embedServer = (process.env.EMBED_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .sort();
const embedPublic = (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .sort();
if (embedServer.length === 0 && embedPublic.length === 0) {
  check({ status: "PASS", name: "EMBED_ALLOWED_ORIGINS", message: "未启用嵌入（两变量均未配置）" });
} else if (JSON.stringify(embedServer) !== JSON.stringify(embedPublic)) {
  check({
    status: "FAIL",
    name: "EMBED_ALLOWED_ORIGINS",
    message:
      "与 NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS 不一致（CSP frame-ancestors 与 postMessage 校验口径不同，嵌入将失败）",
    fix: "两个变量配置完全相同的逗号分隔 origin 列表",
  });
} else {
  check({
    status: "PASS",
    name: "EMBED_ALLOWED_ORIGINS",
    message: `已配置 ${embedServer.length} 个来源且与前端变量一致`,
  });
}

// 资金类操作 2FA：显式 false 会静默关闭全部资金操作二次验证
if (process.env.ADMIN_TOTP_ENFORCE === "false") {
  check({
    status: "FAIL",
    name: "ADMIN_TOTP_ENFORCE",
    message: "生产环境已显式关闭资金类操作 TOTP 二次验证（高风险）",
    fix: "移除该变量或设为 true；仅在灰度/应急时短期关闭",
  });
} else {
  check({
    status: "PASS",
    name: "ADMIN_TOTP_ENFORCE",
    message: `当前为 ${process.env.ADMIN_TOTP_ENFORCE ?? "未配置（默认开启）"}`,
  });
}

// 内部 API 多密钥（JSON）：格式错误会被静默忽略导致子站调用全部 401
const internalKeysRaw = process.env.INTERNAL_API_KEYS;
if (internalKeysRaw) {
  try {
    const parsed = JSON.parse(internalKeysRaw) as unknown;
    const valid =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (item) =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { project?: unknown }).project === "string" &&
          typeof (item as { key?: unknown }).key === "string" &&
          typeof (item as { secret?: unknown }).secret === "string"
      );
    if (!valid) {
      check({
        status: "FAIL",
        name: "INTERNAL_API_KEYS",
        message: "JSON 结构非法：需为非空数组，且每项含 project/key/secret 三个字符串字段",
        fix: "修正 INTERNAL_API_KEYS（参考 .env.example），错误格式会在运行时被静默忽略",
      });
    } else {
      check({ status: "PASS", name: "INTERNAL_API_KEYS", message: `已配置 ${parsed.length} 个密钥` });
    }
  } catch {
    check({
      status: "FAIL",
      name: "INTERNAL_API_KEYS",
      message: "不是合法 JSON，运行时将被静默忽略，内部 API 调用会全部失败",
      fix: "修正为合法 JSON 数组（参考 .env.example）",
    });
  }
} else {
  check({ status: "PASS", name: "INTERNAL_API_KEYS", message: "未配置（使用旧版单一密钥或未启用）" });
}

// 微信分渠道凭证：配置了 AppID 就必须有对应 Secret（否则该渠道授权失败）；
// 兼容旧版 WECHAT_APP_ID/WECHAT_APP_SECRET 回退（运行时按 分渠道 → 旧版 顺序取值）
for (const [idName, secretName] of [
  ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"],
  ["WECHAT_MP_APP_ID", "WECHAT_MP_APP_SECRET"],
] as const) {
  const hasId = !!process.env[idName] || !!process.env.WECHAT_APP_ID;
  const hasSecret = !!process.env[secretName] || !!process.env.WECHAT_APP_SECRET;
  if (hasId !== hasSecret) {
    check({
      status: "FAIL",
      name: `${idName}/${secretName}`,
      message: "AppID 与 Secret 未成对配置（含旧版回退），该微信渠道授权会失败",
      fix: "补齐两个变量或同时移除",
    });
  } else {
    check({
      status: "PASS",
      name: `${idName}/${secretName}`,
      message: hasId ? "已配置" : "未启用该渠道",
    });
  }
}

// 抖音登录凭证：同样要求成对配置
const douyinKey = process.env.DOUYIN_CLIENT_KEY;
const douyinSecret = process.env.DOUYIN_CLIENT_SECRET;
if (!!douyinKey !== !!douyinSecret) {
  check({
    status: "FAIL",
    name: "DOUYIN_CLIENT_KEY/SECRET",
    message: "抖音 Client Key 与 Secret 未成对配置",
    fix: "补齐两个变量或同时移除",
  });
} else {
  check({
    status: "PASS",
    name: "DOUYIN_CLIENT_KEY/SECRET",
    message: douyinKey ? "已配置" : "未启用抖音登录",
  });
}

// id_token_hint 验签公钥：配置了私钥（§2）但缺公钥时，需要验签的端点会失败
if (
  process.env.JWT_LOGOUT_TOKEN_PRIVATE_KEY &&
  !process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY
) {
  check({
    status: "FAIL",
    name: "JWT_LOGOUT_TOKEN_PUBLIC_KEY",
    message: "已配置 RS256 私钥但缺少配套公钥，logout token 验签会失败",
    fix: "配置与该私钥配对的公钥（SPKI PEM），或确认相关验签端点未启用",
  });
} else {
  check({
    status: "PASS",
    name: "JWT_LOGOUT_TOKEN_PUBLIC_KEY",
    message: process.env.JWT_LOGOUT_TOKEN_PUBLIC_KEY ? "已配置" : "未配置（跟随私钥是否启用）",
  });
}

// TOTP 加密密钥长度（存在性已在前面检查；此处校验强度）
const totpKey = process.env.TOTP_ENCRYPTION_KEY;
if (totpKey && totpKey.length < MIN_SECRET_LENGTH) {
  check({
    status: "FAIL",
    name: "TOTP_ENCRYPTION_KEY",
    message: `长度不足（当前 ${totpKey.length} 字符，要求 ≥ ${MIN_SECRET_LENGTH}）`,
    fix: "替换为不少于 32 字符的强随机串：openssl rand -hex 32",
  });
} else {
  check({
    status: "PASS",
    name: "TOTP_ENCRYPTION_KEY",
    message: totpKey ? "已配置且长度达标" : "见前列存在性检查",
  });
}

// 状态变更 webhook 地址格式（逗号分隔，必须 https）
const webhookUrlsRaw = process.env.SSO_STATUS_CHANGE_WEBHOOK_URLS;
if (webhookUrlsRaw) {
  const urls = webhookUrlsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const invalid = urls.filter((u) => {
    try {
      return new URL(u).protocol !== "https:";
    } catch {
      return true;
    }
  });
  if (urls.length === 0 || invalid.length > 0) {
    check({
      status: "FAIL",
      name: "SSO_STATUS_CHANGE_WEBHOOK_URLS",
      message: `存在非法或非 https 地址：${invalid.join(", ") || "（空列表）"}`,
      fix: "配置为逗号分隔的 https:// 地址列表",
    });
  } else {
    check({ status: "PASS", name: "SSO_STATUS_CHANGE_WEBHOOK_URLS", message: `已配置 ${urls.length} 个 https 地址` });
  }
} else {
  check({ status: "PASS", name: "SSO_STATUS_CHANGE_WEBHOOK_URLS", message: "未启用" });
}

// 审计日志保留期（越界会回退默认 365 天，提前提示避免误配）
const auditRetention = process.env.AUDIT_LOG_RETENTION_DAYS;
if (auditRetention) {
  const days = Number(auditRetention);
  if (!Number.isFinite(days) || days < 30 || days > 3650) {
    check({
      status: "FAIL",
      name: "AUDIT_LOG_RETENTION_DAYS",
      message: `非法或超范围（${auditRetention}），运行时回退默认 365 天（允许 30–3650）`,
      fix: "改为 30–3650 范围内的整数，或移除使用默认值",
    });
  } else {
    check({ status: "PASS", name: "AUDIT_LOG_RETENTION_DAYS", message: `已配置 ${days} 天` });
  }
} else {
  check({ status: "PASS", name: "AUDIT_LOG_RETENTION_DAYS", message: "未配置（默认 365 天）" });
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
