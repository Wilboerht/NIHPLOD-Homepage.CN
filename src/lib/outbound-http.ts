/**
 * 服务端出站 HTTPS 请求（Webhook / Backchannel Logout）。
 *
 * 关键防护：
 * - 仅允许 https，禁止 URL 内嵌凭据；
 * - 投递前解析全部 DNS 地址并拒绝私网/保留地址；
 * - 使用固定解析结果的 undici Agent，避免检查后再次解析造成 DNS Rebinding；
 * - 不跟随重定向，限制超时和响应体大小。
 */
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";

const MAX_RESPONSE_BYTES = 64 * 1024;

export function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/%.+$/, "");

  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return false;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false;
    return true;
  }

  if (isIP(normalized) === 6) {
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    ) {
      return false;
    }
    if (normalized.startsWith("::ffff:")) {
      return isPublicAddress(normalized.slice("::ffff:".length));
    }
    return true;
  }

  return false;
}

export function normalizeOutboundHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

async function resolvePublicHostname(
  hostname: string
): Promise<{ address: string; family: 4 | 6 }> {
  const normalized = normalizeOutboundHostname(hostname);
  if (!normalized) throw new Error("OUTBOUND_EMPTY_HOST");

  const resolved = await dns.lookup(normalized, { all: true, verbatim: true });
  if (resolved.length === 0) throw new Error("OUTBOUND_DNS_EMPTY");
  if (resolved.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("OUTBOUND_PRIVATE_ADDRESS");
  }

  const preferred = resolved[0];
  return {
    address: preferred.address,
    family: preferred.family === 6 ? 6 : 4,
  };
}

export async function postPublicHttps(rawUrl: string, init: RequestInit): Promise<Response> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("OUTBOUND_HTTPS_ONLY");
  if (url.username || url.password) throw new Error("OUTBOUND_CREDENTIALS_FORBIDDEN");

  const pinned = await resolvePublicHostname(url.hostname);
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, pinned.address, pinned.family);
      },
    },
  });

  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      dispatcher,
    } as RequestInit);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
    }

    // 真实 fetch 一定有流式 body：边读边限流，防止恶意 RP 返回无 Content-Length
    // 的超大响应体把服务端内存打满。仅对测试/边缘环境的轻量 ResponseLike 回退。
    if (!response.body) {
      if (typeof response.arrayBuffer !== "function") return response as Response;
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
      }
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    await dispatcher.close().catch(() => {});
  }
}
