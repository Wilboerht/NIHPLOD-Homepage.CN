/**
 * 用户登出 API
 * POST /api/auth/logout
 */
import { NextResponse } from "next/server";
import { USER_COOKIE_NAME, USER_COOKIE_OPTIONS } from "@/types/auth";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { message: "已退出登录" },
  });

  // 清除 Cookie
  response.cookies.set(USER_COOKIE_NAME, "", {
    ...USER_COOKIE_OPTIONS,
    maxAge: 0, // 立即过期
  });

  return response;
}

