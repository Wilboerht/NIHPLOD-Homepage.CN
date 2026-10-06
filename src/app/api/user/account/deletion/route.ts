/**
 * 账号自助注销申请（设计稿 docs/account-deletion-plan.md 第 6 节）
 *
 * GET    /api/user/account/deletion  查询当前进行中的注销申请（无则 request: null）
 * POST   /api/user/account/deletion  提交注销申请（密码验证 + CSRF + 用户级频控 3 次/天；幂等：
 *                                    已有 PENDING 申请直接返回既有申请；CANCELLED/FAILED 记录原位重置）
 * DELETE /api/user/account/deletion  撤回申请（仅 PENDING 可撤回，条件更新防竞态；用户级频控 5 次/天）
 *
 * 安全与口径：
 * - 微信占位手机号账号（wx_ 前缀，无密码可验）本期不支持网页端注销，引导联系客服；
 *   项目对占位账号敏感操作的现有惯例即拒绝（参见 /api/user/identities/[id] 解绑限制）
 * - 审计 createAuditLog + logAuthEvent 均只用 user id，不落明文手机号
 * - 注销不物理删除用户：到期后由执行任务匿名化（status=DELETED、phone 改 deleted_<hash>），
 *   匿名占位手机号不符合 1[3-9]\d{9} 格式，登录/发码侧天然拒绝
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { withUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { verifyPassword } from "@/lib/password";
import { createAuditLog } from "@/lib/audit";
import { logAuthEvent } from "@/lib/auth-logger";
import { hashIdentifier } from "@/lib/auth-security";
import { apiConsole } from "@/lib/logger";
import { WECHAT_PLACEHOLDER_PHONE_PREFIX } from "@/types/auth";

export const dynamic = "force-dynamic";

/** AccountDeletionRequest.status 取值（Prisma 侧为 String，应用层常量约束，与 AuditLog.action 模式一致）。
 *  注意：route 文件不允许导出非约定字段（Next 构建期路由类型校验），故不 export */
const DELETION_REQUEST_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

/** 冷静期天数：默认 7，非法值回退默认（读环境变量放在请求时，便于灰度调整与测试） */
function getCoolingDays(): number {
  const parsed = Number.parseInt(process.env.ACCOUNT_DELETION_COOLING_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7;
}

const requestSchema = z.object({
  password: z.string().min(1, "请输入密码").optional(),
  reason: z.string().max(500, "注销原因最多 500 字").optional(),
});

function toRequestPayload(request: {
  status: string;
  requestedAt: Date;
  scheduledAt: Date;
}) {
  const remainingMs = request.scheduledAt.getTime() - Date.now();
  return {
    status: request.status,
    requestedAt: request.requestedAt,
    scheduledAt: request.scheduledAt,
    remainingDays: Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
  };
}

export const GET = withUserAuth(async (_request: NextRequest, payload) => {
  try {
    const request = await prisma.accountDeletionRequest.findUnique({
      where: { userId: payload.id },
      select: { status: true, requestedAt: true, scheduledAt: true },
    });

    if (
      !request ||
      (request.status !== DELETION_REQUEST_STATUS.PENDING &&
        request.status !== DELETION_REQUEST_STATUS.RUNNING)
    ) {
      return NextResponse.json({ success: true, data: { request: null } });
    }

    return NextResponse.json({ success: true, data: { request: toRequestPayload(request) } });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 查询异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const POST = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级频控：3 次/天（防恶意注销/滥用）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion");
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: parsed.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, phone: true, password: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: { code: "ACCOUNT_NOT_ACTIVE", message: "账号状态异常，无法申请注销" } },
        { status: 403 }
      );
    }

    // 身份验证：微信占位手机号账号无密码可验，本期引导线下渠道
    if (user.phone.startsWith(WECHAT_PLACEHOLDER_PHONE_PREFIX)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PLACEHOLDER_ACCOUNT_UNSUPPORTED",
            message: "微信快捷注册的账号暂不支持网页端自助注销，请联系客服 service@nihplod.cn 办理",
          },
        },
        { status: 400 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "PASSWORD_NOT_SET", message: "请先在安全中心设置登录密码后再申请注销" },
        },
        { status: 400 }
      );
    }

    if (!parsed.data.password) {
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_REQUIRED", message: "请输入密码" } },
        { status: 400 }
      );
    }

    const passwordOk = await verifyPassword(parsed.data.password, user.password);
    if (!passwordOk) {
      logAuthEvent("user_account_deletion_request", {
        userId: user.id,
        ip: getClientIP(request),
        ua: request.headers.get("user-agent"),
        success: false,
        reason: "password_incorrect",
      });
      return NextResponse.json(
        { success: false, error: { code: "PASSWORD_INCORRECT", message: "密码错误" } },
        { status: 403 }
      );
    }

    const coolingDays = getCoolingDays();
    const scheduledAt = new Date(Date.now() + coolingDays * 24 * 60 * 60 * 1000);
    // 申请时手机号哈希（不落明文）：执行时按此清理申请时号码衍生的 LoginAttempt 等记录，
    // 覆盖冷静期内用户换绑手机号的场景
    const phoneHash = hashIdentifier(user.phone);

    // 幂等：已有 PENDING 申请直接返回既有申请；历史 CANCELLED/FAILED 记录原位重置
    // （userId 唯一约束保证同一用户仅一条申请记录）
    const existing = await prisma.accountDeletionRequest.findUnique({
      where: { userId: user.id },
    });

    // RUNNING 表示执行任务已抢占（匿名化进行中），禁止重复提交/重置，防与执行竞态
    if (existing && existing.status === DELETION_REQUEST_STATUS.RUNNING) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "DELETION_IN_PROGRESS", message: "注销正在执行中，请稍后再查询结果" },
        },
        { status: 409 }
      );
    }

    let record;
    if (existing && existing.status === DELETION_REQUEST_STATUS.PENDING) {
      record = existing;
    } else if (existing) {
      record = await prisma.accountDeletionRequest.update({
        where: { userId: user.id },
        data: {
          status: DELETION_REQUEST_STATUS.PENDING,
          reason: parsed.data.reason ?? null,
          phoneHash,
          requestedAt: new Date(),
          scheduledAt,
          cancelledAt: null,
          completedAt: null,
          attempts: 0,
          lastError: null,
        },
      });
    } else {
      try {
        record = await prisma.accountDeletionRequest.create({
          data: {
            userId: user.id,
            reason: parsed.data.reason ?? null,
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
          const raced = await prisma.accountDeletionRequest.findUnique({
            where: { userId: user.id },
          });
          if (raced && raced.status === DELETION_REQUEST_STATUS.RUNNING) {
            return NextResponse.json(
              {
                success: false,
                error: { code: "DELETION_IN_PROGRESS", message: "注销正在执行中，请稍后再查询结果" },
              },
              { status: 409 }
            );
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
      prisma.pointRedemption.count({ where: { userId: user.id, status: "PENDING" } }),
      prisma.pointBalance.findUnique({
        where: { userId: user.id },
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
      detail: { scheduledAt: scheduledAt.toISOString(), coolingDays },
      request,
    });
    logAuthEvent("user_account_deletion_request", {
      userId: user.id,
      ip: getClientIP(request),
      ua: request.headers.get("user-agent"),
      success: true,
    });

    return NextResponse.json({
      success: true,
      data: { request: toRequestPayload(record), warnings },
    });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 申请异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});

export const DELETE = withUserAuth(async (request: NextRequest, payload) => {
  try {
    // 用户级频控：5 次/天（独立于申请额度，防撤回接口被滥用探测状态）
    const limitResult = await rateLimit(`user:${payload.id}`, "account-deletion-cancel");
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "TOO_MANY_REQUESTS", message: "操作过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    // 条件更新防竞态：仅 PENDING 可撤回，concurrent 撤回/执行只会成功一次
    const cancelled = await prisma.accountDeletionRequest.updateMany({
      where: { userId: payload.id, status: DELETION_REQUEST_STATUS.PENDING },
      data: { status: DELETION_REQUEST_STATUS.CANCELLED, cancelledAt: new Date() },
    });

    if (cancelled.count === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_PENDING_REQUEST", message: "没有可撤回的注销申请" },
        },
        { status: 409 }
      );
    }

    await createAuditLog({
      action: "account_deletion_cancel",
      targetType: "user",
      targetId: payload.id,
      userId: payload.id,
      request,
    });
    logAuthEvent("user_account_deletion_cancel", {
      userId: payload.id,
      ip: getClientIP(request),
      ua: request.headers.get("user-agent"),
      success: true,
    });

    return NextResponse.json({ success: true, data: { message: "注销申请已撤回" } });
  } catch (error) {
    apiConsole.error("[AccountDeletion] 撤回异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
});
