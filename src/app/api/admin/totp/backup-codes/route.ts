/**
 * 管理员 TOTP 备用码重新生成
 * POST /api/admin/totp/backup-codes
 *
 * 需要验证当前密码 + TOTP 动态码（或备用码）。
 * 验证通过后作废旧备用码并生成新一批，明文仅在响应中返回一次。
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import prisma from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  verifyTOTP,
  decryptTOTPSecret,
  generateBackupCodes,
  hashBackupCode,
} from "@/lib/totp";
import { consumeAdminBackupCode } from "@/lib/admin-backup-code";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { rateLimit } from "@/lib/ratelimit";
import { z } from "zod";
import { beginAuditLog, finishAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { revokeAllAdminStepUpGrants } from "@/lib/admin-step-up";

const regenerateSchema = z.object({
  password: z.string().min(1, "请输入密码"),
  totpCode: z.string().min(6, "请输入 6 位动态验证码或备用码"),
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
    const result = regenerateSchema.safeParse(body);
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
      select: {
        id: true,
        password: true,
        totpEnabled: true,
        totpSecret: true,
        totpBackupCodes: true,
      },
    });

    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "管理员不存在" } },
        { status: 404 }
      );
    }

    if (!admin.totpEnabled) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_NOT_ENABLED", message: "二次验证未启用" } },
        { status: 400 }
      );
    }

    const passwordValid = await verifyPassword(result.data.password, admin.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_INVALID", message: "密码错误" } },
        { status: 401 }
      );
    }

    // TOTP 专用速率限制（与登录口 admin-totp 桶同档），防结合密码验证穷举动态码
    const totpLimit = await rateLimit(`admin-totp-backup-codes:${admin.id}`, "admin-totp");
    if (!totpLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOTP_RATE_LIMITED", message: "二次验证尝试过于频繁，请 5 分钟后再试" },
        },
        { status: 429 }
      );
    }

    // 必须验证 TOTP 动态码或备用码，防止仅有密码（非完整 2FA）即可重置备用码
    const totpCode = result.data.totpCode.trim();
    let totpValid = false;
    if (admin.totpSecret) {
      try {
        const secret = decryptTOTPSecret(admin.totpSecret);
        totpValid = verifyTOTP(totpCode, secret);
        if (totpValid) {
          // 跨实例防重放：与登录/资金操作同口径（原子消费，存储故障 fail-closed）
          const replayKey = `totp:${admin.id}:${totpCode}`;
          if (!(await consumeAccessTokenOnce(replayKey))) {
            apiConsole.warn("[TOTP Backup Codes] 检测到 TOTP 重放或存储不可用:", admin.id);
            totpValid = false;
          }
        }
      } catch {
        totpValid = false;
      }
    }

    if (!totpValid && admin.totpBackupCodes) {
      try {
        const consumed = await consumeAdminBackupCode(admin.id, totpCode, admin.totpBackupCodes);
        if (consumed.ok) {
          totpValid = true;
        } else if (consumed.reason === "conflict") {
          apiConsole.warn("[TOTP Backup Codes] 备用码已被并发消费:", admin.id);
        }
      } catch (err) {
        apiConsole.warn("[TOTP Backup Codes] 备用码消费失败（fail-closed）:", err);
      }
    }

    if (!totpValid) {
      return NextResponse.json(
        { success: false, error: { code: "TOTP_INVALID", message: "二次验证码错误" } },
        { status: 401 }
      );
    }

    const auditId = await beginAuditLog({
      action: "admin_totp_backup_regenerate",
      targetType: "admin",
      targetId: admin.id,
      detail: { action: "totp_backup_regenerated" },
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

    // 生成新备用码（明文仅本次响应展示一次），哈希落库并整体替换旧码
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    await prisma.admin
      .update({
        where: { id: admin.id },
        data: { totpBackupCodes: JSON.stringify(hashedBackupCodes) },
      })
      .catch(async (error) => {
        await finishAuditLog(auditId, "FAILURE", { action: "totp_backup_regenerated" });
        throw error;
      });

    await revokeAllAdminStepUpGrants(admin.id).catch((err) =>
      apiConsole.warn("[TOTP Backup Codes] step-up grant 清理失败:", err)
    );

    await finishAuditLog(auditId, "SUCCESS", { action: "totp_backup_regenerated" });

    const response = NextResponse.json({
      success: true,
      data: { backupCodes },
    });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");

    return response;
  } catch (error) {
    apiConsole.error("[TOTP Backup Codes] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
