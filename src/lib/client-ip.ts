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

import crypto from "crypto";
import { isIP } from "node:net";

export interface ClientIPOptions {
  /** 是否信任代理头，默认根据环境变量判断 */
  trustProxy?: boolean;
  /** 反向代理层数，默认读取 TRUST_PROXY_HOPS 环境变量 */
  hops?: number;
}

/**
 * 限流 key 使用的 IP 归一化：
 * - IPv4 原样
 * - IPv4-mapped IPv6（::ffff:1.2.3.4）还原为 IPv4
 * - IPv6 归一到 /64（同一用户通常可轮换 2^64 个地址，按 /128 限流可被轻易绕过）
 */
export function normalizeRateLimitIdentifier(identifier: string): string {
  // 复合 key：sms-ip:<ip> / wechat-ip-<ip> 也必须按 IPv6 /64 归一，否则可轮换地址绕过日上限
  if (identifier.startsWith("sms-ip:")) {
    return `sms-ip:${normalizeRateLimitIdentifier(identifier.slice("sms-ip:".length))}`;
  }
  if (identifier.startsWith("wechat-ip-")) {
    return `wechat-ip-${normalizeRateLimitIdentifier(identifier.slice("wechat-ip-".length))}`;
  }

  const value = identifier.trim();
  const version = isIP(value);

  if (version === 4) return value;

  if (version === 6) {
    // IPv6 十六进制大小写不敏感；统一小写，避免大小写轮换绕过同一 /64 限流桶。
    const normalized = value.toLowerCase();
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(normalized);
    if (mapped && isIP(mapped[1]) === 4) return mapped[1];

    const halves = normalized.split("::");
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - (head.length + tail.length);
    const groups = [
      ...head,
      ...Array.from({ length: Math.max(0, missing) }, () => "0"),
      ...tail,
    ].map((group) => group.replace(/^0+/, "") || "0");
    return `${groups.slice(0, 4).join(":")}::/64`;
  }

  return identifier;
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
    const rawHops = options.hops ?? process.env.TRUST_PROXY_HOPS;
    const hopsRaw = rawHops === undefined || rawHops === "" ? 0 : Number(rawHops);
    // 非法/越界的 hops 绝不能钳制到最左条目（客户端可伪造）：fail-closed 返回 unknown，
    // 限流按全局桶处理，等待配置修复
    if (!Number.isInteger(hopsRaw) || hopsRaw < 0 || hopsRaw > ips.length) {
      return "unknown";
    }
    const idx = hopsRaw > 0 ? ips.length - hopsRaw : ips.length - 1;
    return ips[Math.max(0, Math.min(idx, ips.length - 1))] || "unknown";
  }

  const realIP = headers.get("x-real-ip");
  if (realIP && /^[\d.:a-fA-F]+$/.test(realIP)) {
    return realIP.trim();
  }

  return "unknown";
}

/**
 * 子站 BFF 代理的真实客户端 IP：仅当请求携带的 X-Subsite-Proxy-Key 与环境变量
 * SUBSITE_PROXY_KEY 一致（常量时间比较）时，才信任并返回其 X-Forwarded-For 中的
 * 客户端 IP；否则返回 null，调用方回退到 getClientIP。
 *
 * 背景：子站（如 smart.nihplod.cn）以服务器到服务器方式代理 send-code 等请求，
 * 主站看到的对端 IP 恒为子站服务器——若不信任其透传的客户端 IP，按 IP 的限流会
 * 退化为「所有子站用户共享一个桶」，且 SmsCode.ipAddress 记成子站 IP 导致
 * IP 绑定校验（SMS_VERIFY_IP_BIND）对代理用户误报 IP_MISMATCH。
 *
 * 安全性：未配置 SUBSITE_PROXY_KEY 时永远返回 null（公网伪造的 XFF 不被信任）；
 * 子站经内网直连主站，其写入的 XFF 只有客户端 IP 一个条目，取最后一项即可。
 */
export function getSubsiteProxiedClientIP(request: { headers: Headers }): string | null {
  const configuredKey = process.env.SUBSITE_PROXY_KEY;
  if (!configuredKey) return null;
  const presented = request.headers.get("x-subsite-proxy-key");
  if (!presented) return null;
  const a = Buffer.from(configuredKey);
  const b = Buffer.from(presented);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const ips = forwardedFor
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip && /^[\d.:a-fA-F]+$/.test(ip));
  return ips[ips.length - 1] ?? null;
}
