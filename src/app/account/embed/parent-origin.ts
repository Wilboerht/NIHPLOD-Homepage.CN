/**
 * 嵌入式用户中心 postMessage targetOrigin 推导
 *
 * iframe 向父窗口发送消息时，targetOrigin 必须指向**父窗口的 origin**
 * （而不是 iframe 自身的 NEXT_PUBLIC_APP_URL，否则父窗口永远收不到消息）。
 *
 * 推导方式：优先使用 window.location.ancestorOrigins[0]（浏览器提供的父框架
 * origin，不受 Referrer-Policy 裁剪、页面内部跳转的影响）；不支持时回退
 * document.referrer。
 * 可选白名单环境变量 NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS（逗号分隔）配置后，
 * 仅向白名单内的 origin 发送消息，校验失败返回 null（调用方不发消息并告警）。
 */

/**
 * 推导父窗口 origin 并做白名单校验
 *
 * @param referrer - document.referrer 的值（非嵌入场景通常为空）
 * @param allowedOrigins - 逗号分隔的 origin 白名单（NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS），
 *                         空字符串/未设置表示不启用白名单校验
 * @param ancestorOrigin - window.location.ancestorOrigins[0] 的值（可选，优先于 referrer）
 * @returns 合法的 targetOrigin；无法推导或校验失败时返回 null
 */
export function getParentTargetOrigin(
  referrer: string,
  allowedOrigins?: string,
  ancestorOrigin?: string
): string | null {
  const candidate = ancestorOrigin || referrer;
  if (!candidate) return null;

  let origin: string;
  try {
    origin = new URL(candidate).origin;
  } catch {
    return null;
  }

  const allowed = (allowedOrigins || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length > 0 && !allowed.includes(origin)) {
    return null;
  }

  return origin;
}
