import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit, getTokenFromRequest } from "@/lib/auth";
import { verifyToken } from "@/lib/jwt";
import { revokeAccessToken } from "@/lib/token-blacklist";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";

// POST /api/admin/logout - 管理员登出
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, admin) => {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  const rateLimitResponse = await checkAdminRateLimit(request, "admin-logout");
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // 服务端撤销当前 token 的 jti：防止被复制的 token 在 Cookie 清除后继续使用
    const token = getTokenFromRequest(request);
    if (token) {
      const payload = await verifyToken(token);
      if (payload?.jti) {
        // admin token 默认 1d，黑名单 TTL 必须覆盖其真实 exp（默认 2h 会在过期前失效）
        await revokeAccessToken(
          payload.jti,
          payload.exp ? payload.exp * 1000 : undefined
        ).catch((err) => apiConsole.warn("[AdminLogout] token jti 撤销失败:", err));
      }
    }

    // 记录登出审计日志
    await createAuditLog({
      action: "logout",
      targetType: "system",
      targetId: admin.id,
      detail: { email: admin.email },
      adminId: admin.id,
      request,
    });

    const response = NextResponse.json({
      success: true,
      message: "已成功登出",
    });

    // 清除认证 Cookie（与设置时属性保持一致）
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...COOKIE_OPTIONS,
      maxAge: 0, // 立即过期
    });

    return response;
  } catch (error) {
    apiConsole.error("[AdminLogout] POST 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
