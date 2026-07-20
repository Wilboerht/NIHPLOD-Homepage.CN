import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";

// GET /api/admin/me - 获取当前登录的管理员信息
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, admin) => {
  try {
    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
    });
  } catch (error) {
    apiConsole.error("获取用户信息失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: "获取用户信息失败",
        },
      },
      { status: 500 }
    );
  }
});
