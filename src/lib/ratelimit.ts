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
  /** 面部分析限制 - 严格 */
  "face-analyze": { maxRequests: 5, windowMs: 60 * 60 * 1000 },
  /** 综合分析限制 - 严格，与面部分析一致 */
  "comprehensive-analyze": { maxRequests: 5, windowMs: 60 * 60 * 1000 },
  /** 表单提交限制 */
  form: { maxRequests: 10, windowMs: 60 * 1000 },
  /** 登录限制 - 防暴力破解 */
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  /** AI Chat 限制 - 每分钟 10 次 */
  chat: { maxRequests: 10, windowMs: 60 * 1000 },
  /** 用户级 Chat 限制 - 每分钟 15 次 */
  "chat-user": { maxRequests: 15, windowMs: 60 * 1000 },
  /** OSS 签名获取限制 - 每分钟 20 次 */
  "oss-sign": { maxRequests: 20, windowMs: 60 * 1000 },
  /** 支付创建限制 - 每分钟 10 次（防止恶意支付订单创建） */
  "payment-create": { maxRequests: 10, windowMs: 60 * 1000 },
  /** 退款申请限制 - 每分钟 5 次（防止滥用） */
  "refund-request": { maxRequests: 5, windowMs: 60 * 1000 },
  /** 用户级支付限制 - 每分钟 20 次 */
  "payment-user": { maxRequests: 20, windowMs: 60 * 1000 },
  /** 订单创建 - IP 级 - 每分钟 20 次 */
  "order-create": { maxRequests: 20, windowMs: 60 * 1000 },
  /** 订单创建 - 用户级 - 每分钟 5 次 */
  "order-create-user": { maxRequests: 5, windowMs: 60 * 1000 },
  /** 微信支付回调 - IP 级 - 每分钟 120 次 */
  "pay-notify": { maxRequests: 120, windowMs: 60 * 1000 },
  /** 支付宝支付回调 - IP 级 - 每分钟 120 次 */
  "alipay-notify": { maxRequests: 120, windowMs: 60 * 1000 },
  /** 微信退款回调 - IP 级 - 每分钟 120 次 */
  "refund-notify": { maxRequests: 120, windowMs: 60 * 1000 },
  /** 支付宝退款回调 - IP 级 - 每分钟 120 次 */
  "alipay-refund-notify": { maxRequests: 120, windowMs: 60 * 1000 },
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
 * 
 * 在反向代理架构中（Vercel/Nginx），X-Forwarded-For 格式为：
 *   client, proxy1, proxy2, ..., lastProxy
 * 前面的 IP 可能被客户端伪造，最后一个是由最靠近服务器的可信代理追加的，
 * 因此取最后一个 IP作为真实来源。
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[ips.length - 1] || ips[0] || "unknown";
  }

  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}

/** 双重限流结果 */
export interface DualRateLimitResult extends RateLimitResult {
  /** 被限制的类型：ip | user | null（未被限制） */
  limitedBy: "ip" | "user" | null;
}

/**
 * 双重速率限制检查（IP + 用户级）
 *
 * 优先检查 IP 限流，再检查用户级限流
 * 任一触发即拒绝请求
 *
 * @param ip - IP 地址
 * @param userId - 用户 ID（可选，未登录用户只检查 IP）
 * @param ipType - IP 限流类型
 * @param userType - 用户限流类型
 * @returns 限制检查结果
 */
export async function dualRateLimit(
  ip: string,
  userId: string | null | undefined,
  ipType: keyof typeof RATE_LIMIT_PRESETS = "chat",
  userType: keyof typeof RATE_LIMIT_PRESETS = "chat-user"
): Promise<DualRateLimitResult> {
  // 1. 检查 IP 限流
  const ipResult = await rateLimit(ip, ipType);
  if (!ipResult.success) {
    return {
      ...ipResult,
      limitedBy: "ip",
    };
  }

  // 2. 如果有用户 ID，检查用户级限流
  if (userId) {
    const userResult = await rateLimit(`user:${userId}`, userType);
    if (!userResult.success) {
      return {
        ...userResult,
        limitedBy: "user",
      };
    }

    // 返回较严格的限制信息
    return {
      success: true,
      remaining: Math.min(ipResult.remaining, userResult.remaining),
      reset: Math.max(ipResult.reset, userResult.reset),
      limit: Math.min(ipResult.limit, userResult.limit),
      limitedBy: null,
    };
  }

  return {
    ...ipResult,
    limitedBy: null,
  };
}
