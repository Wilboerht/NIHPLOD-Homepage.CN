import { apiConsole } from "@/lib/logger";
/**
 * Next.js 应用启动初始化
 * 在服务器启动时执行一次性初始化任务
 *
 * 使用方法: 在 src/app/layout.tsx 或其他在服务器端运行的文件中导入
 * import { initializeApp } from "@/lib/server-init";
 * initializeApp(); // 调用即可
 */

let _initialized = false;
let _handlersRegistered = false;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * 生产环境强制使用 RS256 签名 OAuth Access Token / ID Token。
 * 当 ALLOW_HS256_FALLBACK 不为 true 时，必须配置对应的私钥/公钥，
 * 否则启动失败，避免默认回退到 HS256 导致 Public Client 无法本地验证。
 */
function validateRS256Keys(): void {
  if (process.env.ALLOW_HS256_FALLBACK === "true") {
    return;
  }

  const missing: string[] = [];
  if (!process.env.JWT_ACCESS_PRIVATE_KEY || !process.env.JWT_ACCESS_PUBLIC_KEY) {
    missing.push("JWT_ACCESS_PRIVATE_KEY / JWT_ACCESS_PUBLIC_KEY");
  }
  if (!process.env.JWT_ID_TOKEN_PRIVATE_KEY || !process.env.JWT_ID_TOKEN_PUBLIC_KEY) {
    missing.push("JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `[Server] 生产环境默认使用 RS256，但未配置以下 RS256 密钥：${missing.join(", ")}。请运行 \`npm run generate:oauth-rs256-keys\` 生成并写入环境变量，或在过渡期设置 ALLOW_HS256_FALLBACK=true。`
    );
  }
}

/**
 * 密钥类环境变量校验（存在性 + 最小长度）。
 * 语义与 src/lib/jwt.ts 的 validateSecret 完全一致；此处不复用其导出，
 * 因为 import jwt.ts 会触发该模块顶层副作用（JWT 密钥加载、生产环境
 * NEXT_PUBLIC_APP_URL 校验等），而启动校验需要在最早期独立运行。
 */
const MIN_SECRET_LENGTH = 32;

function validateSecret(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`[Server] ${name} 环境变量未设置，请配置后再启动应用`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[Server] ${name} 长度必须不少于 ${MIN_SECRET_LENGTH} 个字符，当前 ${value.length} 个字符`
    );
  }
}

/**
 * 短信服务启动校验：
 * 1. SMS_CODE_HMAC_KEY 所有环境强制校验（存在性 + 最小长度），与 jwt.ts 的
 *    validateSecret 模式一致——该密钥缺失时 hashVerifyCode 在调用时也会抛错，
 *    此处提前到启动阶段失败，避免运行期才暴露配置问题。
 * 2. 生产环境 SMS_PROVIDER 应为 aliyun 或 tencent：未设置 / mock / 未知值会静默
 *    回退 mock 通道（短信实际未发出）。当前业务决策为短期不接真实短信通道，
 *    故降级为启动告警而非强制失败；接入真实短信后应恢复为 throw。
 */
function validateSmsConfig(): void {
  validateSecret("SMS_CODE_HMAC_KEY", process.env.SMS_CODE_HMAC_KEY);

  if (!isProduction()) {
    return;
  }
  const provider = process.env.SMS_PROVIDER;
  if (provider !== "aliyun" && provider !== "tencent") {
    apiConsole.warn(
      `[Server] ⚠️ 生产环境 SMS_PROVIDER 当前为 ${provider ?? "(未设置)"}，验证码短信不会真实发出（mock 通道）。接入真实短信服务后请配置为 aliyun 或 tencent。`
    );
  }
}

/**
 * 生产环境运行时配置校验。
 *
 * 这些配置缺失时，代码会在请求期 fail-closed（getClientIP/rateLimit 直接抛错），
 * 表现为所有限流接口 500。这里提前到启动阶段失败，给出可操作的修复提示。
 */
function validateProductionRuntimeConfig(): void {
  if (!isProduction()) return;

  if (process.env.TRUST_PROXY !== "true") {
    throw new Error(
      "[Server] 生产环境必须设置 TRUST_PROXY=true（Nginx/ALB 后）并配置 TRUST_PROXY_HOPS，否则获取客户端 IP 会直接抛错，所有限流接口将 500。"
    );
  }

  const hopsRaw = process.env.TRUST_PROXY_HOPS;
  if (hopsRaw === undefined || hopsRaw === "" || !/^\d+$/.test(hopsRaw)) {
    apiConsole.warn(
      "[Server] ⚠️ TRUST_PROXY_HOPS 未设置或非法，当前按 0（取 X-Forwarded-For 最后一段）处理。请按实际反代层数配置（例如 Nginx 一层填 1）。"
    );
  }

  const rateLimitStorage = process.env.RATE_LIMIT_STORAGE;
  if (rateLimitStorage !== "database" && rateLimitStorage !== "memory") {
    throw new Error(
      "[Server] 生产环境必须设置 RATE_LIMIT_STORAGE=database（多实例）或 memory（显式单实例），否则 rateLimit 会直接抛错，投递/管理端接口将 500。"
    );
  }
  if (rateLimitStorage === "memory") {
    apiConsole.warn(
      "[Server] ⚠️ RATE_LIMIT_STORAGE=memory 仅适用于单实例部署；多实例部署请改为 database，否则限流可被绕过。"
    );
  }

  if (!process.env.ALI_OSS_PRIVATE_BUCKET && process.env.ALLOW_LOCAL_RESUME_STORAGE !== "true") {
    apiConsole.error(
      "[Server] ❌ 未配置 ALI_OSS_PRIVATE_BUCKET，且 ALLOW_LOCAL_RESUME_STORAGE 未开启：简历上传将返回 503（含 PII 的文件不允许落公开存储）。"
    );
  } else if (process.env.ALI_OSS_PRIVATE_BUCKET) {
    const missingOssConfig = ["ALI_OSS_REGION", "ALI_OSS_ACCESS_KEY_ID", "ALI_OSS_ACCESS_KEY_SECRET"].filter(
      (name) => !process.env[name]
    );
    if (missingOssConfig.length > 0) {
      apiConsole.error(
        `[Server] ❌ 已配置 ALI_OSS_PRIVATE_BUCKET，但缺少 ${missingOssConfig.join(", ")}：私有 OSS 客户端无法初始化，简历上传将 503。`
      );
    }
  } else if (process.env.ALLOW_LOCAL_RESUME_STORAGE === "true") {
    apiConsole.warn(
      "[Server] ⚠️ ALLOW_LOCAL_RESUME_STORAGE=true：简历将写入服务器本地 private/ 目录。请确认使用持久卷、已纳入备份，且非多实例部署。"
    );
  }
}

export async function initializeApp(): Promise<void> {
  // 构建阶段跳过初始化（防止 worker 进程重复执行）
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  // 防止重复初始化
  if (_initialized) {
    return;
  }

  apiConsole.info("\n========================================");
  apiConsole.info("🚀 应用启动初始化...");
  apiConsole.info("========================================\n");

  try {
    // 短信配置校验（所有环境校验 HMAC 密钥；生产环境额外校验 SMS_PROVIDER）
    validateSmsConfig();
    apiConsole.info("✅ 短信服务配置已就绪");

    // 生产环境 RS256 密钥校验
    if (isProduction()) {
      validateRS256Keys();
      apiConsole.info("✅ RS256 密钥配置已就绪");
      validateProductionRuntimeConfig();
      apiConsole.info("✅ 生产运行时配置已校验");
    }

    // 初始化定时任务
    const { initializeCronTasks } = await import("./cron-tasks");
    initializeCronTasks();
  } catch (error) {
    apiConsole.error("初始化失败:", error);
    throw error;
  }

  _initialized = true;

  apiConsole.info("\n✅ 应用初始化完成");
  apiConsole.info("========================================\n");

  // 优雅关闭：仅负责 cron 任务清理，不调用 process.exit
  // prisma.ts 已注册完整的 DB 连接池关闭 + process.exit 逻辑
  if (typeof process !== "undefined" && !_handlersRegistered) {
    _handlersRegistered = true;

    process.on("SIGTERM", async () => {
      apiConsole.info("\n[Server] 收到 SIGTERM，停止定时任务...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        apiConsole.error("[Server] 停止定时任务失败:", error);
      }
    });

    process.on("SIGINT", async () => {
      apiConsole.info("\n[Server] 收到 SIGINT，停止定时任务...");
      try {
        const { stopCronTasks } = await import("./cron-tasks");
        stopCronTasks();
      } catch (error) {
        apiConsole.error("[Server] 停止定时任务失败:", error);
      }
    });
  }
}
