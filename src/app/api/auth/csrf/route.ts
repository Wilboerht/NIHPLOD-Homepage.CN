/**
 * CSRF Token API
 * GET /api/auth/csrf
 *
 * 生成新的 CSRF Token 并设置到 Cookie 中。
 */
import { NextRequest, NextResponse } from "next/server";
import { generateCSRFToken, setCSRFCookie } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const token = generateCSRFToken();
  const response = NextResponse.json({ success: true, data: { token } });
  setCSRFCookie(response, token);
  return response;
}
