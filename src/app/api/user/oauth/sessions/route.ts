/**
 * 用户 OAuth 授权列表端点
 * GET /api/user/oauth/sessions
 *
 * 返回当前用户所有活跃的 OAuth 授权记录（含 client 名称）。
 * 同一 client 可能存在多条 session（多次授权/多设备），按 clientId 去重，
 * 每 client 仅返回最近创建的一条。
 * 数据核心与 OAuth 端点（/api/oauth/security/authorizations）共用：
 * src/lib/security-authorizations.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { listSecurityAuthorizations } from "@/lib/security-authorizations";

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

    const data = await listSecurityAuthorizations(user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[OAuth Sessions] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
