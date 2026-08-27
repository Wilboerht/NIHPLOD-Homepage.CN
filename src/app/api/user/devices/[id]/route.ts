/**
 * 设备强制下线（撤销单个会话）
 * DELETE /api/user/devices/:id
 *
 * 安全约束：
 * - 仅允许撤销属于当前登录用户本人的会话（越权返回 404，不泄露存在性）
 * - 不允许撤销当前会话自身（防止操作端立即登出自己）
 * - OAuth client 关联会话同步撤销，确保携带 sid 的 access token 即时失效
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { USER_REFRESH_COOKIE_NAME } from "@/types/auth";

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

    // 目标会话必须属于当前用户且未撤销（越权查询统一 404，不泄露存在性）
    const target = await prisma.refreshToken.findFirst({
      where: { id, userId: user.id, revokedAt: null },
      select: { id: true, token: true, clientId: true },
    });

    if (!target) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "会话不存在或已下线" } },
        { status: 404 }
      );
    }

    // 不允许撤销当前会话自身（与 cookie 中 refresh token 的哈希比对）
    const currentToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
    if (currentToken) {
      const currentHash = createHash("sha256").update(currentToken).digest("hex");
      if (currentHash === target.token) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "CURRENT_SESSION", message: "不能强制下线当前设备，请使用退出登录" },
          },
          { status: 400 }
        );
      }
    }

    // 撤销 refresh token；OAuth client 会话同步撤销（事务内保证一致）
    // 已知窗口：此处只撤销 refresh token 与 OAuth session，目标设备已持有的
    // access token 在其剩余 TTL（≤15 分钟）内仍然有效。原因：RefreshToken 记录
    // 不关联已签发 access token 的 jti，要消除该窗口需额外维护 access jti ↔
    // 会话的关联存储；权衡实现成本后接受 15 分钟上限（access token 到期即无法续期）。
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: target.id },
        data: { revokedAt: new Date() },
      });
      if (target.clientId) {
        await tx.oAuthSession.updateMany({
          where: { userId: user.id, clientId: target.clientId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    // access token 已不再携带明文手机号，审计日志的 identifier 按 id 查库获取
    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });

    logAuthEvent("device_force_logout", {
      userId: user.id,
      identifier: userRecord?.phone,
      success: true,
      targetTokenId: target.id,
    });

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
