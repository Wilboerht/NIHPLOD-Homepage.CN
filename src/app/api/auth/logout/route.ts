/**
 * 用户登出 API
 * POST /api/auth/logout
 */
import { NextResponse } from "next/server";
import { USER_COOKIE_NAME } from "@/types/auth";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { message: "已退出登录" },
  });

  // 清除 Cookie
  response.cookies.set(USER_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // 立即过期
  });

  return response;
}

