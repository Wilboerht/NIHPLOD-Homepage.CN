/**
 * 客户端 IP 获取工具
 *
 * 统一项目中所有 IP 获取逻辑，避免不同模块因取法不一致导致安全策略被绕过。
 *
 * 在反向代理架构中（Nginx/ALB），X-Forwarded-For 格式为：
 *   client, proxy1, proxy2, ..., lastProxy
 *
 * 通过 TRUST_PROXY_HOPS 环境变量控制取第几个 IP：
 * - 0（默认）或负值：从最近端倒数（0 = 最后一段，通常是最靠近应用的代理写入项）
 * - 正值 N：应用前面有 N 层可信代理，取从右往左第 N 个条目（idx = len - N）。
 *   该位置由可信代理写入，客户端伪造的前置 XFF 条目无法影响。
 *   例如：经过 2 层反向代理（XFF = "client, proxy1"），设置 TRUST_PROXY_HOPS=2 取 client。
 *
 * 默认行为：
 * - 信任代理头（TRUST_PROXY=true）时，按 TRUST_PROXY_HOPS 取 IP
 * - 否则生产环境直接抛错（防止全局限流桶共享），非生产返回 socket 地址或 "unknown"
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

    // 默认取最后一段（最靠近应用），而非第一段（最容易被伪造）。
    // hops > 0 表示"应用前面有 N 层可信代理"：取从右往左第 N 个条目
    // （idx = len - N），该位置由可信代理写入，不受客户端前置伪造的 XFF 条目影响。
    // 旧实现取从头部第 N 个（idx = N-1），可被客户端伪造的 XFF 前缀控制，已废弃。
    const hopsRaw = options.hops ?? parseInt(process.env.TRUST_PROXY_HOPS || "0", 10);
    const hops = Number.isFinite(hopsRaw) ? hopsRaw : 0;
    const idx = hops > 0 ? ips.length - hops : ips.length - 1 + hops;
    return ips[Math.max(0, Math.min(idx, ips.length - 1))] || "unknown";
  }

  const realIP = headers.get("x-real-ip");
  if (realIP && /^[\d.:a-fA-F]+$/.test(realIP)) {
    return realIP.trim();
  }

  return "unknown";
}
