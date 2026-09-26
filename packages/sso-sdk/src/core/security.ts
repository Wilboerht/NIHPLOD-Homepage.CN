/**
 * 安全相关小工具：returnUrl 开放重定向校验、常量时间字符串比较
 */

/**
 * 反斜杠或 ASCII 控制字符（tab/newline/CR/DEL）。
 * WHATWG URL 解析会在解析前剥离 TAB/LF/CR，并把 "\" 归一化为 "/"，
 * 因此 "/\evil.com"、"/\n//evil.com" 能通过字符串前缀判断后变成跨站 URL。
 */
const UNSAFE_URL_CHAR_PATTERN = /[\\\u0000-\u001F\u007F]/;

/**
 * 校验 returnUrl 是否可信（防开放重定向）。
 * 仅允许：
 * - 站内相对路径（以单个 "/" 开头且不以 "//" 开头）
 * - 与 currentOrigin 完全同源的 http(s) 绝对 URL
 * 拒绝一切含反斜杠/控制字符的值（浏览器会将 "/\evil.com" 解析为跨站 URL），
 * 拒绝 userinfo 与危险 scheme。
 */
export function isTrustedReturnUrl(url: string, currentOrigin: string): boolean {
  if (!url) return false;
  if (UNSAFE_URL_CHAR_PATTERN.test(url)) return false;
  if (url.startsWith("//")) return false;
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return parsed.origin === currentOrigin;
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
