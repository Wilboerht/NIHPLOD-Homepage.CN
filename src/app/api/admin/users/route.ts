/**
 * 管理端用户列表 API
 * GET /api/admin/users
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAuth, checkAdminRateLimit } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { maskPhone } from "@/lib/mask-phone";

const querySchema = z.object({
  page: z.preprocess((val) => (val ? Number(val) : 1), z.number().min(1)),
  pageSize: z.preprocess((val) => (val ? Number(val) : 20), z.number().min(1).max(100)),
  search: z.string().max(100).nullish(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).nullish(),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    // 速率限制：防止用户列表被高频爬取（含手机号等 PII）
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
      search: searchParams.get("search"),
      status: searchParams.get("status"),
    });
    const isExport = searchParams.get("export") === "csv";

    // 构建查询条件
    const where: Record<string, unknown> = {};

    if (params.search) {
      where.OR = [
        { id: { equals: params.search } },
        { phone: { contains: params.search, mode: "insensitive" } },
        { nickname: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    // 查询用户
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: isExport ? undefined : (params.page - 1) * params.pageSize,
        take: isExport ? 10000 : params.pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          phone: true,
          phoneVerified: true,
          nickname: true,
          avatar: true,
          status: true,
          membershipLevel: true,
          totalPoints: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // CSV 导出（按当前筛选条件）
    if (isExport) {
      const escapeCSV = (val: string): string => {
        const sanitized = /^[=+\-@]/.test(val) ? `'${val}` : val;
        if (/[",\n\r]/.test(sanitized)) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      };

      const csvHeaders = "手机号,昵称,状态,会员等级,积分,注册时间\n";
      const csvRows = users
        .map((user) =>
          [
            escapeCSV(maskPhone(user.phone)),
            escapeCSV(user.nickname || ""),
            escapeCSV(user.status),
            escapeCSV(user.membershipLevel),
            user.totalPoints,
            user.createdAt.toISOString(),
          ].join(",")
        )
        .join("\n");

      return new NextResponse(csvHeaders + csvRows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        users: users.map((user) => ({
          ...user,
          phone: maskPhone(user.phone),
          createdAt: user.createdAt.toISOString(),
        })),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total,
          totalPages: Math.ceil(total / params.pageSize),
        },
      },
    });
  } catch (error) {
    apiConsole.error("[AdminUsers] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

/**
 * 批量修改用户状态（冻结/封禁/恢复正常）
 * POST /api/admin/users/batch
 * Body: { ids: string[], status: "ACTIVE" | "SUSPENDED" | "BANNED" }
 * 仅 owner 角色可操作（涉及用户权益）
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }
    if (admin.role !== "owner") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "仅超级管理员可批量修改用户状态" } },
        { status: 403 }
      );
    }

    const { validateCSRFToken, csrfForbiddenResponse } = await import("@/lib/csrf");
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const rateLimitResponse = await checkAdminRateLimit(request);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(200),
        status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
      })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { ids, status } = parsed.data;

    // 批量与单个端点共用同一套级联逻辑（cascadeUserStatusChange）：
    // 冻结/封禁时撤销 Refresh Token + access token 黑名单 + OAuth 会话 + backchannel logout + webhook；
    // 解封时移出黑名单。逐个用户级联（量小，ids ≤ 200），外部通知失败不阻断整体流程。
    const targets = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    // 跳过状态未变化的用户，避免无效的级联与审计噪音
    const toChange = targets.filter((u) => u.status !== status);

    if (toChange.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toChange.map((u) => u.id) } },
        data: { status },
      });

      const { cascadeUserStatusChange } = await import("@/lib/user-status");
      const { recordSsoEvent } = await import("@/lib/sso-audit");
      for (const u of toChange) {
        await cascadeUserStatusChange({
          userId: u.id,
          previousStatus: u.status,
          newStatus: status,
        });
        // SSO 审计：每个实际变更的用户一条（合规敏感，与单个端点一致同步等待写入）
        await recordSsoEvent({
          event: "status_change",
          userId: u.id,
          ip: getClientIP(request),
          success: true,
          detail: {
            action:
              status === "ACTIVE"
                ? "user_unbanned"
                : status === "SUSPENDED"
                  ? "user_suspended"
                  : "user_banned",
            previousStatus: u.status,
            newStatus: status,
            adminId: admin.id,
            batch: true,
          },
        });
      }
    }

    // 记录审计日志（批量操作写一条汇总审计，detail 携带全部目标 id）
    const { createAuditLog } = await import("@/lib/audit");
    await createAuditLog({
      action: "user_status_change",
      targetType: "user",
      targetId: ids[0],
      detail: { ids, status, count: toChange.length },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { updated: toChange.length },
    });
  } catch (error) {
    apiConsole.error("[AdminUsersBatch] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
