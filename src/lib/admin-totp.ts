/**
 * 资金类操作二次验证（TOTP）
 *
 * 适用：积分人工调整、消费补录审核/撤销、消费记录导入/撤销、兑换取消退分。
 * - 默认强制：管理员须先启用 TOTP，并在操作请求中携带一次性验证码（或备用码）
 * - 可用环境变量 ADMIN_TOTP_ENFORCE=false 临时关闭（灰度/应急），关闭时不校验
 * - 备用码使用后立即消费，避免重复可用
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyTOTP, decryptTOTPSecret, verifyBackupCode } from "@/lib/totp";
import { apiConsole } from "@/lib/logger";

export type AdminTotpErrorCode = "TOTP_NOT_ENABLED" | "TOTP_REQUIRED" | "TOTP_INVALID";

/** 是否强制资金类操作二次验证（默认开启） */
export function isMoneyOperationTotpEnforced(): boolean {
  return process.env.ADMIN_TOTP_ENFORCE !== "false";
}

/**
 * 校验资金类操作的二次验证码。
 * @returns null 校验通过；否则返回可直接下发的 400 响应
 */
export async function requireMoneyOperationTotp(
  adminId: string,
  code?: string | null
): Promise<NextResponse | null> {
  if (!isMoneyOperationTotpEnforced()) return null;

  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });

  if (!admin) {
    return totpError("TOTP_INVALID", "管理员不存在");
  }
  if (!admin.totpEnabled || !admin.totpSecret) {
    return totpError("TOTP_NOT_ENABLED", "请先在「安全设置」启用二次验证后再执行该操作");
  }

  const trimmed = code?.trim();
  if (!trimmed || trimmed.length < 6) {
    return totpError("TOTP_REQUIRED", "请输入二次验证码以确认该操作");
  }

  // 1) 动态验证码
  try {
    const secret = decryptTOTPSecret(admin.totpSecret);
    if (verifyTOTP(trimmed, secret)) return null;
  } catch (err) {
    apiConsole.warn("[AdminTotp] 密钥解密失败:", err);
  }

  // 2) 备用码（命中后消费，保证一次性）
  if (admin.totpBackupCodes) {
    const backupResult = verifyBackupCode(trimmed, admin.totpBackupCodes);
    if (backupResult) {
      await prisma.admin
        .update({
          where: { id: adminId },
          data: { totpBackupCodes: JSON.stringify(backupResult.remainingCodes) },
        })
        .catch((err) => apiConsole.warn("[AdminTotp] 备用码消费失败:", err));
      return null;
    }
  }

  return totpError("TOTP_INVALID", "二次验证码错误");
}

function totpError(code: AdminTotpErrorCode, message: string): NextResponse {
  return NextResponse.json({ success: false, error: { code, message } }, { status: 400 });
}
