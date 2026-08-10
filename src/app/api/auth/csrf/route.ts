/**
 * CSRF Token API
 * GET /api/auth/csrf
 *
 * 生成新的 CSRF Token 并设置到 Cookie 中。
 */
import { NextResponse } from "next/server";
import { generateCSRFToken, setCSRFCookie } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = generateCSRFToken();
  // token 仅通过 Set-Cookie 返回（httpOnly: false 但仍不应暴露在 JSON body 中）
  // 防止 XSS 读取
  const response = NextResponse.json({ success: true });
  setCSRFCookie(response, token);
  return response;
}
