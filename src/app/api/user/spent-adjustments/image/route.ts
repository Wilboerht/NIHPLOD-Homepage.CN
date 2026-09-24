/**
 * 私有凭证图片访问端点（用户端）
 * GET /api/user/spent-adjustments/image?key=<objectName>
 *
 * 仅允许凭证所属用户查看：验证登录态 + 申请归属后，重定向到私有 bucket 的
 * 短时效签名 URL（4 小时）。私有 bucket 未配置时返回 404。
 * 归属校验与签名逻辑与 OAuth 资源端点共用（见 src/lib/spent-adjustment-files.ts）。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { resolveSpentProofImage } from "@/lib/spent-adjustment-files";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const key = request.nextUrl.searchParams.get("key") ?? "";
    const result = await resolveSpentProofImage(payload.id, key);

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.redirect(result.signedUrl, 302);
  } catch (error) {
    apiConsole.error("[SpentAdjustment] 凭证图片访问失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
