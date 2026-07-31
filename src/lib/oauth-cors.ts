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

const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const MAX_AGE = "86400";
const ORIGINS_CACHE_TTL_MS = 60_000;

let cachedOrigins: { origins: Set<string>; timestamp: number } | null = null;

/**
 * 判断 origin 是否匹配已注册 redirect_uri 的 origin
 */
function isRegisteredOrigin(origin: string, redirectUris: string[]): boolean {
  try {
    const input = new URL(origin).origin;
    return redirectUris.some((uri) => {
      try {
        return new URL(uri).origin === input;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * 异步查询所有活跃 OAuthClient 的 redirectUris，构建 origin 白名单。
 * 60 秒 TTL 缓存，避免每次 preflight 都全表扫描。
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
export async function getOAuthCorsHeaders(
  request: NextRequest
): Promise<Record<string, string>> {
  const origin = request.headers.get("origin");
  const allowedOrigins = await getAllowedOrigins();

  // 没有 Origin 头（如同源请求或非浏览器请求）不需要 CORS 头
  if (!origin) {
    return {};
  }

  const allowedOrigin = allowedOrigins.has(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
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
