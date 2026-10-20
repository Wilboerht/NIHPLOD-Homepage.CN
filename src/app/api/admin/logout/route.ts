import { NextRequest, NextResponse } from "next/server";
import { checkAdminRateLimit, getTokenFromRequest } from "@/lib/auth";
import { verifyToken } from "@/lib/jwt";
import { revokeAccessToken } from "@/lib/token-blacklist";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import {
  ADMIN_STEP_UP_COOKIE_NAME,
  ADMIN_STEP_UP_COOKIE_OPTIONS,
  revokeAdminStepUpGrantsForSession,
} from "@/lib/admin-step-up";

// POST /api/admin/logout - 管理员登出
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

/**
 * 登出必须始终能清 Cookie：
 * - 不再使用 withAuth：token 已过期/已撤销/账号已禁用时仍要能退出
 * - 仍校验 CSRF，防止跨站强制登出
 * - 若 token 签名有效，撤销其 jti，避免被复制的 token 在 Cookie 清除后继续使用
 */
export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const rateLimitResponse = await checkAdminRateLimit(request, "admin-logout");
    if (rateLimitResponse) return rateLimitResponse;

    const token = getTokenFromRequest(request);
    let adminId: string | undefined;
    let adminEmail: string | undefined;
    let adminName: string | undefined;
    let adminRole: string | undefined;
    let adminJti: string | undefined;

    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        adminId = payload.id;
        adminEmail = payload.email;
        adminName = payload.name;
        adminRole = payload.role;
        adminJti = payload.jti;
        if (payload.jti) {
          await revokeAccessToken(
            payload.jti,
            payload.exp ? payload.exp * 1000 : undefined
          ).catch((err) => apiConsole.warn("[AdminLogout] token jti 撤销失败:", err));
        }
        await revokeAdminStepUpGrantsForSession(payload.id, payload.jti ?? null).catch((err) =>
          apiConsole.warn("[AdminLogout] step-up grant 撤销失败:", err)
        );
      }
    }

    if (adminId) {
      await createAuditLog({
        action: "admin_logout",
        targetType: "admin",
        targetId: adminId,
        actorType: "ADMIN",
        actorEmail: adminEmail,
        actorName: adminName,
        actorRole: adminRole,
        authMethod: "session",
        sessionJti: adminJti,
        detail: { email: adminEmail },
        adminId,
        request,
      });
    }

    const response = NextResponse.json({
      success: true,
      message: "已成功登出",
    });

    // 清除认证 Cookie（与设置时属性保持一致）
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    });
    response.cookies.set(ADMIN_STEP_UP_COOKIE_NAME, "", {
      ...ADMIN_STEP_UP_COOKIE_OPTIONS,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    apiConsole.error("[AdminLogout] POST 异常:", error);

    // 即使服务端异常也必须清 Cookie，否则用户会被困在无法退出的后台
    const response = NextResponse.json(
      { success: true, message: "已清除本地登录状态" },
      { status: 200 }
    );
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...COOKIE_OPTIONS,
      maxAge: 0,
    });
    response.cookies.set(ADMIN_STEP_UP_COOKIE_NAME, "", {
      ...ADMIN_STEP_UP_COOKIE_OPTIONS,
      maxAge: 0,
    });
    return response;
  }
}
