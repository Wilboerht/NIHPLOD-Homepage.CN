/**
 * OAuth 2.0 AI 测肤用量端点
 * GET /api/oauth/skin-test-usage - 当前用户的 AI 测肤已用/剩余次数
 *
 * 数据来源为测肤子站（smart.nihplod.cn）内部接口，与主站 /api/user/vip
 * 的 skinTestUsage 字段共用查询核心（src/lib/skin-test-usage.ts）。
 *
 * 与会员视图（/api/oauth/membership）分离为独立端点：测肤用量依赖子站可用性，
 * 独立端点避免子站降级时拖慢会员/首页等核心调用；调用方自行 fail-soft。
 * 子站未配置/超时/异常时 usage 返回 null（不报错）。
 *
 * scope：membership（测肤次数属会员权益用量）。
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { fetchSkinTestUsage } from "@/lib/skin-test-usage";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "skin_test_usage",
    });
    if (!auth.ok) return auth.response;

    // 子站查询 fail-soft：失败返回 null，不影响调用方渲染
    const usage = await fetchSkinTestUsage(auth.payload.id);
    return auth.resJson({ success: true, data: { usage } });
  } catch (error) {
    apiConsole.error("[OAuth SkinTestUsage] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
