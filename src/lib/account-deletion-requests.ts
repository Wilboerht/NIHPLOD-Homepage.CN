/**
 * 账号注销申请核心（设计稿 docs/account-deletion-plan.md 第 6 节）
 *
 * 主站会话路由（/api/user/account/deletion：Cookie + 登录密码二次验证）与
 * OAuth 资源端点（/api/oauth/account/deletion：Bearer token）共用，
 * 避免冷却期、幂等、告警与审计口径漂移。
 *
 * 安全边界：
 * - 主站通道要求密码二次验证（浏览器会话更易受 XSS 影响）；
 * - OAuth 通道以微信身份 + 短 TTL access token 为凭证（小程序用户密码为注册时
 *   自动生成、不可知），破坏性操作由冷静期（默认 7 天，可随时撤回）兜底；
 * - 两通道共用同一用户级频控桶（申请 3 次/天、撤回 5 次/天，频控在各路由入口）；
 * - 注销不物理删除用户：到期由执行任务匿名化（src/lib/account-deletion.ts）。
 *
 * 审计与请求日志仅用 user id / clientId，不落明文手机号。
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { logAuthEvent } from "@/lib/auth-logger";
import { hashIdentifier } from "@/lib/auth-security";

/** AccountDeletionRequest.status 取值（Prisma 侧为 String，应用层常量约束，与 AuditLog.action 模式一致） */
export const DELETION_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

/** 冷静期天数：默认 7，非法值回退默认（读环境变量放在请求时，便于灰度调整与测试） */
export function getCoolingDays(): number {
  const parsed = Number.parseInt(process.env.ACCOUNT_DELETION_COOLING_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7;
}

export interface DeletionRequestPayload {
  status: string;
  requestedAt: Date;
  scheduledAt: Date;
  remainingDays: number;
}

export function toDeletionRequestPayload(request: {
  status: string;
  requestedAt: Date;
  scheduledAt: Date;
}): DeletionRequestPayload {
  const remainingMs = request.scheduledAt.getTime() - Date.now();
  return {
    status: request.status,
    requestedAt: request.requestedAt,
    scheduledAt: request.scheduledAt,
    remainingDays: Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
  };
}

/** 查询进行中的注销申请（PENDING/RUNNING），无则 null */
export async function getDeletionStatus(userId: string): Promise<DeletionRequestPayload | null> {
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { userId },
    select: { status: true, requestedAt: true, scheduledAt: true },
  });

  if (
    !request ||
    (request.status !== DELETION_STATUS.PENDING && request.status !== DELETION_STATUS.RUNNING)
  ) {
    return null;
  }

  return toDeletionRequestPayload(request);
}

export type SubmitDeletionResult =
  | { ok: true; request: DeletionRequestPayload; warnings: string[] }
  | { ok: false; status: number; code: string; message: string };

/**
 * 提交注销申请（调用方须已完成身份验证：主站密码 / OAuth Bearer）。
 * 幂等：已有 PENDING 申请直接返回既有申请；RUNNING 409（执行中）；
 * 历史 CANCELLED/FAILED 记录原位重置（userId 唯一约束保证同一用户仅一条申请记录）。
 */
export async function submitDeletionRequest(params: {
  userId: string;
  reason?: string;
  via: "web" | "oauth";
  clientId?: string;
  ip?: string;
  ua?: string | null;
  request?: Request;
}): Promise<SubmitDeletionResult> {
  const { userId, reason, via, clientId, ip, ua, request } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return {
      ok: false,
      status: 403,
      code: "ACCOUNT_NOT_ACTIVE",
      message: "账号状态异常，无法申请注销",
    };
  }

  const coolingDays = getCoolingDays();
  const scheduledAt = new Date(Date.now() + coolingDays * 24 * 60 * 60 * 1000);
  // 申请时手机号哈希（不落明文）：执行时按此清理申请时号码衍生的 LoginAttempt 等记录，
  // 覆盖冷静期内用户换绑手机号的场景
  const phoneHash = hashIdentifier(user.phone);

  const existing = await prisma.accountDeletionRequest.findUnique({ where: { userId } });

  // RUNNING 表示执行任务已抢占（匿名化进行中），禁止重复提交/重置，防与执行竞态
  if (existing && existing.status === DELETION_STATUS.RUNNING) {
    return {
      ok: false,
      status: 409,
      code: "DELETION_IN_PROGRESS",
      message: "注销正在执行中，请稍后再查询结果",
    };
  }

  let record;
  if (existing && existing.status === DELETION_STATUS.PENDING) {
    record = existing;
  } else if (existing) {
    record = await prisma.accountDeletionRequest.update({
      where: { userId },
      data: {
        status: DELETION_STATUS.PENDING,
        reason: reason ?? null,
        phoneHash,
        requestedAt: new Date(),
        scheduledAt,
        cancelledAt: null,
        completedAt: null,
        attempts: 0,
        lastError: null,
        lockedAt: null,
        leaseToken: null,
      },
    });
  } else {
    try {
      record = await prisma.accountDeletionRequest.create({
        data: {
          userId,
          reason: reason ?? null,
          phoneHash,
          scheduledAt,
        },
      });
    } catch (createError) {
      // findUnique → create 竞态：并发请求已抢先创建（userId 唯一约束 P2002），
      // 回读既有申请幂等返回，不向上抛 500
      if (
        createError instanceof Prisma.PrismaClientKnownRequestError &&
        createError.code === "P2002"
      ) {
        const raced = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
        if (raced && raced.status === DELETION_STATUS.RUNNING) {
          return {
            ok: false,
            status: 409,
            code: "DELETION_IN_PROGRESS",
            message: "注销正在执行中，请稍后再查询结果",
          };
        }
        if (raced) {
          record = raced;
        } else {
          throw createError;
        }
      } else {
        throw createError;
      }
    }
  }

  // 未履约权益提示（不阻断，仅提示）：待履约的积分兑换 / 未使用的积分余额
  const [pendingRedemptions, pointBalance] = await Promise.all([
    prisma.pointRedemption.count({ where: { userId, status: "PENDING" } }),
    prisma.pointBalance.findUnique({
      where: { userId },
      select: { available: true },
    }),
  ]);
  const warnings: string[] = [];
  if (pendingRedemptions > 0) {
    warnings.push(`您有 ${pendingRedemptions} 笔积分兑换尚未履约，注销后相关权益将作废`);
  }
  if (pointBalance && pointBalance.available > 0) {
    warnings.push(`您当前有 ${pointBalance.available} 积分未使用，注销后积分将作废`);
  }

  await createAuditLog({
    action: "account_deletion_request",
    targetType: "user",
    targetId: user.id,
    userId: user.id,
    detail: { scheduledAt: scheduledAt.toISOString(), coolingDays, via },
    request,
  });
  logAuthEvent("user_account_deletion_request", {
    userId: user.id,
    ip,
    ua,
    success: true,
    ...(clientId ? { clientId } : {}),
  });

  return { ok: true, request: toDeletionRequestPayload(record), warnings };
}

export type CancelDeletionResult =
  { ok: true } | { ok: false; status: number; code: string; message: string };

/** 撤回注销申请（仅 PENDING 可撤回，条件更新防竞态；调用方须已完成身份验证） */
export async function cancelDeletionRequest(params: {
  userId: string;
  via: "web" | "oauth";
  clientId?: string;
  ip?: string;
  ua?: string | null;
  request?: Request;
}): Promise<CancelDeletionResult> {
  const { userId, via, clientId, ip, ua, request } = params;

  // 条件更新防竞态：仅 PENDING 可撤回，concurrent 撤回/执行只会成功一次
  const cancelled = await prisma.accountDeletionRequest.updateMany({
    where: { userId, status: DELETION_STATUS.PENDING },
    data: { status: DELETION_STATUS.CANCELLED, cancelledAt: new Date() },
  });

  if (cancelled.count === 0) {
    return {
      ok: false,
      status: 409,
      code: "NO_PENDING_REQUEST",
      message: "没有可撤回的注销申请",
    };
  }

  await createAuditLog({
    action: "account_deletion_cancel",
    targetType: "user",
    targetId: userId,
    userId,
    detail: { via },
    request,
  });
  logAuthEvent("user_account_deletion_cancel", {
    userId,
    ip,
    ua,
    success: true,
    ...(clientId ? { clientId } : {}),
  });

  return { ok: true };
}
