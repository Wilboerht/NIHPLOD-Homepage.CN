/**
 * PKCE (Proof Key for Code Exchange) 工具函数
 *
 * 实现 RFC 7636 规范：
 * - code_verifier: 43-128 字符的随机字符串
 * - code_challenge: SHA-256(code_verifier) 的 base64url 编码
 *
 * 仅支持 S256 模式，不提供 plain 模式。
 */

const VALID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * 生成密码学安全随机字符串
 *
 * 使用拒绝采样法（rejection sampling）避免取模非均匀分布。
 * VALID_CHARS 有 66 个字符，Uint8(0-255) 取模会偏向前 58 个字符。
 * 丢弃 >=198 的字节值使分布完全均匀（198 = floor(256/66) * 66）。
 */
function generateRandomString(length: number): string {
  const mask = 198; // 66 * 3，最大均匀取值
  let result = "";

  while (result.length < length) {
    // 一次生成分块避免过小 array 的循环开销
    const chunkSize = Math.min(length * 2, 256);
    const array = new Uint8Array(chunkSize);
    crypto.getRandomValues(array);

    for (let i = 0; i < chunkSize && result.length < length; i++) {
      if (array[i] >= mask) continue; // 拒绝采样：丢弃 >=198 的字节
      result += VALID_CHARS[array[i] % VALID_CHARS.length];
    }
  }

  return result;
}

/**
 * 生成 code_verifier
 *
 * 生成 43-128 字符之间的安全随机字符串，
 * 使用 `crypto.getRandomValues` 保证密码学安全性。
 *
 * @param length - 长度（默认 64），范围 43-128
 */
export function generateCodeVerifier(length: number = 64): string {
  if (length < 43 || length > 128) {
    throw new Error("code_verifier length must be between 43 and 128");
  }
  return generateRandomString(length);
}

/**
 * 计算 code_challenge (S256)
 *
 * 对 code_verifier 进行 SHA-256 哈希，然后进行 base64url 编码。
 *
 * @param codeVerifier - PKCE code_verifier
 */
export async function generateCodeChallenge(
  codeVerifier: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);

  // 转为 base64url（无 padding）
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 生成 state 参数
 *
 * 32 字节 hex 随机字符串，用于 CSRF 防护。
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
