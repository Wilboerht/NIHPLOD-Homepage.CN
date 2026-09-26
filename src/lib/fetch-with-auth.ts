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

/**
 * 会话终结事件：401 且静默刷新最终失败（确认为会话终结）时广播。
 * 由 AuthContext 统一监听并执行"清态 + 跳登录页"，本库保持 UI 无关。
 */
export const SESSION_EXPIRED_EVENT = "nihplod:session-expired";

/** 会话过期原因提示的 sessionStorage key（登录页读取后清除，10 分钟内有效） */
export const SESSION_EXPIRED_HINT_KEY = "nihplod_session_expired_hint";

/** 明确的"会话已终结"错误码（仅这些才允许直接判定需要重新登录） */
const FATAL_REFRESH_ERROR_CODES = new Set([
  "TOKEN_REVOKED",
  "DEVICE_LIMIT_EXCEEDED",
  "MISSING_REFRESH_TOKEN",
  "INVALID_TOKEN",
  "ACCOUNT_DISABLED",
]);

/**
 * 静默刷新结果：
 * - ok：刷新成功
 * - fatal：服务端明确判定会话已终结（广播登出事件）
 * - retryable：网络异常/5xx/429/无法识别的 401 等可恢复失败（保留登录态并退避重试）
 */
export type RefreshResult = { ok: true } | { ok: false; kind: "fatal" | "retryable" };

let refreshPromise: Promise<RefreshResult> | null = null;

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

async function doRefresh(): Promise<RefreshResult> {
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
    if (res.ok) return { ok: true };

    // 解析错误码：用于区分"会话终结"与"可恢复失败"
    let errorCode: string | undefined;
    if (typeof window !== "undefined") {
      try {
        const data = (await res.json()) as {
          error?: { code?: string; message?: string };
        };
        errorCode = data?.error?.code;
        if (
          errorCode === "DEVICE_LIMIT_EXCEEDED" &&
          typeof data.error?.message === "string"
        ) {
          // 带时间戳：登录页只展示 10 分钟内的原因，避免历史提示误报
          sessionStorage.setItem(
            SESSION_EXPIRED_HINT_KEY,
            `${Date.now()}|${data.error.message.slice(0, 120)}`
          );
        }
      } catch {
        // 响应体非 JSON：errorCode 保持 undefined
      }
    }

    // 网络/限流/服务端故障：保留登录态，退避重试
    if (res.status >= 500 || res.status === 429 || res.status === 408) {
      return { ok: false, kind: "retryable" };
    }

    // 401/403：仅服务端明确给出会话终结错误码时判定 fatal；
    // 无法识别（如网关/WAF 返回的 401）按可恢复处理，避免一次抖动即强制登出
    if (errorCode && FATAL_REFRESH_ERROR_CODES.has(errorCode)) {
      return { ok: false, kind: "fatal" };
    }
    return { ok: false, kind: "retryable" };
  } catch {
    // 网络异常
    return { ok: false, kind: "retryable" };
  }
}

/**
 * 刷新 Access Token，使用锁防止并发刷新
 */
export async function refreshAccessToken(): Promise<RefreshResult> {
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
    if (!refreshed.ok) {
      if (refreshed.kind === "fatal") {
        // 服务端明确判定会话终结（全局退出/吊销/设备超限）：广播事件由 AuthContext 统一处理
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
        }
        throw new UnauthorizedError();
      }
      // 可恢复失败（网络/5xx/429）：不广播、不强制登出，由上层提示重试
      throw new UnauthorizedError("网络异常，登录状态暂时无法确认，请稍后重试");
    }
    response = await fetch(input, mergedInit);
  }

  return response;
}
