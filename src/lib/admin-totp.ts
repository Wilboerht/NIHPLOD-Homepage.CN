/**
 * 资金类操作二次验证（TOTP）
 *
 * 适用：积分人工调整、消费补录审核/撤销、消费记录导入/撤销、兑换取消退分。
 * - 默认强制：管理员须先启用 TOTP，并在操作请求中携带一次性验证码（或备用码）
 * - 可用环境变量 ADMIN_TOTP_ENFORCE=false 临时关闭（灰度/应急），关闭时不校验并输出告警
 * - 备用码使用后立即消费（消费失败 fail-closed 拒绝），避免重复可用
 */
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { verifyTOTP, decryptTOTPSecret } from "@/lib/totp";
import { consumeAdminBackupCode } from "@/lib/admin-backup-code";
import { consumeAccessTokenOnce } from "@/lib/token-blacklist";
import { apiConsole } from "@/lib/logger";
import { verifyAdminStepUpGrant } from "@/lib/admin-step-up";
import { rateLimit } from "@/lib/ratelimit";
import type { AdminJWTPayload } from "@/types/auth";

export type AdminTotpErrorCode = "TOTP_NOT_ENABLED" | "TOTP_REQUIRED" | "TOTP_INVALID";

export interface AdminStepUpContext {
  request: NextRequest;
  admin: Pick<AdminJWTPayload, "id" | "ver" | "jti">;
}

/**
 * 是否强制资金类操作二次验证（默认开启）
 * 应急开关关闭时首次调用输出告警，避免生产环境静默裸奔
 */
let enforceDisabledWarned = false;
export function isMoneyOperationTotpEnforced(): boolean {
  if (process.env.ADMIN_TOTP_ENFORCE === "false") {
    if (!enforceDisabledWarned) {
      enforceDisabledWarned = true;
      apiConsole.warn(
        "[AdminTotp] 资金类操作二次验证已被 ADMIN_TOTP_ENFORCE=false 关闭，" +
          "所有资金类操作将仅凭密码执行，请确认这是预期配置（生产环境应保持开启）"
      );
    }
    return false;
  }
  return true;
}

/**
 * TOTP 校验的统一尝试限流（按管理员账号，而非 IP）。
 * 资金/不可逆操作此前只有通用的 30 次/分钟限流，持有会话即可爆破 6 位验证码。
 */
async function enforceTotpAttemptLimit(adminId: string): Promise<NextResponse | null> {
  const limiter = await rateLimit(`admin-totp-op:${adminId}`, "admin-totp");
  if (limiter.success) return null;
  const retryAfter = Math.max(1, Math.ceil((limiter.reset - Date.now()) / 1000));
  return NextResponse.json(
    {
      success: false,
      error: { code: "TOTP_RATE_LIMITED", message: "验证尝试过于频繁，请稍后再试" },
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

async function verifyTotpCode(adminId: string, code?: string | null): Promise<NextResponse | null> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });

  if (!admin) {
    return totpError("TOTP_INVALID", "管理员不存在");
  }
  if (!admin.totpEnabled || !admin.totpSecret) {
    return totpError("TOTP_NOT_ENABLED", "请先在「管理员安全中心」启用二次验证后再执行该操作");
  }

  const trimmed = code?.trim();
  if (!trimmed || trimmed.length < 6) {
    return totpError("TOTP_REQUIRED", "请输入二次验证码以确认该操作");
  }

  // 1) 动态验证码（一次性：同一验证码在有效窗口内跨实例防重放）
  try {
    const secret = decryptTOTPSecret(admin.totpSecret);
    if (verifyTOTP(trimmed, secret)) {
      // 一次性：原子消费（唯一约束插入，冲突即重放），消除 check-then-set 的 TOCTOU
      // 窗口——两个并发请求不再能用同一验证码双双通过；存储故障时 fail-closed 拒绝
      const replayKey = `totp:${adminId}:${trimmed}`;
      if (!(await consumeAccessTokenOnce(replayKey))) {
        apiConsole.warn("[AdminTotp] 检测到 TOTP 重放或存储不可用:", adminId);
        return totpError("TOTP_INVALID", "验证码已被使用，请等待下一次刷新");
      }
      return null;
    }
  } catch (err) {
    apiConsole.warn("[AdminTotp] 密钥解密失败:", err);
  }

  // 2) 备用码：CAS 原子消费，命中后才算通过
  if (admin.totpBackupCodes) {
    try {
      const consumed = await consumeAdminBackupCode(adminId, trimmed, admin.totpBackupCodes);
      if (consumed.ok) return null;
      if (consumed.reason === "conflict") {
        apiConsole.warn("[AdminTotp] 备用码已被并发消费:", adminId);
        return totpError("TOTP_INVALID", "验证码已被使用，请稍后重试");
      }
    } catch (err) {
      apiConsole.warn("[AdminTotp] 备用码消费失败（fail-closed）:", err);
      return totpError("TOTP_INVALID", "验证码校验失败，请稍后重试");
    }
  }

  return totpError("TOTP_INVALID", "二次验证码错误");
}

/**
 * 校验资金类操作的二次验证码。
 * @returns null 校验通过；否则返回可直接下发的 400 响应
 */
export async function requireMoneyOperationTotp(
  adminId: string,
  code?: string | null,
  stepUp?: AdminStepUpContext
): Promise<NextResponse | null> {
  if (!isMoneyOperationTotpEnforced()) return null;

  if (
    stepUp &&
    stepUp.admin.id === adminId &&
    (await verifyAdminStepUpGrant(stepUp.request, stepUp.admin))
  ) {
    return null;
  }

  const limited = await enforceTotpAttemptLimit(adminId);
  if (limited) return limited;

  return verifyTotpCode(adminId, code);
}

/**
 * 强制新鲜 TOTP：不接受 step-up 缓存，也不受 ADMIN_TOTP_ENFORCE=false 影响。
 * 用于不可逆操作（审计到期清理、法律保留）。
 */
export async function requireFreshAdminTotp(
  adminId: string,
  code?: string | null
): Promise<NextResponse | null> {
  const limited = await enforceTotpAttemptLimit(adminId);
  if (limited) return limited;

  return verifyTotpCode(adminId, code);
}

/**
 * 身份安全类操作（改密等）：与资金类共用 TOTP/备用码校验，
 * 但**永远不读取 ADMIN_TOTP_ENFORCE 应急开关**，避免运维临时关闭资金校验时
 * 连带关闭改密二次验证。
 */
export async function requireSecurityOperationTotp(
  adminId: string,
  code?: string | null,
  stepUp?: AdminStepUpContext
): Promise<NextResponse | null> {
  if (
    stepUp &&
    stepUp.admin.id === adminId &&
    (await verifyAdminStepUpGrant(stepUp.request, stepUp.admin))
  ) {
    return null;
  }

  const limited = await enforceTotpAttemptLimit(adminId);
  if (limited) return limited;

  return verifyTotpCode(adminId, code);
}

function totpError(code: AdminTotpErrorCode, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status: 400 });
}

/**
 * 高风险操作的统一 step-up 校验。
 *
 * 与资金类操作共用同一短时授权（/api/admin/step-up + HttpOnly Cookie）：
 * - 无授权时返回 TOTP_REQUIRED，前端用 useTotpConfirm 拉起一次验证；
 * - 未启用 TOTP 时返回 TOTP_NOT_ENABLED，引导先完成二次验证设置；
 * - 授权绑定管理员/会话/tokenVersion，改密、改权限、登出后自动失效。
 *
 * 适用于：用户删除、管理员账号/角色/权限变更、break-glass 查看、
 * OAuth Client 密钥轮换/缩权、分类编辑等。
 */
export async function requireAdminStepUp(
  request: NextRequest,
  admin: Pick<AdminJWTPayload, "id" | "ver" | "jti">
): Promise<NextResponse | null> {
  // 管理员安全类 step-up 永不受 ADMIN_TOTP_ENFORCE（资金类应急开关）影响。
  // 该开关只允许临时关闭资金操作校验，不能关闭管理员账号/权限/删除/导出等保护。
  if (await verifyAdminStepUpGrant(request, admin)) return null;

  const adminRow = await prisma.admin.findUnique({
    where: { id: admin.id },
    select: { totpEnabled: true, totpSecret: true },
  });
  if (!adminRow) return totpError("TOTP_INVALID", "管理员不存在");
  if (!adminRow.totpEnabled || !adminRow.totpSecret) {
    return totpError("TOTP_NOT_ENABLED", "请先在「管理员安全中心」启用二次验证后再执行该操作");
  }
  return totpError("TOTP_REQUIRED", "请输入二次验证码以确认该操作");
}
