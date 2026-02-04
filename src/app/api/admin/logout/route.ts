import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/types/auth";

// POST /api/admin/logout - 管理员登出
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "已成功登出",
  });

  // 清除认证 Cookie
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0, // 立即过期
  });

  return response;
}
