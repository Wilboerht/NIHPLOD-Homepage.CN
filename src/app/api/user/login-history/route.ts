/**
 * 用户登录历史端点
 * GET /api/user/login-history
 *
 * 返回当前用户最近的登录尝试记录。
 * 数据核心与 OAuth 端点（/api/oauth/security/login-history）共用：
 * src/lib/security-login-history.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { listSecurityLoginHistory } from "@/lib/security-login-history";

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

    const data = await listSecurityLoginHistory(user.id);
    if (!data) {
      return NextResponse.json(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[LoginHistory] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
