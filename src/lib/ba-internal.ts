/**
 * 主站 → BA 证书平台内部接口客户端
 *
 * 鉴权：INTERNAL_API_KEYS 的 ba 项目，HMAC-SHA256 query 绑定签名。
 * BA 是举报数据唯一来源；主站只读取/回写，不落举报副本。
 */
import {
  canonicalizeQuery,
  createSignedInternalRequestHeaders,
} from "@/lib/internal-api";
import { apiConsole } from "@/lib/logger";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BASE = "http://127.0.0.1:3001";

export function baBaseUrl(): string {
  return (process.env.BA_INTERNAL_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

export type BaMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface BaInternalRequestOptions {
  method?: BaMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

export type BaInternalResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

function buildQuery(query: BaInternalRequestOptions["query"]): {
  search: string;
  canonical: string;
} {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return { search: qs ? `?${qs}` : "", canonical: canonicalizeQuery(qs) };
}

export async function baInternalRequest<T>(
  path: string,
  options: BaInternalRequestOptions = {}
): Promise<BaInternalResult<T>> {
  const method = options.method ?? "GET";
  const bodyText = options.body !== undefined ? JSON.stringify(options.body) : "";
  const { search, canonical } = buildQuery(options.query);

  const headers = createSignedInternalRequestHeaders("ba", method, path, bodyText, {
    query: canonical,
    forceQueryBinding: true,
  });
  if (!headers) {
    return {
      ok: false,
      status: 0,
      code: "NOT_CONFIGURED",
      message: "未配置 BA 内部 API 密钥",
    };
  }

  const url = `${baBaseUrl()}${path}${search}`;
  try {
    const res = await fetch(url, {
      method,
      headers: bodyText ? { ...headers, "Content-Type": "application/json" } : headers,
      body: bodyText || undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });

    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: T; error?: { code?: string; message?: string } }
      | null;

    if (!res.ok || !payload?.success) {
      apiConsole.warn("[ba-internal] BA 响应异常", { path, status: res.status });
      return {
        ok: false,
        status: res.status,
        code: payload?.error?.code || (res.status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR"),
        message: payload?.error?.message || "BA 服务暂时不可用",
      };
    }

    return { ok: true, status: res.status, data: payload.data as T };
  } catch (error) {
    apiConsole.warn("[ba-internal] BA 不可达", { path, error: String(error) });
    return {
      ok: false,
      status: 0,
      code: "UPSTREAM_ERROR",
      message: "BA 服务连接失败",
    };
  }
}

/** 只读场景降级封装：失败返回 null */
export async function baJson<T>(
  path: string,
  options: BaInternalRequestOptions = {}
): Promise<T | null> {
  const result = await baInternalRequest<T>(path, options);
  return result.ok ? result.data : null;
}
