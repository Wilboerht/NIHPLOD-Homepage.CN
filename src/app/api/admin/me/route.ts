import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

// GET /api/admin/me - 获取当前登录的管理员信息
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);

    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "未登录或登录已过期",
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
        },
      },
    });
  } catch (error) {
    console.error("获取用户信息失败:", error);
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
}

