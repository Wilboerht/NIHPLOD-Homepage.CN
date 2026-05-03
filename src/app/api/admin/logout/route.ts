import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/types/auth";

// POST /api/admin/logout - 管理员登出
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 二次验证：确保调用者已登录（中间件已做一层拦截，路由层再确认）
  const admin = await verifyAuth(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未登录" } },
      { status: 401 }
    );
  }

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
