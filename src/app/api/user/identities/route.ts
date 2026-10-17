/**
 * 用户第三方绑定列表
 * GET /api/user/identities
 *
 * 返回当前登录用户已绑定的第三方身份，供用户中心「安全中心 → 账号绑定」展示与自助解绑。
 * 数据核心与 OAuth 端点（/api/oauth/security/identities）共用：
 * src/lib/security-identities.ts（不返回 subjectId，避免平台标识泄漏）。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { listSecurityIdentities } from "@/lib/security-identities";

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

    const data = await listSecurityIdentities(user.id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiConsole.error("[UserIdentities] 查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
