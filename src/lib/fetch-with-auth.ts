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

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
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
  const mergedInit: RequestInit = {
    ...init,
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
