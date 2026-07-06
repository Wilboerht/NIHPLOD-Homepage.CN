/**
 * 客户端 IP 获取工具
 *
 * 统一项目中所有 IP 获取逻辑，避免不同模块因取法不一致导致安全策略被绕过。
 *
 * 在反向代理架构中（Vercel/Nginx/ALB），X-Forwarded-For 格式为：
 *   client, proxy1, proxy2, ..., lastProxy
 *
 * 通过 TRUST_PROXY_HOPS 环境变量控制取第 N 个 IP（从客户端开始计数）。
 * 例如：经过 2 层反向代理（Nginx + Vercel），则设置 TRUST_PROXY_HOPS=2，取第 2 个 IP。
 *
 * 默认行为：
 * - 信任代理头（TRUST_PROXY=true / development / Vercel）时，按 TRUST_PROXY_HOPS 取 IP
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

  const trustProxy =
    options.trustProxy ??
    (process.env.TRUST_PROXY === "true" ||
      process.env.NODE_ENV === "development" ||
      process.env.VERCEL === "1");

  if (!trustProxy) {
    return "unknown";
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    const hops = options.hops ?? parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
    const idx = Math.min(Math.max(0, hops - 1), ips.length - 1);
    return ips[idx] || "unknown";
  }

  const realIP = headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}
