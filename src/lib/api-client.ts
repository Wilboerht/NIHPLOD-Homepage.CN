/**
 * 统一 API 客户端
 * 封装 fetch 逻辑，统一处理认证、错误、响应解析、CSRF Token
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = path.startsWith("/") ? path : `/${path}`;
  if (!params) return url;

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
}

const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_COOKIE_NAME = "__Host-csrf_token";

function getCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${CSRF_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfRefreshPromise: Promise<string | null> | null = null;

async function refreshCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/csrf", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const data = (await response.json()) as ApiResponse<{ token: string }>;
    return data.data?.token ?? null;
  } catch {
    return null;
  }
}

async function getCSRFToken(): Promise<string | null> {
  const existing = getCSRFTokenFromCookie();
  if (existing) return existing;

  if (!csrfRefreshPromise) {
    csrfRefreshPromise = refreshCSRFToken().finally(() => {
      csrfRefreshPromise = null;
    });
  }
  return csrfRefreshPromise;
}

/**
 * 发送 API 请求
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, params, headers: customHeaders } = options;
  const url = buildUrl(path, params);

  const send = async (isRetry = false): Promise<T> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...customHeaders,
    };

    const init: RequestInit = {
      method,
      headers,
      credentials: "include", // 自动带上 Cookie
    };

    if (body !== undefined) {
      if (body instanceof FormData) {
        init.body = body;
      } else {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
    }

    // 非安全方法自动附加 CSRF Token
    const needsCSRF = method !== "GET";
    if (needsCSRF) {
      const csrfToken = await getCSRFToken();
      if (csrfToken) {
        headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    const response = await fetch(url, init);

    // 尝试解析 JSON，即使状态码不是 2xx
    let data: ApiResponse<T> = { success: true };
    if (response.status !== 204) {
      try {
        data = (await response.json()) as ApiResponse<T>;
      } catch {
        throw new ApiError("PARSE_ERROR", "响应解析失败", response.status);
      }
    }

    if (!response.ok || !data.success) {
      // CSRF 校验失败时刷新 Token 并重试一次
      if (!isRetry && response.status === 403 && data.error?.code === "CSRF_INVALID") {
        await refreshCSRFToken();
        return send(true);
      }

      throw new ApiError(
        data.error?.code || "UNKNOWN_ERROR",
        data.error?.message || `请求失败 (${response.status})`,
        response.status,
        data.error?.details
      );
    }

    return data.data as T;
  };

  return send();
}

/**
 * 便捷方法：GET 请求
 */
export function apiGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  return apiRequest<T>(path, { method: "GET", params });
}

/**
 * 便捷方法：POST 请求
 */
export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
}

/**
 * 便捷方法：PATCH 请求
 */
export function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}

/**
 * 便捷方法：PUT 请求
 */
export function apiPut<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PUT", body });
}

/**
 * 便捷方法：DELETE 请求
 */
export function apiDelete<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE", body });
}
