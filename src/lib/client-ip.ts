/**
 * 客户端 IP 获取工具
 *
 * 统一项目中所有 IP 获取逻辑，避免不同模块因取法不一致导致安全策略被绕过。
 *
 * 在反向代理架构中（Nginx/ALB），X-Forwarded-For 格式为：
 *   client, proxy1, proxy2, ..., lastProxy
 *
 * 通过 TRUST_PROXY_HOPS 环境变量控制取第 N 个 IP（从客户端开始计数）。
 * 例如：经过 2 层反向代理，则设置 TRUST_PROXY_HOPS=2，取第 2 个 IP。
 *
 * 默认行为：
 * - 信任代理头（TRUST_PROXY=true / development）时，按 TRUST_PROXY_HOPS 取 IP
 * - 否则返回 "unknown"
 */

export interface ClientIPOptions {
  /** 是否信任代理头，默认根据环境变量判断 */
  trustProxy?: boolean;
  /** 反向代理层数，默认读取 TRUST_PROXY_HOPS 环境变量 */
  hops?: number;
}

/**
 * 获取客户端真实 IP 地址
 */
export function getClientIP(
  request: Request | { headers: Headers },
  options: ClientIPOptions = {}
): string {
  const headers = request.headers;

  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === "true";

  if (!trustProxy) {
    // 生产环境必须配置 TRUST_PROXY=true，否则所有 IP 收敛为 "unknown"
    // 导致全局限流桶共享，DoS 防护全部失效
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      throw new Error("[ClientIP] 生产环境必须设置 TRUST_PROXY=true 和 TRUST_PROXY_HOPS。");
    }
    const directIP = (request as Request & { socket?: { remoteAddress?: string } }).socket
      ?.remoteAddress;
    return directIP || "unknown";
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip && /^[\d.:a-fA-F]+$/.test(ip));

    if (ips.length === 0) return "unknown";

    // 默认取最后一段（最靠近应用），而非第一段（最容易被伪造）
    // TRUST_PROXY_HOPS 可从后往前数（负值）或从前往后（正值）
    const hopsRaw = options.hops ?? parseInt(process.env.TRUST_PROXY_HOPS || "0", 10);
    const idx =
      hopsRaw <= 0
        ? ips.length - 1 + hopsRaw // 负值/0：从尾部倒数
        : Math.min(hopsRaw - 1, ips.length - 1); // 正值：从头部往后
    return ips[Math.max(0, Math.min(idx, ips.length - 1))] || "unknown";
  }

  const realIP = headers.get("x-real-ip");
  if (realIP && /^[\d.:a-fA-F]+$/.test(realIP)) {
    return realIP.trim();
  }

  return "unknown";
}
