/**
 * 速率限制工具
 * 使用内存 LRU 缓存实现简单的 IP 限流
 */

/** 速率限制配置 */
export interface RateLimitOptions {
  /** 最大请求数 */
  maxRequests: number;
  /** 时间窗口（毫秒） */
  windowMs: number;
}

/** 速率限制结果 */
export interface RateLimitResult {
  /** 是否允许请求 */
  success: boolean;
  /** 剩余请求次数 */
  remaining: number;
  /** 重置时间戳 */
  reset: number;
  /** 限制总次数 */
  limit: number;
}

/** 请求记录 */
interface RequestRecord {
  timestamps: number[];
  windowStart: number;
}

/** 内存缓存 - 存储 IP 请求记录 */
const rateLimitCache = new Map<string, RequestRecord>();

/** 缓存清理间隔（5分钟） */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/** 定期清理过期记录 */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    rateLimitCache.forEach((record, key) => {
      // 删除超过 1 小时未活跃的记录
      if (now - record.windowStart > 60 * 60 * 1000) {
        rateLimitCache.delete(key);
      }
    });
  }, CLEANUP_INTERVAL);
}

/** 默认配置 */
const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 分钟
};

/** 预定义的限制配置 */
export const RATE_LIMIT_PRESETS = {
  /** 默认 API 限制 */
  default: { maxRequests: 100, windowMs: 60 * 1000 },
  /** AI 顾问限制 - 较宽松 */
  advisor: { maxRequests: 30, windowMs: 60 * 1000 },
  /** 面部分析限制 - 严格 */
  "face-analyze": { maxRequests: 5, windowMs: 60 * 60 * 1000 },
  /** 表单提交限制 */
  form: { maxRequests: 10, windowMs: 60 * 1000 },
  /** 登录限制 - 防暴力破解 */
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
} as const;

/**
 * 速率限制检查
 *
 * @param identifier - 唯一标识符（通常是 IP 地址）
 * @param type - 限制类型（使用预设配置）
 * @param options - 自定义配置（覆盖预设）
 * @returns 限制检查结果
 */
export async function rateLimit(
  identifier: string,
  type: keyof typeof RATE_LIMIT_PRESETS = "default",
  options?: Partial<RateLimitOptions>
): Promise<RateLimitResult> {
  // 启动清理定时器
  startCleanup();

  // 合并配置
  const preset = RATE_LIMIT_PRESETS[type] || DEFAULT_OPTIONS;
  const opts: RateLimitOptions = { ...preset, ...options };

  const now = Date.now();
  const cacheKey = `${type}:${identifier}`;

  // 获取或创建请求记录
  let record = rateLimitCache.get(cacheKey);

  if (!record) {
    record = {
      timestamps: [],
      windowStart: now,
    };
    rateLimitCache.set(cacheKey, record);
  }

  // 清理过期的请求记录
  const windowStart = now - opts.windowMs;
  record.timestamps = record.timestamps.filter((t) => t > windowStart);
  record.windowStart = now;

  // 检查是否超过限制
  const currentCount = record.timestamps.length;
  const remaining = Math.max(0, opts.maxRequests - currentCount);
  const reset = now + opts.windowMs;

  if (currentCount >= opts.maxRequests) {
    return {
      success: false,
      remaining: 0,
      reset,
      limit: opts.maxRequests,
    };
  }

  // 记录本次请求
  record.timestamps.push(now);

  return {
    success: true,
    remaining: remaining - 1,
    reset,
    limit: opts.maxRequests,
  };
}

/**
 * 获取客户端 IP 地址
 * 支持代理环境
 */
export function getClientIP(request: Request): string {
  // 尝试从各种头部获取真实 IP
  const headers = request.headers;

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // 回退到默认值
  return "unknown";
}
