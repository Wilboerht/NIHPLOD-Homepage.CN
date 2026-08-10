/**
 * OAuth 端点跨域 CORS 处理
 *
 * 仅允许已注册 OAuthClient.redirectUris 的 origin 访问 token/introspect/revoke/userinfo 端点。
 * 注意：
 * - 不返回 `Access-Control-Allow-Credentials: true`，前端不应携带主站 Cookie。
 * - 预检请求返回 204。
 */
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, DPoP";
const MAX_AGE = "3600"; // 1 小时，与 origin 缓存 10s TTL 保持合理差异
const ORIGINS_CACHE_TTL_MS = 10_000; // 10 秒，降低新增/禁用 client 后的延迟

let cachedOrigins: { origins: Set<string>; timestamp: number } | null = null;

/**
 * 异步查询所有活跃 OAuthClient 的 redirectUris，构建 origin 白名单。
 * 10 秒 TTL 缓存，避免每次 preflight 都全表扫描。新增客户端最多 10 秒后生效。
 */
async function getAllowedOrigins(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedOrigins && now - cachedOrigins.timestamp < ORIGINS_CACHE_TTL_MS) {
    return cachedOrigins.origins;
  }

  const clients = await prisma.oAuthClient.findMany({
    where: { isActive: true },
    select: { redirectUris: true },
  });
  const origins = new Set<string>();
  for (const client of clients) {
    for (const uri of client.redirectUris) {
      try {
        origins.add(new URL(uri).origin);
      } catch {
        // 忽略非法 redirect_uri
      }
    }
  }
  cachedOrigins = { origins, timestamp: now };
  return origins;
}

/**
 * 获取当前请求允许使用的 CORS headers。
 *
 * @param request - NextRequest
 * @returns [headers, isCorsRequest]
 */
export async function getOAuthCorsHeaders(request: NextRequest): Promise<Record<string, string>> {
  const origin = request.headers.get("origin");
  const allowedOrigins = await getAllowedOrigins();

  // 没有 Origin 头（如同源请求或非浏览器请求）不需要 CORS 头
  if (!origin) {
    return {};
  }

  // Origin 不在白名单：不返回 CORS 头（浏览器拒绝 fetch），比返回 "null" 更安全
  if (!allowedOrigins.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": MAX_AGE,
    // Vary 告诉浏览器缓存按 Origin 区分
    Vary: "Origin",
  };
}

/**
 * 用于 preflight 的 OPTIONS 响应 headers
 */
export async function getOAuthCorsOptionsHeaders(
  request: NextRequest
): Promise<Record<string, string>> {
  return getOAuthCorsHeaders(request);
}
