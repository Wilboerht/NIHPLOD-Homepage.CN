/**
 * 管理员 TOTP 设置确认
 * POST /api/admin/totp/verify-setup
 *
 * 验证首个 TOTP code，成功后启用 TOTP。
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import { verifyTOTP, decryptTOTPSecret } from "@/lib/totp";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { z } from "zod";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { revokeAllAdminStepUpGrants } from "@/lib/admin-step-up";
import { rateLimit } from "@/lib/ratelimit";
import { signToken } from "@/lib/jwt";
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from "@/types/auth";

const verifySchema = z.object({
  code: z.string().length(6, "请输入6位验证码"),
});

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, adminPayload) => {
  try {
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const result = verifySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message },
        },
        { status: 400 }
      );
    }

    const admin = await prisma.admin.findUnique({
      where: { id: adminPayload.id },
      select: { id: true, email: true, totpSecret: true, totpEnabled: true },
    });

    if (!admin || !admin.totpSecret) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_NOT_SETUP", message: "请先开始二次验证设置" } },
        { status: 400 }
      );
    }

    if (admin.totpEnabled) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_ALREADY_ENABLED", message: "二次验证已启用" } },
        { status: 400 }
      );
    }

    const totpLimit = await rateLimit(`admin-totp-verify-setup:${admin.id}`, "admin-totp");
    if (!totpLimit.success) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_RATE_LIMITED", message: "验证尝试过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const secret = decryptTOTPSecret(admin.totpSecret);
    if (!verifyTOTP(result.data.code, secret)) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "验证码错误" } },
        { status: 400 }
      );
    }

    // 跨实例防重放：与登录/资金操作同口径（原子消费，存储故障 fail-closed）
    const replayKey = `totp:${admin.id}:${result.data.code}`;
    if (!(await consumeAccessTokenOnce(replayKey))) {
      apiConsole.warn("[TOTP Verify Setup] 检测到 TOTP 重放或存储不可用:", admin.id);
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOTP_INVALID", message: "验证码已被使用，请等待刷新后重试" },
        },
        { status: 400 }
      );
    }

    const auditId = await beginAuditLog({
      action: "update_admin",
      targetType: "admin",
      targetId: admin.id,
      detail: { action: "totp_enabled" },
      actorType: "ADMIN",
      actorEmail: adminPayload.email,
      actorName: adminPayload.name,
      actorRole: adminPayload.role,
      authMethod: "totp",
      adminId: admin.id,
      request,
    });
    if (!auditId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "AUDIT_UNAVAILABLE", message: "审计服务不可用，已拒绝操作" },
        },
        { status: 503 }
      );
    }

    // 启用 TOTP 时递增 tokenVersion：使启用前窃取的旧会话立即失效，
    // 避免旧会话绕过“本会话是否完成过 TOTP”直接使用 SSO 等能力。
    const updatedAdmin = await prisma.admin
      .update({
        where: { id: admin.id },
        data: {
          totpEnabled: true,
          totpEnabledAt: new Date(),
          tokenVersion: { increment: 1 },
        },
        select: { tokenVersion: true },
      })
      .catch(async (error) => {
        await finishAuditLog(auditId, "FAILURE", { action: "totp_enabled" });
        throw error;
      });
    await revokeAllAdminStepUpGrants(admin.id).catch((err) =>
      apiConsole.warn("[TOTP Verify Setup] step-up grant 清理失败:", err)
    );

    await finishAuditLog(auditId, "SUCCESS", { action: "totp_enabled" });

    // 重新签发当前会话，避免管理员在启用 2FA 后被动退出；其他旧会话已因版本递增失效。
    const token = await signToken({
      id: admin.id,
      email: admin.email,
      name: adminPayload.name,
      role: adminPayload.role,
      ver: updatedAdmin.tokenVersion,
    });
    const response = NextResponse.json({ success: true, data: { message: "二次验证已启用" } });
    response.cookies.set(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS);
    return response;
  } catch (error) {
    apiConsole.error("[TOTP Verify Setup] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
