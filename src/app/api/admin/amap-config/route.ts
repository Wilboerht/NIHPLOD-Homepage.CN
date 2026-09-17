import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    // 高德密钥（含安全密钥）需要 amap:read 权限（默认仅 owner）；无权限时地图选择降级为手动填写
    if (!hasAdminPermission(admin, "amap:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：地图密钥读取" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    return NextResponse.json({
      success: true,
      data: {
        key: process.env.AMAP_KEY || "",
        secret: process.env.AMAP_SECRET || "",
      },
    });
  } catch (error) {
    apiConsole.error("[AmapConfig] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
