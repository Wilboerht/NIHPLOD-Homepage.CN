/**
 * URL 安全校验（防开放重定向）
 *
 * 浏览器 URL 解析（WHATWG）在解析前会：
 * - 剥离 ASCII 控制字符（TAB/LF/CR，0x09/0x0A/0x0D）以及首尾空白
 * - 把反斜杠 "\" 归一化为 "/"（special scheme）
 *
 * 因此 `"/\evil.com"`、`"/\n//evil.com"` 这类值能通过
 * `startsWith("/") && !startsWith("//")` 的字符串判断，但随后经
 * `new URL(value, origin)` 会被解析为跨站 URL，形成开放重定向。
 *
 * 所有回跳/重定向校验必须先拒绝反斜杠与 ASCII 控制字符，再做同源解析。
 */

/** 反斜杠或 ASCII 控制字符（含 tab/newline/CR/DEL） */
const UNSAFE_URL_CHAR_PATTERN = /[\\\u0000-\u001F\u007F]/;

/** 是否包含反斜杠或 ASCII 控制字符 */
export function hasUnsafeUrlChars(value: string): boolean {
  return UNSAFE_URL_CHAR_PATTERN.test(value);
}

/**
 * 站内相对路径：
 * - 非空且以单个 "/" 开头（不以 "//" 开头）
 * - 不含反斜杠与控制字符
 */
export function isSafeRelativePath(value: string): boolean {
  if (!value) return false;
  if (hasUnsafeUrlChars(value)) return false;
  return value.startsWith("/") && !value.startsWith("//");
}

/**
 * 可信跳转地址：
 * - 站内相对路径（见 isSafeRelativePath）
 * - 或与 origin 完全同源的 http(s) 绝对 URL（拒绝 userinfo、危险 scheme 与无法解析的值）
 *
 * @param value - 待校验地址
 * @param origin - 期望的 origin（如 window.location.origin 或受信站点 origin）
 */
export function isSafeSameOriginUrlOrPath(value: string, origin: string): boolean {
  if (!value) return false;
  if (isSafeRelativePath(value)) return true;
  if (hasUnsafeUrlChars(value)) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return parsed.origin === origin;
  } catch {
    return false;
  }
}
