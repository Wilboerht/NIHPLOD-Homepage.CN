/**
 * 网络请求工具：带超时的 fetch（AbortController）
 *
 * 内部模块：不从包入口导出（core/SsoClient 与 next/callback 共用）。
 */

/** token / userinfo 请求默认超时（毫秒）：避免回调页/登录流程无限挂起 */
export const REQUEST_TIMEOUT_MS = 10_000;

/** 带超时的 fetch（AbortController）；超时抛 AbortError（调用方按网络错误处理） */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
