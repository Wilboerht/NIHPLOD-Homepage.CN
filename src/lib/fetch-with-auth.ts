/**
 * 带自动 Token 刷新的 fetch 封装
 *
 * 当请求返回 401 时，会自动调用 /api/auth/refresh 刷新 Access Token，
 * 然后重试原请求。如果刷新失败，则抛出 UnauthorizedError。
 *
 * 使用 httpOnly Cookie，因此不需要也不应该在客户端处理 Token 字符串。
 */

export class UnauthorizedError extends Error {
  constructor(message = "登录已过期，请重新登录") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * 从 Cookie 中读取 CSRF Token
 */
function getCSRFTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 获取 CSRF Token（从 Cookie 或服务器）
 */
async function ensureCSRFToken(): Promise<string | null> {
  const existing = getCSRFTokenFromCookie();
  if (existing) return existing;

  try {
    const res = await fetch("/api/auth/csrf", { credentials: "include" });
    if (res.ok) {
      // 优先从 JSON 响应体读取（api-client 行为一致），回退到 Cookie
      try {
        const data = await res.json();
        if (data?.data?.token) return data.data.token as string;
      } catch {
        // JSON 解析失败，忽略
      }
      return getCSRFTokenFromCookie();
    }
  } catch {
    // 忽略 CSRF token 获取失败
  }
  return null;
}

async function doRefresh(): Promise<boolean> {
  try {
    // 刷新 Token 时也需附带 CSRF Token
    const csrfToken = await ensureCSRFToken();
    const headers: HeadersInit = {};
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 刷新 Access Token，使用锁防止并发刷新
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/**
 * 带自动刷新的 fetch
 *
 * @param input - 请求地址或 Request 对象
 * @param init - fetch 初始化参数
 * @returns Response 对象
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isWriteOperation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  const headers = new Headers(init?.headers);

  // 写操作自动附加 CSRF Token
  if (isWriteOperation) {
    const csrfToken = await ensureCSRFToken();
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const mergedInit: RequestInit = {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  };

  let response = await fetch(input, mergedInit);

  // 如果未授权，尝试刷新 Token 后重试一次
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw new UnauthorizedError();
    }
    response = await fetch(input, mergedInit);
  }

  return response;
}
