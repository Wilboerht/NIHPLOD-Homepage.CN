/**
 * 用户自助解绑第三方身份
 * DELETE /api/user/identities/:id
 *
 * 安全约束（核心见 src/lib/security-identities.ts）：
 * - 仅允许解绑属于当前登录用户本人的身份（越权统一 404，不泄露存在性）
 * - 占位手机号账号（从未绑定真实手机号）拒绝解绑，避免账号被永久锁死
 * - 事务内删除身份并清理失去身份支撑的微信旧列
 * - 写认证审计（user_oauth_revoke / self=true）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { unbindSecurityIdentity } from "@/lib/security-identities";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const result = await unbindSecurityIdentity({ userId: user.id, identityId: id });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, data: { message: "已解除绑定" } });
  } catch (error) {
    apiConsole.error("[UserIdentityUnbind] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
