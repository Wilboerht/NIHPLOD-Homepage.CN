/**
 * 内部 API 安全认证工具
 *
 * 为子站调用官网内部接口提供增强型鉴权：
 * - 按项目分发的独立密钥
 * - 请求签名（HMAC-SHA256）
 * - 时间戳校验（±5 分钟）
 * - Nonce 防重放
 *
 * 设计目标：在不上 Redis 的前提下，提供比单一静态 Secret 更强的安全性。
 * 注意：Nonce 存储使用内存 LRU，仅适用于单实例部署；多实例部署时需要接入 Redis。
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { LRUCache } from "lru-cache";
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";

// 时间戳容差：5 分钟（秒）
const TIMESTAMP_TOLERANCE_SECONDS = 300;

// Nonce 缓存：5 分钟 TTL，最大 10000 条
const nonceCache = new LRUCache<string, boolean>({
  max: 10000,
  ttl: 5 * 60 * 1000,
});

export interface InternalApiKeyConfig {
  project: string;
  key: string;
  secret: string;
  /**
   * 轮换宽限：上一代 secret 列表（可选）。验签时同时接受当前与历史 secret，
   * 保证「先更新官网、后更新子站」的轮换窗口期内旧 secret 签名的请求不被拒绝。
   * 子站全部切换到新 secret 后应移除，缩小攻击面。出站签名始终使用当前 secret。
   */
  previousSecrets?: string[];
}

interface ParsedKeys {
  keys: Map<string, InternalApiKeyConfig>;
  secrets: Map<string, InternalApiKeyConfig>;
}

let cachedParsedKeys: ParsedKeys | null = null;
let lastEnvValue: string | undefined = undefined;

// secret 最小长度：脚本生成的为 32 字节 base64（44 字符），低于 32 字符的一律拒绝
const MIN_INTERNAL_API_SECRET_LENGTH = 32;

// .env.example 中的已知示例值（仓库公开、等同泄露），启动解析时拒绝加载
const KNOWN_EXAMPLE_KEYS = new Set(["advisor-example-key", "mall-example-key"]);
const KNOWN_EXAMPLE_SECRETS = new Set([
  "example-secret-replace-with-32-byte-random-value-from-script",
]);

/**
 * 解析 INTERNAL_API_KEYS 环境变量
 *
 * 格式：JSON 数组
 * [ {"project":"advisor","key":"advisor-key","secret":"advisor-secret"} ]
 *
 * 轮换宽限：条目可带可选的 previousSecrets（上一代 secret 数组），
 * 验签时接受当前 secret 与全部历史 secret；子站切换完成后移除历史值。
 */
export function getInternalApiKeys(): ParsedKeys {
  const envValue = process.env.INTERNAL_API_KEYS;

  if (envValue === lastEnvValue && cachedParsedKeys) {
    return cachedParsedKeys;
  }

  const keys = new Map<string, InternalApiKeyConfig>();
  const secrets = new Map<string, InternalApiKeyConfig>();

  if (envValue) {
    try {
      const parsed = JSON.parse(envValue) as InternalApiKeyConfig[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item.key || !item.secret || !item.project) {
            continue;
          }
          if (KNOWN_EXAMPLE_KEYS.has(item.key) || KNOWN_EXAMPLE_SECRETS.has(item.secret)) {
            apiConsole.error(
              `[InternalApi] 拒绝加载 .env.example 中的示例密钥（key: ${item.key}）：` +
                "示例值已公开，请使用 npm run generate:internal-api-keys 生成真实密钥"
            );
            continue;
          }
          if (item.secret.length < MIN_INTERNAL_API_SECRET_LENGTH) {
            apiConsole.error(
              `[InternalApi] 拒绝加载 secret 长度不足的密钥（key: ${item.key}，当前 ${item.secret.length} 字符，` +
                `要求 ≥ ${MIN_INTERNAL_API_SECRET_LENGTH}）`
            );
            continue;
          }
          // 轮换宽限的历史 secret 逐个校验：非法条目仅丢弃该历史 secret，不影响条目本身加载
          if (item.previousSecrets !== undefined) {
            if (!Array.isArray(item.previousSecrets)) {
              apiConsole.error(
                `[InternalApi] 忽略非法 previousSecrets（key: ${item.key}）：必须是字符串数组`
              );
              item.previousSecrets = undefined;
            } else {
              item.previousSecrets = item.previousSecrets.filter((prev) => {
                if (
                  typeof prev !== "string" ||
                  prev.length < MIN_INTERNAL_API_SECRET_LENGTH ||
                  KNOWN_EXAMPLE_SECRETS.has(prev)
                ) {
                  apiConsole.error(
                    `[InternalApi] 忽略非法历史 secret（key: ${item.key}）：` +
                      "历史 secret 同样要求 ≥ 32 字符且不得为示例值"
                  );
                  return false;
                }
                return true;
              });
            }
          }
          keys.set(item.key, item);
          secrets.set(item.secret, item);
        }
      }
    } catch (error) {
      apiConsole.error("[InternalApi] 解析 INTERNAL_API_KEYS 失败:", error);
    }
  }

  cachedParsedKeys = { keys, secrets };
  lastEnvValue = envValue;
  return cachedParsedKeys;
}

/**
 * 规范化查询串（签名用）：按 key/value 做**码点排序**（不依赖 ICU/locale），
 * 再对 key/value 分别 `encodeURIComponent` 后以 `k=v&...` 拼接。
 *
 * 编码的目的：消除 `?a=b%26c%3D` 与 `?a=b&c=` 这类"解析后不同、朴素拼接相同"的
 * 歧义（值中的 & / = 会破坏 canonical 串结构），保证签名严格绑定原始参数集合。
 */
export function canonicalizeQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pairs: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    pairs.push([key, value]);
  }
  // 码点比较：跨语言/跨实现可复现（禁止 localeCompare，避免 ICU 差异导致签名不一致）
  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** 旧版签名（不绑定 query）的过渡期开关；子站全部升级后可设为 false 强制新格式 */
function isLegacySignatureAllowed(): boolean {
  return process.env.INTERNAL_API_ALLOW_LEGACY_SIGNATURE !== "false";
}

let legacySignatureWarned = false;

/**
 * 生成请求签名
 *
 * @param secret - 项目密钥
 * @param method - HTTP 方法，如 POST
 * @param path - 请求路径（不含 query），如 /api/v1/internal/points/balance
 * @param timestamp - Unix 时间戳（秒）
 * @param nonce - 随机字符串
 * @param bodyHash - 请求体 SHA-256 哈希（hex）
 * @param query - 规范化查询串（canonicalizeQuery）。传入时使用新格式
 *   `METHOD|path|query|timestamp|nonce|bodyHash`（绑定 query，防篡改）；
 *   不传时保持旧格式 `METHOD|path|timestamp|nonce|bodyHash`（仅过渡期使用）
 */
export function generateInternalApiSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string,
  query?: string
): string {
  const payload =
    query === undefined
      ? `${method.toUpperCase()}|${path}|${timestamp}|${nonce}|${bodyHash}`
      : `${method.toUpperCase()}|${path}|${query}|${timestamp}|${nonce}|${bodyHash}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * 出站方向：官网调用子站内部接口（如 advisor 的 /api/internal/*）时生成 HMAC 签名请求头。
 *
 * 签名算法（新格式，推荐）：HMAC-SHA256(secret, "METHOD|path|query|timestamp|nonce|bodySha256")，
 * query 为 canonicalizeQuery 结果（无 query 时为空串）。
 * 默认仍使用旧格式（不绑定 query）以兼容未升级的子站；先让子站支持双验签，
 * 再将 `INTERNAL_API_SIGN_QUERY=true` 打开切换到新格式。
 *
 * @returns 签名请求头；INTERNAL_API_KEYS 中未配置该项目密钥时返回 null（调用方决定回退策略）
 */
export function createSignedInternalRequestHeaders(
  project: string,
  method: string,
  path: string,
  bodyText = "",
  options?: { query?: string }
): Record<string, string> | null {
  const { keys } = getInternalApiKeys();
  const config = [...keys.values()].find((item) => item.project === project);
  if (!config) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(bodyText).digest("hex");
  const useQueryBinding = process.env.INTERNAL_API_SIGN_QUERY === "true";
  const signature = generateInternalApiSignature(
    config.secret,
    method,
    path,
    timestamp,
    nonce,
    bodyHash,
    useQueryBinding ? options?.query ?? "" : undefined
  );

  return {
    "X-Internal-API-Key": config.key,
    "X-Internal-API-Timestamp": String(timestamp),
    "X-Internal-API-Nonce": nonce,
    "X-Internal-API-Signature": signature,
  };
}

/**
 * 验证内部 API 请求签名
 *
 * 支持双验签过渡：优先校验新格式（绑定 canonical query，含空 query 的路径）；
 * 当 `INTERNAL_API_ALLOW_LEGACY_SIGNATURE !== "false"`（默认）时，同时接受旧格式，
 * 以保证未升级的子站在过渡期内可用（接受旧格式时会输出一次告警）。
 *
 * 支持 secret 轮换宽限：命中条目的 previousSecrets 中任一历史 secret 的签名同样视为通过，
 * 便于「先更新官网、后更新子站」的滚动轮换；两种签名格式对全部候选 secret 都会尝试。
 *
 * @param options.query - canonicalizeQuery 结果；路由应始终传入（无 query 传 ""），
 *   否则新格式按空 query 校验、仍会回退旧格式。
 * @returns 验证通过时返回项目配置，否则返回 null
 */
export function verifyInternalApiSignature(
  key: string,
  signature: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string,
  options?: { query?: string }
): InternalApiKeyConfig | null {
  const { keys } = getInternalApiKeys();
  const config = keys.get(key);

  if (!config) {
    return null;
  }

  // 候选签名 = 签名格式（新/旧）× secret（当前 + 轮换宽限的历史 secret）
  const secretsToTry = [config.secret, ...(config.previousSecrets ?? [])];
  const candidates: { signature: string; legacy: boolean }[] = [];
  for (const secret of secretsToTry) {
    candidates.push({
      signature: generateInternalApiSignature(
        secret,
        method,
        path,
        timestamp,
        nonce,
        bodyHash,
        options?.query ?? ""
      ),
      legacy: false,
    });
  }
  if (isLegacySignatureAllowed()) {
    for (const secret of secretsToTry) {
      candidates.push({
        signature: generateInternalApiSignature(secret, method, path, timestamp, nonce, bodyHash),
        legacy: true,
      });
    }
  }

  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(signature, "hex");
  } catch {
    return null;
  }

  for (const candidate of candidates) {
    try {
      const expectedBuf = Buffer.from(candidate.signature, "hex");
      if (signatureBuf.length === expectedBuf.length && timingSafeEqual(signatureBuf, expectedBuf)) {
        if (candidate.legacy && !legacySignatureWarned) {
          legacySignatureWarned = true;
          apiConsole.warn(
            "[InternalApi] 检测到旧格式签名（未绑定 query）：为兼容未升级子站暂时放行。" +
              "全部子站升级后请设置 INTERNAL_API_ALLOW_LEGACY_SIGNATURE=false 强制新格式。"
          );
        }
        return config;
      }
    } catch {
      /* 尝试下一候选 */
    }
  }

  return null;
}

/**
 * 校验已验签密钥的 project 是否在端点白名单内（project 级端点隔离）
 * 各内部路由验签通过后调用；返回 false 时路由应返回 403
 */
export function isProjectAllowed(
  config: InternalApiKeyConfig,
  allowedProjects: readonly string[]
): boolean {
  return allowedProjects.includes(config.project);
}

/**
 * 校验时间戳是否在容差范围内
 */
export function isTimestampValid(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= TIMESTAMP_TOLERANCE_SECONDS;
}

const NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * 检查并记录 nonce，防止重放攻击
 * 优先使用 DB 存储（多实例安全），回退到内存缓存
 * @returns true 表示 nonce 可用，false 表示已使用
 */
export async function checkAndRecordNonce(nonce: string): Promise<boolean> {
  // 内存快速检查
  if (nonceCache.has(nonce)) {
    return false;
  }

  // DB 持久化（多实例共享）
  // 使用 create 而非 upsert：唯一约束冲突 → P2002 → 返回 false（防止并发/跨实例重放）
  try {
    await prisma.tokenBlacklist.create({
      data: {
        type: "internal_api_nonce",
        key: `nonce:${nonce}`,
        expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      },
    });
    nonceCache.set(nonce, true);
    return true;
  } catch (error) {
    // 唯一约束冲突 = nonce 已被使用（含跨实例并发场景）
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      nonceCache.set(nonce, true);
      return false;
    }
    // DB 不可用：fail-closed，拒绝请求以防止重放攻击窗口
    // 多实例部署时内存缓存不共享，放开可能导致跨实例重放
    return false;
  }
}

/**
 * 清理过期的内部 API nonce 防重放记录（可由 cron 任务定期调用）
 * nonce 有效窗口为时间戳容差 ±5 分钟，创建超过 10 分钟的记录已不可能通过校验，
 * 保留 10 分钟作为安全边界后物理删除，防止 TokenBlacklist 表无限增长
 */
export async function cleanupInternalApiNonces(): Promise<number> {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = await prisma.tokenBlacklist.deleteMany({
      where: {
        type: "internal_api_nonce",
        createdAt: { lt: tenMinutesAgo },
      },
    });
    apiConsole.info(`[CleanupInternalApiNonces] 清理了 ${result.count} 条过期 nonce 记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[CleanupInternalApiNonces] 清理失败:", error);
    throw error;
  }
}

/**
 * 计算请求体 SHA-256 哈希
 */
export function hashRequestBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
