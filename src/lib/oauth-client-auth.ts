/**
 * OAuth 2.0 Client 认证凭证提取
 *
 * 支持 RFC 6749 两种客户端认证方式：
 * 1. client_secret_basic：Authorization: Basic base64(client_id:client_secret)
 * 2. client_secret_post：请求体中传 client_id + client_secret
 *
 * 优先级：Authorization header > body。
 * 返回的 client_secret 可能为空（Public Client）。
 */
import { timingSafeEqual } from "crypto";

export interface ClientCredentials {
  client_id: string;
  client_secret: string | undefined;
}

/**
 * 从 Authorization header 解析 Basic 认证
 */
function parseBasicAuth(header: string | null): { client_id: string; client_secret: string } | null {
  if (!header || !header.startsWith("Basic ")) return null;

  const base64 = header.slice(6).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }

  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return null;

  const client_id = decoded.slice(0, colonIndex);
  const client_secret = decoded.slice(colonIndex + 1);
  if (!client_id) return null;

  return { client_id, client_secret };
}

/**
 * 提取 client_id / client_secret
 *
 * @param request - NextRequest 或 Request
 * @param body - 已解析的请求体（JSON 或 form-urlencoded），body 中可能不含 client_id/secret
 */
export function getClientCredentials(
  request: { headers: { get: (name: string) => string | null } },
  body: Record<string, string>
): ClientCredentials {
  const basic = parseBasicAuth(request.headers.get("authorization"));
  if (basic) {
    return {
      client_id: basic.client_id,
      client_secret: basic.client_secret || undefined,
    };
  }

  return {
    client_id: body.client_id || "",
    client_secret: body.client_secret || undefined,
  };
}

/**
 * 时序安全比较字符串
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
