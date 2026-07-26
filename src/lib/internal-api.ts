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

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { LRUCache } from "lru-cache";
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
}

interface ParsedKeys {
  keys: Map<string, InternalApiKeyConfig>;
  secrets: Map<string, InternalApiKeyConfig>;
}

let cachedParsedKeys: ParsedKeys | null = null;
let lastEnvValue: string | undefined = undefined;

/**
 * 解析 INTERNAL_API_KEYS 环境变量
 *
 * 格式：JSON 数组
 * [ {"project":"advisor","key":"advisor-key","secret":"advisor-secret"} ]
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
          if (item.key && item.secret && item.project) {
            keys.set(item.key, item);
            secrets.set(item.secret, item);
          }
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
 * 生成请求签名
 *
 * @param secret - 项目密钥
 * @param method - HTTP 方法，如 POST
 * @param path - 请求路径，如 /api/v1/internal/wechat/send-template
 * @param timestamp - Unix 时间戳（秒）
 * @param nonce - 随机字符串
 * @param bodyHash - 请求体 SHA-256 哈希（hex）
 */
export function generateInternalApiSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string
): string {
  const payload = `${method.toUpperCase()}|${path}|${timestamp}|${nonce}|${bodyHash}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * 验证内部 API 请求签名
 *
 * @returns 验证通过时返回项目配置，否则返回 null
 */
export function verifyInternalApiSignature(
  key: string,
  signature: string,
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyHash: string
): InternalApiKeyConfig | null {
  const { keys } = getInternalApiKeys();
  const config = keys.get(key);

  if (!config) {
    return null;
  }

  const expected = generateInternalApiSignature(
    config.secret,
    method,
    path,
    timestamp,
    nonce,
    bodyHash
  );

  try {
    const signatureBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expected, "hex");

    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      return null;
    }
  } catch {
    return null;
  }

  return config;
}

/**
 * 校验时间戳是否在容差范围内
 */
export function isTimestampValid(timestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= TIMESTAMP_TOLERANCE_SECONDS;
}

/**
 * 检查并记录 nonce，防止重放攻击
 * @returns true 表示 nonce 可用，false 表示已使用
 */
export function checkAndRecordNonce(nonce: string): boolean {
  if (nonceCache.has(nonce)) {
    return false;
  }
  nonceCache.set(nonce, true);
  return true;
}

/**
 * 计算请求体 SHA-256 哈希
 */
export function hashRequestBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
