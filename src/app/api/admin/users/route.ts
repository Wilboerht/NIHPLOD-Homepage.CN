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
          _count: { select: { orders: true } },
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

      const csvHeaders = "手机号,昵称,状态,会员等级,积分,订单数,注册时间\n";
      const csvRows = users
        .map((user) =>
          [
            escapeCSV(maskPhone(user.phone)),
            escapeCSV(user.nickname || ""),
            escapeCSV(user.status),
            escapeCSV(user.membershipLevel),
            user.totalPoints,
            user._count.orders,
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
          orderCount: user._count.orders,
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

    // 防止误操作管理员自己
    const result = await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    // 记录审计日志
    const { createAuditLog } = await import("@/lib/audit");
    await createAuditLog({
      action: "user_status_change",
      targetType: "user",
      targetId: ids[0],
      detail: { ids, status, count: result.count },
      adminId: admin.id,
      request,
    });

    return NextResponse.json({
      success: true,
      data: { updated: result.count },
    });
  } catch (error) {
    apiConsole.error("[AdminUsersBatch] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
