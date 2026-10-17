/**
 * 设备强制下线（撤销单个会话）
 * DELETE /api/user/devices/:id
 *
 * 安全约束（核心见 src/lib/security-devices.ts）：
 * - 仅允许撤销属于当前登录用户本人的会话（越权返回 404，不泄露存在性）
 * - 不允许撤销当前会话自身（防止操作端立即登出自己）
 * - OAuth client 关联会话同步撤销，并通过 Backchannel Logout 通知对应 client
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { hashRefreshToken } from "@/lib/auth-security";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";
import { forceLogoutDevice } from "@/lib/security-devices";

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

    const currentToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
    const currentHash = currentToken ? hashRefreshToken(currentToken) : null;

    const result = await forceLogoutDevice({
      userId: user.id,
      deviceId: id,
      currentRefreshTokenHash: currentHash,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "已将该设备强制下线" },
    });
  } catch (error) {
    apiConsole.error("[ForceLogoutDevice] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
