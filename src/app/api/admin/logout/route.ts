import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/types/auth";
import { createAuditLog } from "@/lib/audit";

// POST /api/admin/logout - 管理员登出
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (request: NextRequest, admin) => {
  // 记录登出审计日志
  await createAuditLog({
    action: "logout",
    targetType: "system",
    targetId: admin.id,
    detail: { email: admin.email },
    adminId: admin.id,
    request,
  });

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
});
