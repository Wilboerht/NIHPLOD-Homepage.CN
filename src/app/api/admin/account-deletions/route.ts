/**
 * 管理端账号注销申请 API
 * GET  /api/admin/account-deletions - 注销申请列表（默认 FAILED，支持 status 筛选；手机号脱敏）
 * POST /api/admin/account-deletions - 人工重试（body: { id }）：
 *       仅 FAILED 可重试，同步调用 executeAccountDeletion 立即执行并返回结果
 *       （比重置回 PENDING 等下轮 cron 更优：管理员能立即看到成败）
 *
 * 权限：读 users:read（用户安全信息查看）；重试 users:security:write（资金/安全类，
 * 注销执行不可逆，与重置密码/积分调整同级别）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { maskPhone } from "@/lib/mask-phone";
import { executeAccountDeletion, DELETION_STATUS } from "@/lib/account-deletion";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1).max(1000)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  status: z
    .enum([
      DELETION_STATUS.PENDING,
      DELETION_STATUS.RUNNING,
      DELETION_STATUS.CANCELLED,
      DELETION_STATUS.COMPLETED,
      DELETION_STATUS.FAILED,
    ])
    .nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    if (!hasAdminPermission(admin, "users:read")) {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户查看" } },
        { status: 403 }
      );
    }

    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status: searchParams.get("status"),
    });

    // 默认展示 FAILED（人工介入主场景）
    const status = params.status ?? DELETION_STATUS.FAILED;
    const where = { status };
    const [requests, total] = await Promise.all([
      prisma.accountDeletionRequest.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { requestedAt: "desc" },
        select: {
          id: true,
          userId: true,
          status: true,
          reason: true,
          requestedAt: true,
          scheduledAt: true,
          cancelledAt: true,
          completedAt: true,
          attempts: true,
          lastError: true,
        },
      }),
      prisma.accountDeletionRequest.count({ where }),
    ]);

    // 关联用户信息（手机号脱敏展示；已匿名用户显示占位号原样）
    const userIds = [...new Set(requests.map((r) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, phone: true, nickname: true, status: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = requests.map((r) => {
      const user = userMap.get(r.userId);
      return {
        ...r,
        userPhone: user ? maskPhone(user.phone) : null,
        userNickname: user?.nickname ?? null,
        userStatus: user?.status ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminAccountDeletions] 列表异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

const retrySchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: NextRequest) {
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
        { success: false, error: { code: "FORBIDDEN", message: "权限不足：用户安全操作" } },
        { status: 403 }
      );
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success || !validateCUID(parsed.data.id)) {
      return invalidIdResponse();
    }
    const { id } = parsed.data;

    const deletionRequest = await prisma.accountDeletionRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, attempts: true },
    });
    if (!deletionRequest) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "注销申请不存在" } },
        { status: 404 }
      );
    }

    // 仅 FAILED 允许人工重试：PENDING 等 cron 自然到期，RUNNING 执行中，
    // COMPLETED/CANCELLED 已是终态，重试均无意义且可能引发竞态
    if (deletionRequest.status !== DELETION_STATUS.FAILED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RETRY_NOT_ALLOWED",
            message: `当前状态（${deletionRequest.status}）不可重试，仅失败的申请支持人工重试`,
          },
        },
        { status: 409 }
      );
    }

    const result = await executeAccountDeletion(id);

    await createAuditLog({
      action: "account_deletion_retry",
      targetType: "user",
      targetId: deletionRequest.userId,
      detail: { requestId: id, result, previousAttempts: deletionRequest.attempts },
      adminId: admin.id,
      request,
    });

    const message =
      result === "completed"
        ? "重试成功，账号已完成注销"
        : result === "skipped"
          ? "申请状态已变化（可能被并发执行或撤回），请刷新查看最新状态"
          : "重试仍失败，请查看失败原因或稍后再试";

    return NextResponse.json({ success: true, data: { status: result, message } });
  } catch (error) {
    apiConsole.error("[AdminAccountDeletions] 重试异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
