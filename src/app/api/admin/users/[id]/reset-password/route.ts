/**
 * 管理端重置用户密码 API（仅超级管理员）
 * POST /api/admin/users/[id]/reset-password - 生成一次性临时密码并强制下线全部会话
 *
 * 安全约束：
 * - 临时密码仅本次响应返回一次，数据库仅存 bcrypt 哈希
 * - 重置后撤销全部 Refresh Token + access token 黑名单 + OAuth 会话 + backchannel logout
 * - 操作写入审计（user_password_reset）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { updateUserPassword } from "@/lib/password-policy";
import { validatePasswordStrength } from "@/lib/password";
import { randomInt } from "@/lib/random";
import { blacklistUserTokens } from "@/lib/token-blacklist";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

const PASSWORD_SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnpqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*",
};

/** 生成 16 位临时密码（大写/小写/数字/符号各至少一位，满足密码策略） */
function generateTempPassword(length = 16): string {
  const all =
    PASSWORD_SETS.upper + PASSWORD_SETS.lower + PASSWORD_SETS.digits + PASSWORD_SETS.symbols;
  const pick = (set: string) => set[randomInt(0, set.length)];
  const chars = [
    pick(PASSWORD_SETS.upper),
    pick(PASSWORD_SETS.lower),
    pick(PASSWORD_SETS.digits),
    pick(PASSWORD_SETS.symbols),
  ];
  while (chars.length < length) chars.push(pick(all));
  // Fisher-Yates 洗牌，避免前四位固定字符类型
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (!hasAdminPermission(admin, "users:security:write")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：重置用户密码" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request, "user:reset-password");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, phone: true, status: true },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "用户不存在" } },
        { status: 404 }
      );
    }

    const tempPassword = generateTempPassword();
    const strength = validatePasswordStrength(tempPassword);
    if (!strength.valid) {
      // 理论上不可达（随机生成必满足策略），防御性兜底避免写入弱密码
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "临时密码生成失败" } },
        { status: 500 }
      );
    }

    // 更新密码（含密码历史与过期时间），临时密码跳过历史重复检查
    const updated = await updateUserPassword(user.id, tempPassword, { skipHistoryCheck: true });
    if (!updated.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: updated.errorCode ?? "INTERNAL_ERROR", message: updated.errorMessage ?? "重置失败" },
        },
        { status: 500 }
      );
    }

    // 强制下线：撤销全部 Refresh Token + access token 黑名单 + OAuth 会话
    let revokedOAuthSessions = 0;
    try {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await blacklistUserTokens(user.id, "密码已被管理员重置");

      const activeSessions = await prisma.oAuthSession.findMany({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { clientId: true, sessionId: true },
      });
      if (activeSessions.length > 0) {
        const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
        const sids: Record<string, string> = {};
        for (const s of activeSessions) {
          if (!sids[s.clientId]) sids[s.clientId] = s.sessionId;
        }
        const result = await prisma.oAuthSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        revokedOAuthSessions = result.count;
        await sendBackchannelLogout(user.id, clientIds, { includeInactive: true, sids });
      }
    } catch (err) {
      // 会话撤销失败不阻断密码重置结果返回，但记录日志便于排查
      apiConsole.warn("[AdminResetPassword] 会话撤销失败:", err);
    }

    await createAuditLog({
      action: "user_password_reset",
      targetType: "user",
      targetId: user.id,
      detail: { phone: user.phone, revokedOAuthSessions },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        tempPassword,
        message: "密码已重置，临时密码仅显示一次，请通过安全渠道告知用户",
      },
    });
  } catch (error) {
    apiConsole.error("[AdminResetPassword] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
