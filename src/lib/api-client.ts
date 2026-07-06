/**
 * 统一 API 客户端
 * 封装 fetch 逻辑，统一处理认证、错误、响应解析
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
  body?: Record<string, unknown> | unknown;
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

/**
 * 发送 API 请求
 */
export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, headers: customHeaders } = options;

  const url = buildUrl(path, params);

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
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
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
    throw new ApiError(
      data.error?.code || "UNKNOWN_ERROR",
      data.error?.message || `请求失败 (${response.status})`,
      response.status,
      data.error?.details
    );
  }

  return data.data as T;
}

/**
 * 便捷方法：GET 请求
 */
export function apiGet<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  return apiRequest<T>(path, { method: "GET", params });
}

/**
 * 便捷方法：POST 请求
 */
export function apiPost<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body });
}

/**
 * 便捷方法：PATCH 请求
 */
export function apiPatch<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body });
}
