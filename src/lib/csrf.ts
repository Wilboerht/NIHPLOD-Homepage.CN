/**
 * CSRF Token 工具
 *
 * 为写操作提供额外的 CSRF 防护（纵深防御）。
 * 虽然 Cookie 已使用 SameSite=Strict，此层可增强对复杂攻击场景的防御。
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const CSRF_COOKIE_NAME = "__Host-csrf_token";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

/**
 * 生成 CSRF Token
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * 设置 CSRF Token Cookie
 */
export function setCSRFCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // 前端需要读取
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1 小时（缩短 TTL 减少泄漏窗口）
  });
}

/**
 * 验证请求中的 CSRF Token
 * 从 header 和 cookie 中读取并安全比较
 */
export function validateCSRFToken(request: NextRequest): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!headerToken || !cookieToken) {
    return false;
  }

  try {
    const a = Buffer.from(headerToken);
    const b = Buffer.from(cookieToken);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * 返回 CSRF 验证失败的响应
 */
export function csrfForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
    { status: 403 }
  );
}
