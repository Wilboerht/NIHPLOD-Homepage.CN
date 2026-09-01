/**
 * 支持的 OAuth Scope 列表
 * GET /api/admin/oauth/scopes
 *
 * 管理端 Wizard 等页面从服务端动态获取 scope 列表，
 * 避免硬编码导致新增 scope 时 UI 不同步。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { SUPPORTED_SCOPES } from "@/lib/oauth-constants";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, { label: string; desc: string }> = {
  openid: { label: "OpenID", desc: "基础身份标识（必选）" },
  profile: { label: "个人信息", desc: "昵称、头像" },
  phone: { label: "手机号", desc: "脱敏手机号（138****1234）" },
  membership: { label: "会员信息", desc: "会员等级、累计消费" },
  birthday: { label: "生日", desc: "生日日期（ISO 8601 格式）" },
};

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-oauth-scopes");
    if (rateLimitResponse) return rateLimitResponse;

    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
        { status: 401 }
      );
    }

    const scopes = SUPPORTED_SCOPES.map((value) => ({
      value,
      label: SCOPE_LABELS[value]?.label || value,
      desc: SCOPE_LABELS[value]?.desc || "",
    }));
    return NextResponse.json({ success: true, data: { scopes } });
  } catch (error) {
    apiConsole.error("[OAuthScopes] GET 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
