/**
 * 用户设备管理端点
 * GET /api/user/devices
 *
 * 返回当前用户所有活跃的设备/会话（基于 RefreshToken 记录）。
 * 数据核心与 OAuth 端点（/api/oauth/security/devices）共用：src/lib/security-devices.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { hashRefreshToken } from "@/lib/auth-security";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { listSecurityDevices } from "@/lib/security-devices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 当前设备识别：请求携带的 refresh token Cookie 哈希与记录 token 哈希比对
    const currentRefreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;

    const data = await listSecurityDevices(user.id, currentHash);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[Devices] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
