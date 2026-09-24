/**
 * OAuth 资源端点共用的账户状态校验
 *
 * userinfo / membership / spent-adjustments 等 Bearer 资源端点在验签后
 * 需确认账户存在且为 ACTIVE（区分"不存在"404 与"已禁用"403），
 * 避免各端点重复实现且口径漂移。
 */
import { prisma } from "@/lib/prisma";

/**
 * 账户可用判据：状态必须为 ACTIVE。
 * 供"状态校验与资料读取合并为一次查询"的端点复用（如 userinfo 读取用户档案时顺带判定）。
 * 类型谓词形式，便于调用处 `if (!isActiveAccount(user)) return` 后收窄非空类型。
 */
export function isActiveAccount<T extends { status: string }>(
  user: T | null | undefined
): user is T {
  return !!user && user.status === "ACTIVE";
}

export type OAuthUserGuardFailureReason = "user_not_found" | "account_disabled";

export type OAuthUserGuardResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      errorDescription: string;
      /** 失败原因：调用方据此写 SSO 审计（与 status 一一对应） */
      reason: OAuthUserGuardFailureReason;
    };

export async function guardOAuthUserActive(userId: string): Promise<OAuthUserGuardResult> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!account) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      errorDescription: "用户不存在",
      // 审计沿用 membership 端点历史取值（user_not_found），保持 SSO 审计可查询性
      reason: "user_not_found",
    };
  }
  if (!isActiveAccount(account)) {
    return {
      ok: false,
      status: 403,
      error: "account_disabled",
      errorDescription: "账户已被封禁或冻结",
      reason: "account_disabled",
    };
  }
  return { ok: true };
}
