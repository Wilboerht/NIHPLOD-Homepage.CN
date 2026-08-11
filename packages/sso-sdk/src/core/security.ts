/**
 * 安全相关小工具：returnUrl 开放重定向校验、常量时间字符串比较
 */

/**
 * 校验 returnUrl 是否可信（防开放重定向）。
 * 仅允许：相对路径（且不以 // 开头）或与 currentOrigin 完全同源的绝对 URL。
 */
export function isTrustedReturnUrl(url: string, currentOrigin: string): boolean {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).origin === currentOrigin;
  } catch {
    return false;
  }
}

/**
 * 常量时间字符串比较（避免 state / at_hash / nonce 等机密值的时序侧信道）。
 * 长度不同也执行完整循环，不提前返回。
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ba.length === 0 || bb.length === 0) return ba.length === bb.length;
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= ba[i % ba.length] ^ bb[i % bb.length];
  }
  return diff === 0;
}
